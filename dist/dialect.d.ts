/**
 * SqlDialect Interface
 *
 * This is the abstraction layer that handles database-specific SQL syntax.
 * Different databases have different SQL flavors (SQLite vs PostgreSQL vs MySQL).
 *
 * The dialect is responsible for:
 * - Compiling QueryStructure objects into SQL strings
 * - Handling database-specific syntax differences
 * - Managing parameter placeholders (?, $1, :param, etc.)
 *
 * The dialect does NOT:
 * - Execute queries (that's the adapter's job)
 * - Know about models
 * - Manage connections
 *
 * Example differences between databases:
 * - SQLite uses ? for params, PostgreSQL uses $1, $2
 * - LIMIT syntax varies: MySQL uses LIMIT, OFFSET vs PostgreSQL uses LIMIT, OFFSET
 * - Date functions differ: SQLite uses datetime('now') vs PostgreSQL uses NOW()
 */
import type { CompiledQuery, QueryStructure, QueryValue } from './types';
export interface SqlDialect {
    /**
     * Compile a SELECT query structure into SQL
     *
     * @param query - The query structure built by QueryBuilder
     * @returns Compiled SQL with bound parameters
     */
    compileSelect(query: QueryStructure): CompiledQuery;
    /**
     * Compile an INSERT statement
     *
     * @param table - Table name
     * @param data - Column-value pairs to insert
     * @returns Compiled SQL with bound parameters
     */
    compileInsert(table: string, data: Record<string, QueryValue>): CompiledQuery;
    /**
     * Compile an UPDATE statement
     *
     * @param table - Table name
     * @param data - Column-value pairs to update
     * @param primaryKey - Primary key column name(s)
     * @param id - Primary key value(s) for WHERE clause
     * @returns Compiled SQL with bound parameters
     */
    compileUpdate(table: string, data: Record<string, QueryValue>, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    /**
     * Compile a DELETE statement
     *
     * @param table - Table name
     * @param primaryKey - Primary key column name(s)
     * @param id - Primary key value(s) for WHERE clause
     * @returns Compiled SQL with bound parameters
     */
    compileDelete(table: string, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    /**
     * Compile a COUNT query
     *
     * @param query - The query structure built by QueryBuilder
     * @returns Compiled SQL with bound parameters
     */
    compileCount(query: QueryStructure): CompiledQuery;
    /**
     * Get the current timestamp in database-specific format
     * Used for timestamp fields (created_at, updated_at)
     *
     * @returns SQL expression for current timestamp
     */
    getCurrentTimestamp(): string;
}
//# sourceMappingURL=dialect.d.ts.map