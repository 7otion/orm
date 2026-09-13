import type { TransactionalAdapter } from '../../adapter';
import type { DatabaseRow, QueryValue } from '../../types';
export interface Tauri7otionSqliteAdapterConfig {
    database: string;
    /** SQLCipher key; the plugin warns that one passed from JavaScript is not safe. */
    key?: string;
    pragmas?: Record<string, string | number | boolean>;
    debug?: boolean;
}
/** Over tauri-plugin-7otion-sqlite, whose single connection per database file runs transactions. */
export declare class Tauri7otionSqliteAdapter implements TransactionalAdapter {
    private readonly config;
    private db;
    private logger;
    private initPromise;
    constructor(config: Tauri7otionSqliteAdapterConfig);
    initialize(): Promise<void>;
    private performInitialization;
    private ensureInitialized;
    query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]>;
    execute(sql: string, params?: QueryValue[]): Promise<number>;
    insert(sql: string, params?: QueryValue[]): Promise<number>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    inTransaction(): Promise<boolean>;
    close(): Promise<void>;
}
//# sourceMappingURL=tauri-7otion-sqlite-adapter.d.ts.map