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
     * Booleans become 0/1: tauri-plugin-sql binds a raw `true` as the text `"true"`.
     * The last step before the driver, so raw bindings are covered too.
     */
    private compiled;
    compileSelect(query: QueryStructure): CompiledQuery;
    private compileJoins;
    private compileOrders;
    /** SQLite's grammar is LIMIT expr [OFFSET expr]; -1 is its no-limit sentinel. */
    private compileLimit;
    /**
     * UPDATE and DELETE take no join, limit or offset, so those are expressed as
     * the rows a SELECT matches. Rowid tables only.
     */
    private rowidFilter;
    private needsRowidFilter;
    compileInsert(table: string, data: Record<string, QueryValue>): CompiledQuery;
    compileInsertMany(table: string, rows: Record<string, QueryValue>[], returning?: string[]): CompiledQuery;
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