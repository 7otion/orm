/**
 * LocalStorage-based Result Cache
 *
 * Persistent cache using browser LocalStorage.
 * Survives page refreshes but has storage limits (~5-10MB).
 */
import type { ResultCacheAdapter } from '../../result-cache';
export declare class LocalStorageResultCache implements ResultCacheAdapter {
    private prefix;
    private defaultTTL?;
    private debug;
    private maxEntries;
    private get QUERY_CACHE_KEY();
    private get TAG_MAP_KEY();
    private get ROW_CACHE_KEY();
    constructor(prefix?: string, maxEntries?: number, defaultTTL?: number, debug?: boolean);
    get<T = any>(key: string): T[] | undefined;
    set<T = any>(key: string, value: T[], tags: string[], ttl?: number): void;
    getRowById<T = any>(table: string, id: any): T | undefined;
    setRowById<T = any>(table: string, id: any, row: T): void;
    invalidate(tables: string[]): void;
    clear(): void;
    size(): number;
    private getQueriesMap;
    private saveQueriesMap;
    private getTagMap;
    private saveTagMap;
    private getRowsMap;
    private saveRowsMap;
    private delete;
    private evictOldest;
    private cleanup;
}
//# sourceMappingURL=localstorage.d.ts.map