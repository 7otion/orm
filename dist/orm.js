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
export class ORM {
    constructor(config) {
        this.writeQueue = Promise.resolve();
        this.enableWriteQueue = false;
        this.disableResultCache = false;
        this.connectionId = 'default'; // For multi-connection support (future)
        this.adapter = config.adapter;
        this.dialect = config.dialect;
        this.enableWriteQueue = config.enableWriteQueue ?? false;
        this.resultCacheAdapter = config.resultCacheAdapter;
        this.disableResultCache = config.disableResultCache ?? false;
    }
    async cachedSelect(sql, params = [], tables = []) {
        if (this.disableResultCache ||
            this.adapter.inTransaction() ||
            !this.resultCacheAdapter) {
            // Never cache inside transactions or if no cache adapter provided
            return this.adapter.query(sql, params);
        }
        // Hybrid caching: row-level for SELECT * FROM table WHERE id = ?/IN (?), query-level for others
        const selectStarMatch = sql.match(/^SELECT \* FROM ([^ ]+) WHERE (.+)$/i);
        if (selectStarMatch) {
            const table = selectStarMatch[1];
            const where = selectStarMatch[2];
            if (!table)
                throw new Error('Unable to determine table name for caching.');
            if (!where)
                throw new Error('Unable to determine WHERE clause for caching.');
            // id = ?
            const eqMatch = where.match(/^id\s*=\s*\?/i);
            // id IN (?, ?, ...)
            const inMatch = where.match(/^id\s+IN\s*\((.+)\)/i);
            if (eqMatch && params.length === 1) {
                // Try row cache for single id
                const row = this.resultCacheAdapter.getRowById?.(table, params[0]);
                if (row)
                    return [row];
                // Miss: fetch from DB, cache row
                const result = await this.adapter.query(sql, params);
                if (result[0])
                    this.resultCacheAdapter.setRowById?.(table, params[0], result[0]);
                return result;
            }
            else if (inMatch) {
                // Try row cache for each id
                const idParams = params;
                const cachedRows = [];
                const missingIds = [];
                for (const id of idParams) {
                    const row = this.resultCacheAdapter.getRowById?.(table, id);
                    if (row)
                        cachedRows.push(row);
                    else
                        missingIds.push(id);
                }
                let fetchedRows = [];
                if (missingIds.length > 0) {
                    // Build SQL for missing ids
                    const qMarks = missingIds.map(() => '?').join(', ');
                    const fetchSql = `SELECT * FROM ${table} WHERE id IN (${qMarks})`;
                    fetchedRows = await this.adapter.query(fetchSql, missingIds);
                    for (const row of fetchedRows) {
                        this.resultCacheAdapter.setRowById?.(table, row.id, row);
                    }
                }
                // Return all rows in requested order
                const idToRow = new Map();
                for (const r of cachedRows)
                    idToRow.set(r.id, r);
                for (const r of fetchedRows)
                    idToRow.set(r.id, r);
                return idParams
                    .map(id => idToRow.get(id))
                    .filter(Boolean);
            }
        }
        // Fallback: query-level cache
        const key = this.makeCacheKey(sql, params);
        const cached = this.resultCacheAdapter.get(key);
        if (cached)
            return cached;
        const result = await this.adapter.query(sql, params);
        this.resultCacheAdapter.set(key, result, tables);
        return result;
    }
    invalidateResultCache(tables) {
        if (this.resultCacheAdapter) {
            this.resultCacheAdapter.invalidate(tables);
        }
    }
    /**
     * Generate a robust cache key by normalizing SQL and params.
     * - Collapses all whitespace to a single space
     * - Lowercases SQL for case-insensitive matching
     * - Serializes params with stable JSON
     */
    makeCacheKey(sql, params) {
        // Collapse all whitespace to single space, trim, and lowercase
        const normalizedSql = sql
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        // Stable JSON stringify for params (handles object key order)
        const stableStringify = (value) => {
            if (Array.isArray(value)) {
                return '[' + value.map(stableStringify).join(',') + ']';
            }
            else if (value && typeof value === 'object') {
                return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
            }
            else {
                return JSON.stringify(value);
            }
        };
        return `${this.connectionId}|${normalizedSql}|${stableStringify(params)}`;
    }
    setResultCacheDisabled(disabled) {
        this.disableResultCache = disabled;
    }
    static initialize(config) {
        if (!ORM.instance) {
            ORM.instance = new ORM(config);
        }
    }
    static getInstance() {
        if (!ORM.instance) {
            throw new Error('ORM not initialized. Call ORM.initialize() first.');
        }
        return ORM.instance;
    }
    getAdapter() {
        return this.adapter;
    }
    getDialect() {
        return this.dialect;
    }
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
    async transaction(callback) {
        const wasInTransaction = this.adapter.inTransaction();
        // Only begin/commit if not already in a transaction
        // This handles nested transactions correctly
        if (!wasInTransaction) {
            await this.adapter.beginTransaction();
        }
        try {
            const result = await callback();
            if (!wasInTransaction) {
                await this.adapter.commit();
            }
            return result;
        }
        catch (error) {
            if (!wasInTransaction) {
                await this.adapter.rollback();
            }
            throw error;
        }
    }
    /**
     * Queue a write operation (INSERT, UPDATE, DELETE) to prevent concurrent writes.
     * Only used when enableWriteQueue is true (for databases like SQLite).
     * Read operations are not queued.
     *
     * @param operation - Async write operation to queue
     * @returns Result of the write operation
     */
    async queueWrite(operation) {
        if (!this.enableWriteQueue) {
            // No queueing - execute immediately
            return operation();
        }
        // Wait for previous write to complete, then execute this one
        const result = this.writeQueue.then(() => operation());
        this.writeQueue = result.catch(() => { }); // Don't propagate errors in queue chain
        return result;
    }
}
ORM.instance = null;
//# sourceMappingURL=orm.js.map