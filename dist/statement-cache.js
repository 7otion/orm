/**
 * LRU Cache for prepared SQL statements
 *
 * Caches compiled/prepared statements to avoid redundant parsing.
 * This is NOT result caching - only the prepared statement metadata.
 */
export class StatementCache {
    constructor(maxSize = 200) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    /**
     * Get a cached prepared statement
     */
    get(sql) {
        const entry = this.cache.get(sql);
        if (entry) {
            entry.lastUsed = Date.now();
            return entry.statement;
        }
        return undefined;
    }
    /**
     * Store a prepared statement
     */
    set(sql, statement) {
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(sql)) {
            this.evictOldest();
        }
        this.cache.set(sql, {
            statement,
            lastUsed: Date.now(),
        });
    }
    /**
     * Check if a statement is cached
     */
    has(sql) {
        return this.cache.has(sql);
    }
    /**
     * Remove a specific statement from cache
     */
    delete(sql) {
        this.cache.delete(sql);
    }
    /**
     * Clear the entire cache
     */
    clear() {
        this.cache.clear();
    }
    /**
     * Get current cache size
     */
    size() {
        return this.cache.size;
    }
    /**
     * Evict the least recently used entry
     */
    evictOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastUsed < oldestTime) {
                oldestTime = entry.lastUsed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }
}
//# sourceMappingURL=statement-cache.js.map