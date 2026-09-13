/**
 * The handle a queued unit of writes carries. `ORM.transaction()` hands one to its
 * callback; bulk writes and `sync` open one of their own. Writes carrying it
 * belong to the unit; writes without it are held until the unit ends.
 */
/** Named so the marker survives minification; the build passes `--keep-names`. */
export declare const TRANSACTION_BODY_MARKER = "ormTransactionBody";
export declare class Transaction {
    /** Set once the unit settles, so a stale token can be rejected. */
    private settled;
    private begun;
    private rolledBackByDatabase;
    /** @internal */
    isOpen(): boolean;
    /** @internal */
    close(): void;
    /** @internal Whether BEGIN has been issued for this unit. */
    hasBegun(): boolean;
    /** @internal */
    markBegun(): void;
    /** @internal */
    wasRolledBackByDatabase(): boolean;
    /** @internal */
    markRolledBackByDatabase(): void;
}
/**
 * Invokes the callback through a uniquely named frame, so an untokened write
 * can tell whether it came from inside the body. Read for diagnostics only —
 * never to route a write.
 */
export declare function ormTransactionBody<T>(callback: (tx: Transaction) => Promise<T>, tx: Transaction): Promise<T>;
/** Whether the caller sits inside a transaction body's await chain. */
export declare function calledFromTransactionBody(): boolean;
//# sourceMappingURL=transaction.d.ts.map