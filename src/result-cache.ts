/**
 * Result Cache Adapter Interface
 *
 * Pluggable interface for result-set caching in the ORM.
 * Allows custom cache implementations (memory, Redis, etc).
 */

export interface ResultCacheAdapter {
	/**
	 * Get a cached result set by key
	 * @param key Unique cache key (normalized SQL + params + connection)
	 * @returns Cached result set or undefined
	 */
	get<T = any>(key: string): T[] | undefined;

	/**
	 * Store a result set in the cache
	 * @param key Unique cache key
	 * @param value Result set to cache
	 * @param tags Table names involved in the query (for invalidation)
	 * @param ttl Optional time-to-live in ms
	 */
	set<T = any>(key: string, value: T[], tags: string[], ttl?: number): void;

	/**
	 * Row-level cache for SELECT * FROM table WHERE id = ?/IN (?)
	 */
	getRowById?<T = any>(table: string, id: any): T | undefined;
	setRowById?<T = any>(table: string, id: any, row: T): void;

	/**
	 * Invalidate all cache entries tagged with any of the given tables
	 * @param tables Array of table names
	 */
	invalidate(tables: string[]): void;

	/**
	 * Clear the entire cache
	 */
	clear(): void;

	/**
	 * Get current cache size (number of entries)
	 */
	size(): number;
}
