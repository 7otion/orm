/**
 * Singleton holding the adapter, dialect and transaction state.
 * Initialised once at startup.
 */

import type { DatabaseAdapter, TransactionalAdapter } from './adapter';
import type { SqlDialect } from './dialect';
import {
	type InstanceChangeListener,
	instanceChanges,
} from './instance-changes';
import {
	ListenerError,
	Transaction,
	calledFromTransactionBody,
	ormTransactionBody,
} from './transaction';

export interface ORMConfig {
	adapter: DatabaseAdapter;
	dialect: SqlDialect;
	/** Serialises writes. Required for SQLite, which cannot write concurrently. */
	enableWriteQueue?: boolean;
	/** How long a write may sit held behind a transaction before warning. */
	watchdogMs?: number;
}

const TRANSACTION_METHODS = [
	'beginTransaction',
	'commit',
	'rollback',
	'inTransaction',
] as const;

export class ORM {
	private static instance: ORM | null = null;

	private adapter: DatabaseAdapter;
	/** The same adapter when it implements `TransactionalAdapter`, otherwise null. */
	private transactions: TransactionalAdapter | null;
	private dialect: SqlDialect;
	private enableWriteQueue: boolean = false;
	private watchdogMs: number;

	/** The book: one serial chain. A unit of writes is itself an entry in it. */
	private book: Promise<unknown> = Promise.resolve();

	private active: Transaction | null = null;

	private constructor(config: ORMConfig) {
		this.adapter = config.adapter;
		this.transactions = ORM.transactionsOf(config.adapter);
		this.dialect = config.dialect;
		this.enableWriteQueue = config.enableWriteQueue ?? false;
		this.watchdogMs = config.watchdogMs ?? 2000;
	}

	static initialize(config: ORMConfig): void {
		if (!ORM.instance) {
			ORM.instance = new ORM(config);
		}
	}

	static async reInitialize(config: ORMConfig): Promise<void> {
		// Built first, so a refused config leaves the current connection open.
		const next = new ORM(config);

		if (ORM.instance) {
			await ORM.instance.close();
		}

		ORM.instance = next;
	}

	static getInstance(): ORM {
		if (!ORM.instance) {
			throw new Error(
				'ORM not initialized. Call ORM.initialize() first.',
			);
		}
		return ORM.instance;
	}

	getAdapter(): DatabaseAdapter {
		return this.adapter;
	}

	async close(): Promise<void> {
		await this.adapter.close();
	}

	getDialect(): SqlDialect {
		return this.dialect;
	}

	/**
	 * Runs the callback in a transaction, committing on success and rolling back
	 * on throw. Given an open transaction's handle, it runs inside that one instead.
	 */
	async transaction<T>(
		callback: (tx: Transaction) => Promise<T>,
		tx?: Transaction,
		label: string = 'transaction()',
	): Promise<T> {
		if (!this.transactions) {
			throw this.unsupported(label);
		}

		return this.queueUnit(
			async unit => {
				await this.ensureAtomic(unit, Infinity, label);
				// Re-entered, as the await above left the marker frame behind.
				return ormTransactionBody(callback, unit);
			},
			tx,
			label,
		);
	}

	/**
	 * Runs work as one queued unit that holds other writes back until it ends.
	 * Given a unit's handle, it runs inside that unit instead.
	 */
	async queueUnit<T>(
		work: (unit: Transaction) => Promise<T>,
		tx?: Transaction,
		label: string = 'A write',
	): Promise<T> {
		if (tx) {
			return this.queueWrite(
				() => ormTransactionBody(work, tx),
				tx,
				label,
			);
		}

		if (this.active && calledFromTransactionBody()) {
			throw this.missingHandle(label);
		}

		const unit = new Transaction();

		const result = await this.enqueue(
			() => this.runUnit(unit, work, label),
			label,
		);

		// The queue is released, so a listener's own write cannot wait on itself.
		const failures = await unit.notify(models =>
			instanceChanges.report(models),
		);
		if (failures.length > 0) {
			throw new ListenerError(result, failures);
		}

		return result;
	}

	/**
	 * Told which instances a committed write or a `refresh()` changed. Static,
	 * so it outlives `reInitialize`. Returns the unsubscribe.
	 */
	static onInstanceChange(listener: InstanceChangeListener): () => void {
		return instanceChanges.on(listener);
	}

	/**
	 * Begins the unit before a hook can write. Without transactions the unit
	 * still runs, but a nested write into it is refused.
	 */
	async beginForHooks(unit: Transaction, label: string): Promise<void> {
		if (unit.hasBegun()) return;

		if (!this.transactions) {
			unit.refuseNestedWrites(label);
			return;
		}

		await this.transactions.beginTransaction();
		unit.markBegun();
	}

	/**
	 * Issues BEGIN for a unit whose work spans several statements. Must be called
	 * before the unit's first write; refuses on an adapter without transactions.
	 */
	async ensureAtomic(
		unit: Transaction,
		statements: number,
		label: string,
	): Promise<void> {
		if (statements <= 1 || unit.hasBegun()) return;

		if (!this.transactions) {
			throw this.unsupported(label, statements);
		}

		await this.transactions.beginTransaction();
		unit.markBegun();
	}

	/**
	 * Serialises a write behind any in flight. One carrying the open unit's handle
	 * runs immediately; reads are never queued.
	 */
	async queueWrite<T>(
		operation: () => Promise<T>,
		tx?: Transaction,
		label?: string,
	): Promise<T> {
		if (tx) {
			if (tx !== this.active || !tx.isOpen()) {
				throw new Error(
					`[orm] This transaction has already ended, so ${label ?? 'this write'} cannot join it. ` +
						`A tx handle is only valid inside the transaction() callback that received it.`,
				);
			}
			if (tx.wasRolledBackByDatabase()) {
				throw this.rolledBackByDatabase(label ?? 'This write');
			}
			const refusedBy = tx.nestedWritesRefusedBy();
			if (refusedBy) {
				throw this.hookWriteUnsupported(refusedBy, label);
			}
			if (!tx.hasBegun()) {
				return operation();
			}

			try {
				return await operation();
			} catch (error) {
				await this.noticeDatabaseRollback(tx);
				throw error;
			}
		}

		if (this.active) {
			if (calledFromTransactionBody()) {
				throw this.missingHandle(label);
			}
			return this.enqueue(operation, label);
		}

		if (!this.enableWriteQueue) {
			return operation();
		}

		return this.enqueue(operation);
	}

	/** Must be called from the book: the unit is its own entry. */
	private async runUnit<T>(
		unit: Transaction,
		work: (unit: Transaction) => Promise<T>,
		label: string,
	): Promise<T> {
		// Set before any statement, so a write issued meanwhile is held.
		this.active = unit;

		try {
			const result = await ormTransactionBody(work, unit);

			if (unit.hasBegun()) {
				if (unit.wasRolledBackByDatabase()) {
					throw this.rolledBackByDatabase(label);
				}
				await this.transactions!.commit();
			}

			return result;
		} catch (error) {
			if (unit.hasBegun()) await this.rollbackAfterFailure();
			throw error;
		} finally {
			unit.close();
			this.active = null;
		}
	}

	/** A write inside a transaction failed; SQLite may have rolled the whole transaction back. */
	private async noticeDatabaseRollback(unit: Transaction): Promise<void> {
		if (!(await this.transactions!.inTransaction())) {
			unit.markRolledBackByDatabase();
		}
	}

	/** A failed rollback is reported rather than thrown, so the error that caused it survives. */
	private async rollbackAfterFailure(): Promise<void> {
		try {
			if (await this.transactions!.inTransaction()) {
				await this.transactions!.rollback();
			}
		} catch (rollbackError) {
			console.error(
				'[orm] Rolling back after a failed transaction failed too; the original error is rethrown.',
				rollbackError,
			);
		}
	}

	private missingHandle(label?: string): Error {
		return new Error(
			`[orm] ${label ?? 'A write'} was issued inside transaction() without its tx handle, ` +
				`so it would be held until the transaction ends and the transaction would ` +
				`wait on it. Pass the handle: transaction(async tx => { await …(tx) }).`,
		);
	}

	private rolledBackByDatabase(label: string): Error {
		return new Error(
			`[orm] ${label} cannot continue: a statement inside its transaction failed and the ` +
				`database rolled the whole transaction back, so nothing in it was committed.`,
		);
	}

	/** `statements` is omitted when the work cannot be counted, as with `transaction()`. */
	private unsupported(label: string, statements?: number): Error {
		const adapter = this.adapter.constructor?.name ?? 'The adapter';

		if (statements === undefined) {
			return new Error(
				`[orm] ${label} needs a transaction, and ${adapter} does not implement TransactionalAdapter.`,
			);
		}

		// Infinity: hooks may write, so the count is unknowable.
		const count = Number.isFinite(statements) ? statements : 'several';

		return new Error(
			`[orm] ${label} needs ${count} statements to land together, and ${adapter} does not ` +
				`implement TransactionalAdapter. Split the work into calls that each fit one statement, ` +
				`or use an adapter that supports transactions.`,
		);
	}

	private hookWriteUnsupported(hookedWrite: string, label?: string): Error {
		const adapter = this.adapter.constructor?.name ?? 'The adapter';

		return new Error(
			`[orm] ${label ?? 'A write'} was issued by a hook of ${hookedWrite}, which needs a ` +
				`transaction to land with it, and ${adapter} does not implement TransactionalAdapter.`,
		);
	}

	/** Appends to the book, warning if a unit holds it up for too long. */
	private enqueue<T>(
		operation: () => Promise<T>,
		label?: string,
	): Promise<T> {
		const held = this.active ? this.warnIfHeld(label) : null;

		const result = this.book.then(() => {
			if (held) clearTimeout(held);
			return operation();
		});

		// Errors must not break the chain for everything behind them.
		this.book = result.catch(() => {});
		return result;
	}

	private warnIfHeld(label?: string): ReturnType<typeof setTimeout> {
		return setTimeout(() => {
			console.warn(
				`[orm] ${label ?? 'A write'} has been waiting ${this.watchdogMs}ms for an open ` +
					`transaction to finish. It will run once the transaction ends. If it was issued ` +
					`inside that transaction's callback, it is missing its tx handle and the ` +
					`transaction will wait on it forever.`,
			);
		}, this.watchdogMs);
	}

	/** An adapter implementing only some of the transaction methods is refused outright. */
	private static transactionsOf(
		adapter: DatabaseAdapter,
	): TransactionalAdapter | null {
		const candidate = adapter as Partial<TransactionalAdapter>;
		const present = TRANSACTION_METHODS.filter(
			method => typeof candidate[method] === 'function',
		);

		if (present.length === 0) return null;
		if (present.length === TRANSACTION_METHODS.length) {
			return adapter as TransactionalAdapter;
		}

		const missing = TRANSACTION_METHODS.filter(
			method => !present.includes(method),
		);
		throw new Error(
			`[orm] ${adapter.constructor?.name ?? 'The adapter'} implements part of TransactionalAdapter ` +
				`but not ${missing.join(', ')}. Implement all of it, or none.`,
		);
	}
}
