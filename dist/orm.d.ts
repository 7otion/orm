/**
 * Singleton holding the adapter, dialect and transaction state.
 * Initialised once at startup.
 */
import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';
import { type InstanceChangeListener } from './instance-changes';
import { Transaction } from './transaction';
export interface ORMConfig {
    adapter: DatabaseAdapter;
    dialect: SqlDialect;
    /** Serialises writes. Required for SQLite, which cannot write concurrently. */
    enableWriteQueue?: boolean;
    /** How long a write may sit held behind a transaction before warning. */
    watchdogMs?: number;
}
export declare class ORM {
    private static instance;
    private adapter;
    /** The same adapter when it implements `TransactionalAdapter`, otherwise null. */
    private transactions;
    private dialect;
    private enableWriteQueue;
    private watchdogMs;
    /** The book: one serial chain. A unit of writes is itself an entry in it. */
    private book;
    private active;
    private constructor();
    static initialize(config: ORMConfig): void;
    static reInitialize(config: ORMConfig): Promise<void>;
    static getInstance(): ORM;
    getAdapter(): DatabaseAdapter;
    close(): Promise<void>;
    getDialect(): SqlDialect;
    /**
     * Runs the callback in a transaction, committing on success and rolling back
     * on throw. Given an open transaction's handle, it runs inside that one instead.
     */
    transaction<T>(callback: (tx: Transaction) => Promise<T>, tx?: Transaction, label?: string): Promise<T>;
    /**
     * Runs work as one queued unit that holds other writes back until it ends.
     * Given a unit's handle, it runs inside that unit instead.
     */
    queueUnit<T>(work: (unit: Transaction) => Promise<T>, tx?: Transaction, label?: string): Promise<T>;
    /**
     * Told which instances a committed write or a `refresh()` changed. Static,
     * so it outlives `reInitialize`. Returns the unsubscribe.
     */
    static onInstanceChange(listener: InstanceChangeListener): () => void;
    /**
     * Begins the unit before a hook can write. Without transactions the unit
     * still runs, but a nested write into it is refused.
     */
    beginForHooks(unit: Transaction, label: string): Promise<void>;
    /**
     * Issues BEGIN for a unit whose work spans several statements. Must be called
     * before the unit's first write; refuses on an adapter without transactions.
     */
    ensureAtomic(unit: Transaction, statements: number, label: string): Promise<void>;
    /**
     * Serialises a write behind any in flight. One carrying the open unit's handle
     * runs immediately; reads are never queued.
     */
    queueWrite<T>(operation: () => Promise<T>, tx?: Transaction, label?: string): Promise<T>;
    /** Must be called from the book: the unit is its own entry. */
    private runUnit;
    /** A write inside a transaction failed; SQLite may have rolled the whole transaction back. */
    private noticeDatabaseRollback;
    /** A failed rollback is reported rather than thrown, so the error that caused it survives. */
    private rollbackAfterFailure;
    private missingHandle;
    private rolledBackByDatabase;
    /** `statements` is omitted when the work cannot be counted, as with `transaction()`. */
    private unsupported;
    private hookWriteUnsupported;
    /** Appends to the book, warning if a unit holds it up for too long. */
    private enqueue;
    private warnIfHeld;
    /** An adapter implementing only some of the transaction methods is refused outright. */
    private static transactionsOf;
}
//# sourceMappingURL=orm.d.ts.map