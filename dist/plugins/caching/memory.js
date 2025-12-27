export class MemoryResultCache {
    constructor(maxSize = 200, defaultTTL, debug = false) {
        this.cache = new Map();
        this.tagMap = new Map(); // tag (table) -> Set<cacheKey>
        this.rowCache = new Map(); // table -> id -> row
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;
        this.debug = debug;
    }
    get(key) {
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
        if (this.debug)
            console.log('[MemoryResultCache] HIT (query)', key);
        return entry.value;
    }
    set(key, value, tags, ttl) {
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictOldest();
        }
        const expiresAt = ttl || this.defaultTTL
            ? Date.now() + (ttl || this.defaultTTL)
            : undefined;
        this.cache.set(key, { value, tags, expiresAt, lastUsed: Date.now() });
        for (const tag of tags) {
            if (!this.tagMap.has(tag))
                this.tagMap.set(tag, new Set());
            this.tagMap.get(tag).add(key);
        }
        if (this.debug)
            console.log('[MemoryResultCache] SET (query)', key, { tags });
    }
    getRowById(table, id) {
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
        }
        else {
            if (this.debug)
                console.log(`[MemoryResultCache] MISS (row) ${table} id=${id}`);
        }
        return row;
    }
    setRowById(table, id, row) {
        if (!this.rowCache.has(table))
            this.rowCache.set(table, new Map());
        this.rowCache.get(table).set(id, row);
        if (this.debug)
            console.log(`[MemoryResultCache] SET (row) ${table} id=${id}`, row);
    }
    invalidate(tables) {
        for (const table of tables) {
            const keys = this.tagMap.get(table);
            if (!keys)
                continue;
            for (const key of keys) {
                const entry = this.cache.get(key);
                if (entry)
                    this.delete(key, entry.tags);
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
    clear() {
        this.cache.clear();
        this.tagMap.clear();
        this.rowCache.clear();
        if (this.debug)
            console.log('[MemoryResultCache] CLEAR ALL');
    }
    size() {
        return this.cache.size;
    }
    delete(key, tags) {
        this.cache.delete(key);
        for (const tag of tags) {
            const set = this.tagMap.get(tag);
            if (set) {
                set.delete(key);
                if (set.size === 0)
                    this.tagMap.delete(tag);
            }
        }
    }
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
            const entry = this.cache.get(oldestKey);
            if (entry)
                this.delete(oldestKey, entry.tags);
        }
    }
}
//# sourceMappingURL=memory.js.map