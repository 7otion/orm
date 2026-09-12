/**
 * Singleton holding the adapter, dialect and transaction state.
 * Initialised once at startup.
 */
import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';
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
    private dialect;
    private enableWriteQueue;
    private watchdogMs;
    /** The book: one serial chain. A transaction is itself an entry in it. */
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
     * on throw. Writes inside it must carry the `Transaction` it is passed.
     * Nesting joins the outermost, which is the only one that commits.
     */
    transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
    /**
     * Serialises a write behind any already in flight. A write carrying the open
     * transaction's handle runs immediately: it is that transaction, and queuing
     * it would make the transaction wait on itself. Reads are never queued.
     */
    queueWrite<T>(operation: () => Promise<T>, tx?: Transaction, label?: string): Promise<T>;
    /** Appends to the book, warning if a transaction holds it up for too long. */
    private enqueue;
    private warnIfHeld;
}
//# sourceMappingURL=orm.d.ts.map