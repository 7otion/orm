/**
 * LocalStorage-based Result Cache
 *
 * Persistent cache using browser LocalStorage.
 * Survives page refreshes but has storage limits (~5-10MB).
 */
import type { ResultCacheAdapter } from '../../result-cache';

interface LocalStorageEntry<T = any> {
	value: T[];
	tags: string[];
	expiresAt?: number;
	createdAt: number;
}

interface RowCacheEntry<T = any> {
	row: T;
	expiresAt?: number;
	createdAt: number;
}

export class LocalStorageResultCache implements ResultCacheAdapter {
	private prefix: string;
	private defaultTTL?: number;
	private debug: boolean;
	private maxEntries: number;

	// LocalStorage keys
	private get QUERY_CACHE_KEY() {
		return `${this.prefix}:queries`;
	}
	private get TAG_MAP_KEY() {
		return `${this.prefix}:tags`;
	}
	private get ROW_CACHE_KEY() {
		return `${this.prefix}:rows`;
	}

	constructor(
		prefix = 'orm-cache',
		maxEntries = 100,
		defaultTTL?: number,
		debug = false,
	) {
		this.prefix = prefix;
		this.maxEntries = maxEntries;
		this.defaultTTL = defaultTTL;
		this.debug = debug;

		// Clean up expired entries on initialization
		this.cleanup();
	}

	get<T = any>(key: string): T[] | undefined {
		try {
			const queries = this.getQueriesMap();
			const entry = queries.get(key);

			if (!entry) {
				if (this.debug)
					console.log('[LocalStorageResultCache] MISS (query)', key);
				return undefined;
			}

			if (entry.expiresAt && Date.now() > entry.expiresAt) {
				if (this.debug)
					console.log(
						'[LocalStorageResultCache] EXPIRED (query)',
						key,
					);
				this.delete(key, entry.tags);
				return undefined;
			}

			if (this.debug)
				console.log('[LocalStorageResultCache] HIT (query)', key);
			return entry.value as T[];
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error getting query:',
					error,
				);
			return undefined;
		}
	}

	set<T = any>(key: string, value: T[], tags: string[], ttl?: number): void {
		try {
			const queries = this.getQueriesMap();
			const tagMap = this.getTagMap();

			// Evict oldest if at capacity
			if (queries.size >= this.maxEntries && !queries.has(key)) {
				this.evictOldest();
			}

			const expiresAt =
				ttl || this.defaultTTL
					? Date.now() + (ttl || this.defaultTTL!)
					: undefined;

			const entry: LocalStorageEntry<T> = {
				value,
				tags,
				expiresAt,
				createdAt: Date.now(),
			};

			queries.set(key, entry);

			// Update tag map
			for (const tag of tags) {
				if (!tagMap.has(tag)) tagMap.set(tag, new Set());
				tagMap.get(tag)!.add(key);
			}

			this.saveQueriesMap(queries);
			this.saveTagMap(tagMap);

			if (this.debug)
				console.log('[LocalStorageResultCache] SET (query)', key, {
					tags,
				});
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error setting query:',
					error,
				);
			// If quota exceeded, try to clear some space
			if (
				error instanceof DOMException &&
				error.name === 'QuotaExceededError'
			) {
				this.evictOldest();
				// Retry once
				try {
					this.set(key, value, tags, ttl);
				} catch (retryError) {
					if (this.debug)
						console.warn(
							'[LocalStorageResultCache] Retry failed:',
							retryError,
						);
				}
			}
		}
	}

	getRowById<T = any>(table: string, id: any): T | undefined {
		try {
			const rows = this.getRowsMap();
			const tableKey = `${table}:${id}`;
			const entry = rows.get(tableKey);

			if (!entry) {
				if (this.debug)
					console.log(
						`[LocalStorageResultCache] MISS (row) ${table} id=${id}`,
					);
				return undefined;
			}

			if (entry.expiresAt && Date.now() > entry.expiresAt) {
				if (this.debug)
					console.log(
						`[LocalStorageResultCache] EXPIRED (row) ${table} id=${id}`,
					);
				rows.delete(tableKey);
				this.saveRowsMap(rows);
				return undefined;
			}

			if (this.debug)
				console.log(
					`[LocalStorageResultCache] HIT (row) ${table} id=${id}`,
				);
			return entry.row as T;
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error getting row:',
					error,
				);
			return undefined;
		}
	}

	setRowById<T = any>(table: string, id: any, row: T): void {
		try {
			const rows = this.getRowsMap();
			const tableKey = `${table}:${id}`;

			const entry: RowCacheEntry<T> = {
				row,
				expiresAt: this.defaultTTL
					? Date.now() + this.defaultTTL
					: undefined,
				createdAt: Date.now(),
			};

			rows.set(tableKey, entry);
			this.saveRowsMap(rows);

			if (this.debug)
				console.log(
					`[LocalStorageResultCache] SET (row) ${table} id=${id}`,
					row,
				);
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error setting row:',
					error,
				);
		}
	}

	invalidate(tables: string[]): void {
		try {
			const queries = this.getQueriesMap();
			const tagMap = this.getTagMap();
			const rows = this.getRowsMap();

			let invalidated = 0;

			for (const table of tables) {
				// Invalidate query cache
				const queryKeys = tagMap.get(table);
				if (queryKeys) {
					for (const key of queryKeys) {
						queries.delete(key);
						invalidated++;
					}
					tagMap.delete(table);
				}

				// Invalidate row cache for this table
				const rowKeysToDelete: string[] = [];
				for (const [key] of rows) {
					if (key.startsWith(`${table}:`)) {
						rowKeysToDelete.push(key);
					}
				}
				for (const key of rowKeysToDelete) {
					rows.delete(key);
					invalidated++;
				}

				if (this.debug)
					console.log(
						'[LocalStorageResultCache] INVALIDATE',
						table,
						`(${invalidated} entries)`,
					);
			}

			this.saveQueriesMap(queries);
			this.saveTagMap(tagMap);
			this.saveRowsMap(rows);
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error invalidating:',
					error,
				);
		}
	}

	clear(): void {
		try {
			localStorage.removeItem(this.QUERY_CACHE_KEY);
			localStorage.removeItem(this.TAG_MAP_KEY);
			localStorage.removeItem(this.ROW_CACHE_KEY);
			if (this.debug) console.log('[LocalStorageResultCache] CLEAR ALL');
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error clearing:',
					error,
				);
		}
	}

	size(): number {
		try {
			return this.getQueriesMap().size + this.getRowsMap().size;
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error getting size:',
					error,
				);
			return 0;
		}
	}

	private getQueriesMap(): Map<string, LocalStorageEntry> {
		try {
			const data = localStorage.getItem(this.QUERY_CACHE_KEY);
			return data ? new Map(JSON.parse(data)) : new Map();
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error parsing queries:',
					error,
				);
			return new Map();
		}
	}

	private saveQueriesMap(map: Map<string, LocalStorageEntry>): void {
		try {
			localStorage.setItem(
				this.QUERY_CACHE_KEY,
				JSON.stringify([...map]),
			);
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error saving queries:',
					error,
				);
		}
	}

	private getTagMap(): Map<string, Set<string>> {
		try {
			const data = localStorage.getItem(this.TAG_MAP_KEY);
			if (!data) return new Map();

			const parsed = JSON.parse(data);
			const map = new Map();
			for (const [tag, keys] of parsed) {
				map.set(tag, new Set(keys));
			}
			return map;
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error parsing tags:',
					error,
				);
			return new Map();
		}
	}

	private saveTagMap(map: Map<string, Set<string>>): void {
		try {
			const serialized = [...map].map(([tag, keys]) => [tag, [...keys]]);
			localStorage.setItem(this.TAG_MAP_KEY, JSON.stringify(serialized));
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error saving tags:',
					error,
				);
		}
	}

	private getRowsMap(): Map<string, RowCacheEntry> {
		try {
			const data = localStorage.getItem(this.ROW_CACHE_KEY);
			return data ? new Map(JSON.parse(data)) : new Map();
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error parsing rows:',
					error,
				);
			return new Map();
		}
	}

	private saveRowsMap(map: Map<string, RowCacheEntry>): void {
		try {
			localStorage.setItem(this.ROW_CACHE_KEY, JSON.stringify([...map]));
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error saving rows:',
					error,
				);
		}
	}

	private delete(key: string, tags: string[]): void {
		try {
			const queries = this.getQueriesMap();
			const tagMap = this.getTagMap();

			queries.delete(key);

			for (const tag of tags) {
				const set = tagMap.get(tag);
				if (set) {
					set.delete(key);
					if (set.size === 0) tagMap.delete(tag);
				}
			}

			this.saveQueriesMap(queries);
			this.saveTagMap(tagMap);
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error deleting:',
					error,
				);
		}
	}

	private evictOldest(): void {
		try {
			const queries = this.getQueriesMap();
			let oldestKey: string | null = null;
			let oldestTime = Infinity;

			for (const [key, entry] of queries) {
				if (entry.createdAt < oldestTime) {
					oldestTime = entry.createdAt;
					oldestKey = key;
				}
			}

			if (oldestKey) {
				const entry = queries.get(oldestKey);
				if (entry) this.delete(oldestKey, entry.tags);
			}
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error evicting:',
					error,
				);
		}
	}

	private cleanup(): void {
		try {
			const queries = this.getQueriesMap();
			const rows = this.getRowsMap();
			const now = Date.now();

			// Clean expired queries
			for (const [key, entry] of queries) {
				if (entry.expiresAt && now > entry.expiresAt) {
					this.delete(key, entry.tags);
				}
			}

			// Clean expired rows
			for (const [key, entry] of rows) {
				if (entry.expiresAt && now > entry.expiresAt) {
					rows.delete(key);
				}
			}

			this.saveRowsMap(rows);
		} catch (error) {
			if (this.debug)
				console.warn(
					'[LocalStorageResultCache] Error cleaning up:',
					error,
				);
		}
	}
}
