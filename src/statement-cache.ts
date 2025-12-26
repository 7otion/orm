/**
 * LRU Cache for prepared SQL statements
 *
 * Caches compiled/prepared statements to avoid redundant parsing.
 * This is NOT result caching - only the prepared statement metadata.
 */

interface CacheEntry<T> {
	statement: T;
	lastUsed: number;
}

export class StatementCache<T = any> {
	private cache = new Map<string, CacheEntry<T>>();
	private maxSize: number;

	constructor(maxSize: number = 200) {
		this.maxSize = maxSize;
	}

	/**
	 * Get a cached prepared statement
	 */
	get(sql: string): T | undefined {
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
	set(sql: string, statement: T): void {
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
	has(sql: string): boolean {
		return this.cache.has(sql);
	}

	/**
	 * Remove a specific statement from cache
	 */
	delete(sql: string): void {
		this.cache.delete(sql);
	}

	/**
	 * Clear the entire cache
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get current cache size
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * Evict the least recently used entry
	 */
	private evictOldest(): void {
		let oldestKey: string | null = null;
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
