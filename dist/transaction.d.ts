/**
 * The handle a queued unit of writes carries. Writes carrying it belong to the
 * unit; writes without it are held until the unit ends.
 */
import type { EventBatch } from './events';
/** Named so the marker survives minification; the build passes `--keep-names`. */
export declare const TRANSACTION_BODY_MARKER = "ormTransactionBody";
export interface ListenerFailure {
    event: string;
    model: string;
    error: unknown;
}
/** The write committed; listeners that ran afterwards failed. */
export declare class ListenerError extends Error {
    /** What the write returned, so a committed `create()` still hands back its model. */
    readonly result: unknown;
    readonly failures: ListenerFailure[];
    readonly committed: true;
    constructor(
    /** What the write returned, so a committed `create()` still hands back its model. */
    result: unknown, failures: ListenerFailure[]);
}
export declare class Transaction {
    /** Set once the unit settles, so a stale token can be rejected. */
    private settled;
    private begun;
    private rolledBackByDatabase;
    /** The label of the hooked write that needed a transaction the adapter cannot give. */
    private refusal;
    private depth;
    /** Rows a delete in this unit has claimed, by class and key signature. */
    private readonly deleting;
    private deferred;
    private changed;
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
    /** @internal A hooked write ran without BEGIN, so a second statement cannot land with it. */
    refuseNestedWrites(label: string): void;
    /** @internal */
    nestedWritesRefusedBy(): string | null;
    /** @internal False when an outer delete in this unit already covers the row. */
    claimDelete(modelClass: object, key: string): boolean;
    /** @internal */
    enterHooks(event: string, model: string): void;
    /** @internal */
    exitHooks(): void;
    /** @internal Held until the unit commits; dropped if it rolls back. */
    defer(batch: EventBatch<any>, run: () => void | Promise<void>): void;
    /** @internal Instances to report once the unit commits, as one batch. */
    deferChanged(models: readonly object[]): void;
    /**
     * @internal Runs every deferred listener, then reports the changed
     * instances once. Failures are collected rather than stopping.
     */
    notify(report: (models: readonly object[]) => Promise<ListenerFailure[]>): Promise<ListenerFailure[]>;
}
/**
 * A uniquely named frame, so an untokened write can tell it came from inside
 * the body. Diagnostics only.
 */
export declare function ormTransactionBody<T>(callback: (tx: Transaction) => Promise<T>, tx: Transaction): Promise<T>;
/** Whether the caller sits inside a transaction body's await chain. */
export declare function calledFromTransactionBody(): boolean;
//# sourceMappingURL=transaction.d.ts.map