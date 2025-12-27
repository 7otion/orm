import type { DatabaseAdapter } from '../../adapter';
import type { DatabaseRow, QueryValue } from '../../types';
export interface TauriAdapterConfig {
    database: string;
    debug?: boolean;
    pragmas?: string[];
}
export declare class TauriAdapter implements DatabaseAdapter {
    private db;
    private inTransactionFlag;
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
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    inTransaction(): boolean;
}
//# sourceMappingURL=tauri.d.ts.map