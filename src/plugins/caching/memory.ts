/**
 * In-memory LRU Result Cache (Default)
 *
 * Environment-agnostic, simple, and aggressively invalidates on writes.
 */
import type { ResultCacheAdapter } from '../../result-cache';

interface CacheEntry<T = any> {
	value: T[];
	tags: string[];
	expiresAt?: number;
	lastUsed: number;
}

export class MemoryResultCache implements ResultCacheAdapter {
	private cache = new Map<string, CacheEntry>();
	private tagMap = new Map<string, Set<string>>(); // tag (table) -> Set<cacheKey>
	private rowCache = new Map<string, Map<any, any>>(); // table -> id -> row
	private maxSize: number;
	private defaultTTL?: number;
	private debug: boolean;

	constructor(maxSize = 200, defaultTTL?: number, debug = false) {
		this.maxSize = maxSize;
		this.defaultTTL = defaultTTL;
		this.debug = debug;
	}

	get<T = any>(key: string): T[] | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			if (this.debug)
				console.log('[MemoryResultCache] MISS (query)', key);
			return undefined;
		}
		if (entry.expiresAt && Date.now() > entry.expiresAt) {
			if (this.debug)
				console.log('[MemoryResultCache] EXPIRED (query)', key);
			this.delete(key, entry.tags);
			return undefined;
		}
		entry.lastUsed = Date.now();
		if (this.debug) console.log('[MemoryResultCache] HIT (query)', key);
		return entry.value as T[];
	}

	set<T = any>(key: string, value: T[], tags: string[], ttl?: number): void {
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			this.evictOldest();
		}
		const expiresAt =
			ttl || this.defaultTTL
				? Date.now() + (ttl || this.defaultTTL!)
				: undefined;
		this.cache.set(key, { value, tags, expiresAt, lastUsed: Date.now() });
		for (const tag of tags) {
			if (!this.tagMap.has(tag)) this.tagMap.set(tag, new Set());
			this.tagMap.get(tag)!.add(key);
		}
		if (this.debug)
			console.log('[MemoryResultCache] SET (query)', key, { tags });
	}

	getRowById<T = any>(table: string, id: any): T | undefined {
		const tableMap = this.rowCache.get(table);
		if (!tableMap) {
			if (this.debug)
				console.log(`[MemoryResultCache] MISS (row) ${table} id=${id}`);
			return undefined;
		}
		const row = tableMap.get(id);
		if (row) {
			if (this.debug)
				console.log(`[MemoryResultCache] HIT (row) ${table} id=${id}`);
		} else {
			if (this.debug)
				console.log(`[MemoryResultCache] MISS (row) ${table} id=${id}`);
		}
		return row;
	}

	setRowById<T = any>(table: string, id: any, row: T): void {
		if (!this.rowCache.has(table)) this.rowCache.set(table, new Map());
		this.rowCache.get(table)!.set(id, row);
		if (this.debug)
			console.log(`[MemoryResultCache] SET (row) ${table} id=${id}`, row);
	}

	invalidate(tables: string[]): void {
		for (const table of tables) {
			const keys = this.tagMap.get(table);
			if (!keys) continue;
			for (const key of keys) {
				const entry = this.cache.get(key);
				if (entry) this.delete(key, entry.tags);
			}
			this.tagMap.delete(table);
			if (this.debug)
				console.log('[MemoryResultCache] INVALIDATE', table);
			// Also clear row cache for this table
			if (this.rowCache.has(table)) {
				this.rowCache.delete(table);
				if (this.debug)
					console.log('[MemoryResultCache] INVALIDATE (row)', table);
			}
		}
	}

	clear(): void {
		this.cache.clear();
		this.tagMap.clear();
		this.rowCache.clear();
		if (this.debug) console.log('[MemoryResultCache] CLEAR ALL');
	}

	size(): number {
		return this.cache.size;
	}

	private delete(key: string, tags: string[]): void {
		this.cache.delete(key);
		for (const tag of tags) {
			const set = this.tagMap.get(tag);
			if (set) {
				set.delete(key);
				if (set.size === 0) this.tagMap.delete(tag);
			}
		}
	}

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
			const entry = this.cache.get(oldestKey);
			if (entry) this.delete(oldestKey, entry.tags);
		}
	}
}
