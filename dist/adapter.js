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
export {};
//# sourceMappingURL=adapter.js.map