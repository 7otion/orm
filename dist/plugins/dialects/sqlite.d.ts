import type { SqlDialect } from '../../dialect';
import type { CompiledQuery, QueryStructure, QueryValue } from '../../types';
export declare class SQLiteDialect implements SqlDialect {
    /**
     * SQLite has no boolean type, and a driver handed a raw `true` will not
     * necessarily store 0/1 — tauri-plugin-sql, for one, binds it as the JSON
     * text `"true"`, which no `= 1` comparison ever matches. Normalising here
     * catches every value the builder emits, including `where` operands that
     * never passed through a model's casts.
     */
    private compiled;
    compileSelect(query: QueryStructure): CompiledQuery;
    compileInsert(table: string, data: Record<string, QueryValue>): CompiledQuery;
    compileUpdate(table: string, data: Record<string, QueryValue>, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    compileDelete(table: string, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    compileDeleteQuery(query: QueryStructure): CompiledQuery;
    compileUpdateQuery(query: QueryStructure, data: Record<string, QueryValue>): CompiledQuery;
    compileCount(query: QueryStructure): CompiledQuery;
    /** Quotes an identifier so reserved words and dots are safe. */
    private escapeIdentifier;
}
//# sourceMappingURL=sqlite.d.ts.map