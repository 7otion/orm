/**
 * DatabaseAdapter Interface
 *
 * This is the abstraction layer that allows the ORM to work with ANY database
 * connection method. You can swap from Tauri's SQL plugin to better-sqlite3
 * to node-postgres just by implementing this interface.
 *
 * The adapter is responsible for:
 * - Executing SQL queries
 * - Managing transactions
 * - Returning raw database rows
 *
 * The adapter does NOT:
 * - Generate SQL (that's the SqlDialect's job)
 * - Know about models or relationships
 * - Transform data (Model does that)
 */
import type { DatabaseRow, QueryValue } from './types';
export interface DatabaseAdapter {
    /**
     * Execute a SQL query that returns rows (SELECT)
     *
     * @param sql - The SQL query string
     * @param params - Bound parameters (prevents SQL injection)
     * @returns Array of raw database rows
     */
    query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]>;
    /**
     * Execute a SQL command that doesn't return rows (INSERT, UPDATE, DELETE)
     *
     * @param sql - The SQL command string
     * @param params - Bound parameters
     * @returns Number of affected rows
     */
    execute(sql: string, params?: QueryValue[]): Promise<number>;
    /**
     * Execute a SQL command and return the last inserted ID
     * Used for INSERT operations to get the new record's ID
     *
     * @param sql - The INSERT SQL command
     * @param params - Bound parameters
     * @returns The last inserted row ID
     */
    insert(sql: string, params?: QueryValue[]): Promise<number>;
    /**
     * Begin a database transaction
     * All subsequent queries will be part of this transaction
     * until commit() or rollback() is called
     */
    beginTransaction(): Promise<void>;
    /**
     * Commit the current transaction
     * Makes all changes permanent
     */
    commit(): Promise<void>;
    /**
     * Rollback the current transaction
     * Undoes all changes made in the transaction
     */
    rollback(): Promise<void>;
    /**
     * Check if currently in a transaction
     * Useful for nested transaction detection
     */
    inTransaction(): boolean;
}
//# sourceMappingURL=adapter.d.ts.map