/**
 * The database connection abstraction. Adapters execute SQL; they never generate
 * SQL or know about models.
 */
import type { DatabaseRow, QueryValue } from './types';
export interface DatabaseAdapter {
    query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]>;
    /** Returns the number of affected rows. */
    execute(sql: string, params?: QueryValue[]): Promise<number>;
    /** Returns the new row's id. */
    insert(sql: string, params?: QueryValue[]): Promise<number>;
    /**
     * Release the connection. The adapter must be re-initialised before reuse.
     * Adapters without an explicit connection may no-op.
     */
    close(): Promise<void>;
}
/** Every call, from BEGIN to COMMIT or ROLLBACK, must reach one connection. */
export interface TransactionalAdapter extends DatabaseAdapter {
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    /** Reads the database's own state, not a flag the adapter keeps. */
    inTransaction(): Promise<boolean>;
}
//# sourceMappingURL=adapter.d.ts.map