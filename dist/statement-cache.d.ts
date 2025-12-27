/**
 * LRU Cache for prepared SQL statements
 *
 * Caches compiled/prepared statements to avoid redundant parsing.
 * This is NOT result caching - only the prepared statement metadata.
 */
export declare class StatementCache<T = any> {
    private cache;
    private maxSize;
    constructor(maxSize?: number);
    /**
     * Get a cached prepared statement
     */
    get(sql: string): T | undefined;
    /**
     * Store a prepared statement
     */
    set(sql: string, statement: T): void;
    /**
     * Check if a statement is cached
     */
    has(sql: string): boolean;
    /**
     * Remove a specific statement from cache
     */
    delete(sql: string): void;
    /**
     * Clear the entire cache
     */
    clear(): void;
    /**
     * Get current cache size
     */
    size(): number;
    /**
     * Evict the least recently used entry
     */
    private evictOldest;
}
//# sourceMappingURL=statement-cache.d.ts.map