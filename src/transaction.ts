/**
 * The handle a queued unit of writes carries. Writes carrying it belong to the
 * unit; writes without it are held until the unit ends.
 */

import type { EventBatch } from './events';

/** Named so the marker survives minification; the build passes `--keep-names`. */
export const TRANSACTION_BODY_MARKER = 'ormTransactionBody';

/** Hooks nested deeper than this are a hook writing itself forever. */
const MAX_CASCADE_DEPTH = 32;

export interface ListenerFailure {
	event: string;
	model: string;
	error: unknown;
}

/** The write committed; listeners that ran afterwards failed. */
export class ListenerError extends Error {
	readonly committed = true as const;

	constructor(
		/** What the write returned, so a committed `create()` still hands back its model. */
		readonly result: unknown,
		readonly failures: ListenerFailure[],
	) {
		super(
			`[orm] The write committed, but ${failures.length} listener(s) failed afterwards: ` +
				failures
					.map(
						failure =>
							`${failure.event} on ${failure.model}: ${describe(failure.error)}`,
					)
					.join('; '),
		);
		this.name = 'ListenerError';
	}
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

interface Deferred {
	batch: EventBatch<any>;
	run: () => void | Promise<void>;
}

export class Transaction {
	/** Set once the unit settles, so a stale token can be rejected. */
	private settled = false;

	private begun = false;

	private rolledBackByDatabase = false;

	/** The label of the hooked write that needed a transaction the adapter cannot give. */
	private refusal: string | null = null;

	private depth = 0;

	/** Rows a delete in this unit has claimed, by class and key signature. */
	private readonly deleting = new Map<object, Set<string>>();

	private deferred: Deferred[] = [];

	private changed: object[] = [];

	/** @internal */
	isOpen(): boolean {
		return !this.settled;
	}

	/** @internal */
	close(): void {
		this.settled = true;
	}

	/** @internal Whether BEGIN has been issued for this unit. */
	hasBegun(): boolean {
		return this.begun;
	}

	/** @internal */
	markBegun(): void {
		this.begun = true;
	}

	/** @internal */
	wasRolledBackByDatabase(): boolean {
		return this.rolledBackByDatabase;
	}

	/** @internal */
	markRolledBackByDatabase(): void {
		this.rolledBackByDatabase = true;
	}

	/** @internal A hooked write ran without BEGIN, so a second statement cannot land with it. */
	refuseNestedWrites(label: string): void {
		this.refusal ??= label;
	}

	/** @internal */
	nestedWritesRefusedBy(): string | null {
		return this.refusal;
	}

	/** @internal False when an outer delete in this unit already covers the row. */
	claimDelete(modelClass: object, key: string): boolean {
		let claimed = this.deleting.get(modelClass);
		if (!claimed) {
			claimed = new Set();
			this.deleting.set(modelClass, claimed);
		}
		if (claimed.has(key)) return false;
		claimed.add(key);
		return true;
	}

	/** @internal */
	enterHooks(event: string, model: string): void {
		if (++this.depth > MAX_CASCADE_DEPTH) {
			throw new Error(
				`[orm] Hooks are nested ${MAX_CASCADE_DEPTH} deep at ${event} on ${model}. ` +
					`A hook is writing a model whose hooks write it back; it must stop once nothing changes.`,
			);
		}
	}

	/** @internal */
	exitHooks(): void {
		this.depth--;
	}

	/** @internal Held until the unit commits; dropped if it rolls back. */
	defer(batch: EventBatch<any>, run: () => void | Promise<void>): void {
		this.deferred.push({ batch, run });
	}

	/** @internal Instances to report once the unit commits, as one batch. */
	deferChanged(models: readonly object[]): void {
		this.changed.push(...models);
	}

	/**
	 * @internal Runs every deferred listener, then reports the changed
	 * instances once. Failures are collected rather than stopping.
	 */
	async notify(
		report: (models: readonly object[]) => Promise<ListenerFailure[]>,
	): Promise<ListenerFailure[]> {
		const pending = this.deferred;
		this.deferred = [];
		const changed = [...new Set(this.changed)];
		this.changed = [];

		const failures: ListenerFailure[] = [];
		for (const { batch, run } of pending) {
			try {
				await run();
			} catch (error) {
				failures.push({
					event: batch.event,
					model: batch.modelName,
					error,
				});
			}
		}

		if (changed.length > 0) failures.push(...(await report(changed)));

		return failures;
	}
}

/**
 * A uniquely named frame, so an untokened write can tell it came from inside
 * the body. Diagnostics only.
 */
export async function ormTransactionBody<T>(
	callback: (tx: Transaction) => Promise<T>,
	tx: Transaction,
): Promise<T> {
	return callback(tx);
}

/** Whether the caller sits inside a transaction body's await chain. */
export function calledFromTransactionBody(): boolean {
	return (new Error().stack ?? '').includes(TRANSACTION_BODY_MARKER);
}
