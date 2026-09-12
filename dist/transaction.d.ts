/**
 * The handle `ORM.transaction()` hands its callback. Writes carrying it belong
 * to that transaction; writes without it are held until the transaction ends.
 */
/** Named so the marker survives minification; the build passes `--keep-names`. */
export declare const TRANSACTION_BODY_MARKER = "ormTransactionBody";
export declare class Transaction {
    /** Set once the transaction settles, so a stale token can be rejected. */
    private settled;
    /** @internal */
    isOpen(): boolean;
    /** @internal */
    close(): void;
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