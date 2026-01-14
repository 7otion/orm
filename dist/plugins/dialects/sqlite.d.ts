import type { SqlDialect } from '../../dialect';
import type { CompiledQuery, QueryStructure, QueryValue } from '../../types';
export declare class SQLiteDialect implements SqlDialect {
    /**
     * Compile a SELECT query structure into SQLite SQL
     *
     * Example output:
     * SELECT * FROM users WHERE age > ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
     */
    compileSelect(query: QueryStructure): CompiledQuery;
    /**
     * Compile an INSERT statement
     *
     * Example output:
     * INSERT INTO users ("name", "email", "created_at") VALUES (?, ?, ?)
     */
    compileInsert(table: string, data: Record<string, QueryValue>): CompiledQuery;
    /**
     * Compile an UPDATE statement
     *
     * Example output:
     * UPDATE users SET "name" = ?, "email" = ?, "updated_at" = ? WHERE "id" = ?
     */
    compileUpdate(table: string, data: Record<string, QueryValue>, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    /**
     * Compile a DELETE statement
     *
     * Example output:
     * DELETE FROM users WHERE "id" = ?
     */
    compileDelete(table: string, primaryKey: string | string[], id: QueryValue | QueryValue[]): CompiledQuery;
    /**
     * Compile a COUNT query
     *
     * Example output:
     * SELECT COUNT(*) as count FROM users WHERE age > ? AND status = ?
     */
    compileCount(query: QueryStructure): CompiledQuery;
    /**
     * Get current timestamp for SQLite
     *
     * Returns ISO datetime string compatible with SQLite
     */
    getCurrentTimestamp(): string;
    /**
     * Escape an identifier (table/column name) for SQLite
     *
     * Examples:
     * - order → "order"
     * - user.name → "user"."name"
     * - my"table → "my""table" (escapes internal quotes)
     */
    private escapeIdentifier;
}
//# sourceMappingURL=sqlite.d.ts.map