/**
 * Singleton holding the adapter, dialect and transaction state.
 * Initialised once at startup.
 */

import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';
import {
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

export class ORM {
	private static instance: ORM | null = null;

	private adapter: DatabaseAdapter;
	private dialect: SqlDialect;
	private enableWriteQueue: boolean = false;
	private watchdogMs: number;

	/** The book: one serial chain. A transaction is itself an entry in it. */
	private book: Promise<unknown> = Promise.resolve();

	private active: Transaction | null = null;

	private constructor(config: ORMConfig) {
		this.adapter = config.adapter;
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
		if (ORM.instance) {
			await ORM.instance.close();
		}

		ORM.instance = new ORM(config);
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
		if (tx) {
			return this.queueWrite(
				() => ormTransactionBody(callback, tx),
				tx,
				label,
			);
		}

		if (this.active && calledFromTransactionBody()) {
			throw this.missingHandle(label);
		}

		// Queued like any write, so it runs after whatever is already pending
		// and everything issued later runs after it.
		return this.enqueue(() => this.runTransaction(callback), label);
	}

	/**
	 * Serialises a write behind any already in flight. A write carrying the open
	 * transaction's handle runs immediately: it is that transaction, and queuing
	 * it would make the transaction wait on itself. Reads are never queued.
	 */
	async queueWrite<T>(
		operation: () => Promise<T>,
		tx?: Transaction,
		label?: string,
	): Promise<T> {
		if (tx) {
			if (tx !== this.active) {
				throw new Error(
					`[orm] This transaction has already ended, so ${label ?? 'this write'} cannot join it. ` +
						`A tx handle is only valid inside the transaction() callback that received it.`,
				);
			}
			return operation();
		}

		if (this.active) {
			// Reading the stack is affordable here: only an untokened write
			// during a transaction reaches it.
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

	/** Must be called from the book: the transaction is its own entry. */
	private async runTransaction<T>(
		callback: (tx: Transaction) => Promise<T>,
	): Promise<T> {
		const tx = new Transaction();
		// Set before BEGIN, so a write issued while it is in flight is held.
		this.active = tx;

		try {
			await this.adapter.beginTransaction();

			try {
				const result = await ormTransactionBody(callback, tx);
				await this.adapter.commit();
				return result;
			} catch (error) {
				await this.rollbackAfterFailure();
				throw error;
			}
		} finally {
			tx.close();
			this.active = null;
		}
	}

	/** A failed rollback is reported rather than thrown, so the error that caused it survives. */
	private async rollbackAfterFailure(): Promise<void> {
		try {
			await this.adapter.rollback();
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

	/** Appends to the book, warning if a transaction holds it up for too long. */
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
					`transaction to finish. It will run once the transaction ends.`,
			);
		}, this.watchdogMs);
	}
}
