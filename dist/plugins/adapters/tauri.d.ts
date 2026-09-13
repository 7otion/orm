import type { DatabaseAdapter } from '../../adapter';
import type { DatabaseRow, QueryValue } from '../../types';
export interface TauriAdapterConfig {
    database: string;
    debug?: boolean;
}
/**
 * No transactions: tauri-plugin-sql pools connections, so BEGIN and COMMIT can
 * reach different ones (tauri-apps/plugins-workspace#886).
 */
export declare class TauriAdapter implements DatabaseAdapter {
    private db;
    private debug;
    private config;
    private initPromise;
    constructor(config: TauriAdapterConfig);
    initialize(): Promise<void>;
    private performInitialization;
    private ensureInitialized;
    private logQuery;
    private formatSqlWithParams;
    query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]>;
    execute(sql: string, params?: QueryValue[]): Promise<number>;
    insert(sql: string, params?: QueryValue[]): Promise<number>;
    close(): Promise<void>;
}
//# sourceMappingURL=tauri.d.ts.map