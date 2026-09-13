/**
 * The handle a queued unit of writes carries. `ORM.transaction()` hands one to its
 * callback; bulk writes and `sync` open one of their own. Writes carrying it
 * belong to the unit; writes without it are held until the unit ends.
 */

/** Named so the marker survives minification; the build passes `--keep-names`. */
export const TRANSACTION_BODY_MARKER = 'ormTransactionBody';

export class Transaction {
	/** Set once the unit settles, so a stale token can be rejected. */
	private settled = false;

	private begun = false;

	private rolledBackByDatabase = false;

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
}

/**
 * Invokes the callback through a uniquely named frame, so an untokened write
 * can tell whether it came from inside the body. Read for diagnostics only —
 * never to route a write.
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
