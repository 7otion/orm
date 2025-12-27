/**
 * ORM Manager
 *
 * Central singleton that manages:
 * - Database adapter (how we connect to the database)
 * - SQL dialect (how we generate SQL)
 * - Transaction state
 *
 * This is initialized once at app startup:
 * ORM.initialize({
 *   adapter: new MyAdapter(db),
 *   dialect: new SQLiteDialect()
 * });
 */
import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';
import type { ResultCacheAdapter } from './result-cache';
import type { DatabaseRow } from './types';
export interface ORMConfig {
    adapter: DatabaseAdapter;
    dialect: SqlDialect;
    /**
     * Enable write queue to prevent concurrent write operations.
     * Required for databases that don't support concurrent writes (e.g., SQLite).
     * Default: false
     */
    enableWriteQueue?: boolean;
    /**
     * Optional result cache adapter (for SELECT result caching)
     * Users must import and provide a cache implementation if they want caching
     */
    resultCacheAdapter?: ResultCacheAdapter;
    /**
     * Disable result caching globally
     */
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
    private makeCacheKey;
    setResultCacheDisabled(disabled: boolean): void;
    static initialize(config: ORMConfig): void;
    static getInstance(): ORM;
    getAdapter(): DatabaseAdapter;
    getDialect(): SqlDialect;
    /**
     * Execute a callback within a database transaction
     *
     * Supports SQLite, MySQL, and PostgreSQL transaction semantics:
     * - Nested transactions are handled automatically (only outermost transaction commits/rolls back)
     * - Context-aware: All queries within callback execute in the same transaction
     * - If callback succeeds → transaction commits
     * - If callback throws → transaction rolls back
     *
     * Example:
     * await ORM.transaction(async () => {
     *   const user = await User.create({ name: 'John' });
     *   const post = await Post.create({ user_id: user.id, title: 'Hello' });
     * });
     *
     * @param callback - Function to execute in transaction context
     * @returns The callback's return value
     */
    transaction<T>(callback: () => Promise<T>): Promise<T>;
    /**
     * Queue a write operation (INSERT, UPDATE, DELETE) to prevent concurrent writes.
     * Only used when enableWriteQueue is true (for databases like SQLite).
     * Read operations are not queued.
     *
     * @param operation - Async write operation to queue
     * @returns Result of the write operation
     */
    queueWrite<T>(operation: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=orm.d.ts.map