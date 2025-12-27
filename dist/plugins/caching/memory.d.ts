/**
 * In-memory LRU Result Cache (Default)
 *
 * Environment-agnostic, simple, and aggressively invalidates on writes.
 */
import type { ResultCacheAdapter } from '../../result-cache';
export declare class MemoryResultCache implements ResultCacheAdapter {
    private cache;
    private tagMap;
    private rowCache;
    private maxSize;
    private defaultTTL?;
    private debug;
    constructor(maxSize?: number, defaultTTL?: number, debug?: boolean);
    get<T = any>(key: string): T[] | undefined;
    set<T = any>(key: string, value: T[], tags: string[], ttl?: number): void;
    getRowById<T = any>(table: string, id: any): T | undefined;
    setRowById<T = any>(table: string, id: any, row: T): void;
    invalidate(tables: string[]): void;
    clear(): void;
    size(): number;
    private delete;
    private evictOldest;
}
//# sourceMappingURL=memory.d.ts.map