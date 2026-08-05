/**
 * Singleton holding the adapter, dialect, transaction state and caches.
 * Initialised once at startup.
 */
import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';
import type { ResultCacheAdapter } from './result-cache';
import type { DatabaseRow } from './types';
export interface ORMConfig {
    adapter: DatabaseAdapter;
    dialect: SqlDialect;
    /** Serialises writes. Required for SQLite, which cannot write concurrently. */
    enableWriteQueue?: boolean;
    /** Enables SELECT result caching when provided. */
    resultCacheAdapter?: ResultCacheAdapter;
    /** Disables result caching without discarding the adapter. */
    disableResultCache?: boolean;
}
export declare class ORM {
    private static instance;
    private adapter;
    private dialect;
    private writeQueue;
    private enableWriteQueue;
    resultCacheAdapter?: ResultCacheAdapter;
    private disableResultCache;
    private connectionId;
    private constructor();
    cachedSelect(sql: string, params?: any[], tables?: string[]): Promise<DatabaseRow[]>;
    invalidateResultCache(tables: string[]): void;
    /**
     * Normalises whitespace and case so equivalent SQL shares a cache entry,
     * and stringifies params with sorted keys so key order cannot split it.
     */
    private makeCacheKey;
    setResultCacheDisabled(disabled: boolean): void;
    static initialize(config: ORMConfig): void;
    static reInitialize(config: ORMConfig): Promise<void>;
    static getInstance(): ORM;
    getAdapter(): DatabaseAdapter;
    close(): Promise<void>;
    getDialect(): SqlDialect;
    /**
     * Runs the callback in a transaction, committing on success and rolling
     * back on throw. Nesting is handled: only the outermost call commits.
     */
    transaction<T>(callback: () => Promise<T>): Promise<T>;
    /**
     * Serialises a write behind any already in flight, when the write queue is
     * enabled. Reads are never queued.
     */
    queueWrite<T>(operation: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=orm.d.ts.map