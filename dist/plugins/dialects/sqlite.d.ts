import type { SqlDialect } from '../../dialect';
import type { CompiledQuery, QueryStructure, QueryValue } from '../../types';
export declare class SQLiteDialect implements SqlDialect {
    compileSelect(query: QueryStructure): CompiledQuery;
    compileInsert(table: string, data: Record<string, QueryValue>): CompiledQuery;
    compileUpdate(table: string, data: Record<string, QueryValue>, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    compileDelete(table: string, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    compileDeleteQuery(query: QueryStructure): CompiledQuery;
    compileUpdateQuery(query: QueryStructure, data: Record<string, QueryValue>): CompiledQuery;
    compileCount(query: QueryStructure): CompiledQuery;
    /** Unix seconds, matching INTEGER DEFAULT (unixepoch()) columns. */
    getCurrentTimestamp(): number;
    /** Quotes an identifier so reserved words and dots are safe. */
    private escapeIdentifier;
}
//# sourceMappingURL=sqlite.d.ts.map