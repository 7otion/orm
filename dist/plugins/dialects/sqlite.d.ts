import type { SqlDialect } from '../../dialect';
import type { AggregateFunction, CompiledQuery, QueryStructure, QueryValue } from '../../types';
export interface SQLiteDialectOptions {
    /** The SQLITE_MAX_VARIABLE_NUMBER of the SQLite build in use. */
    maxBindParameters?: number;
}
export declare class SQLiteDialect implements SqlDialect {
    /** SQLite's default since 3.32.0; older builds used 999. */
    static readonly DEFAULT_MAX_BIND_PARAMETERS = 32766;
    readonly maxBindParameters: number;
    constructor(options?: SQLiteDialectOptions);
    /**
     * SQLite has no boolean type, and a driver handed a raw `true` will not
     * necessarily store 0/1 — tauri-plugin-sql, for one, binds it as the JSON
     * text `"true"`, which no `= 1` comparison ever matches. The last step
     * before the driver, so it also covers raw bindings, which carry no column
     * name for a cast to key off.
     */
    private compiled;
    compileSelect(query: QueryStructure): CompiledQuery;
    private compileJoins;
    private compileOrders;
    /** SQLite's grammar is LIMIT expr [OFFSET expr]; -1 is its no-limit sentinel. */
    private compileLimit;
    /**
     * UPDATE and DELETE take no join, limit or offset of their own, so anything
     * beyond a plain WHERE is expressed as the set of rows a SELECT would match.
     * Rowid tables only; a WITHOUT ROWID table has no such column.
     */
    private rowidFilter;
    private needsRowidFilter;
    compileInsert(table: string, data: Record<string, QueryValue>): CompiledQuery;
    compileInsertMany(table: string, rows: Record<string, QueryValue>[]): CompiledQuery;
    compileUpdateMany(table: string, rows: Record<string, QueryValue>[], keyColumns: string[], set: Record<string, QueryValue>): CompiledQuery;
    compileUpdate(table: string, data: Record<string, QueryValue>, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    compileDelete(table: string, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    compileDeleteQuery(query: QueryStructure): CompiledQuery;
    compileUpdateQuery(query: QueryStructure, data: Record<string, QueryValue>): CompiledQuery;
    compileCount(query: QueryStructure): CompiledQuery;
    compileAggregate(query: QueryStructure, fn: AggregateFunction, column: string): CompiledQuery;
    /** Joins each condition to the one before it, parenthesising only groups. */
    private compileWheres;
    /** Bindings are pushed in traversal order, so nesting cannot reorder them. */
    private compileCondition;
    /** Quotes an identifier so reserved words and dots are safe. */
    private escapeIdentifier;
}
//# sourceMappingURL=sqlite.d.ts.map