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
export {};
//# sourceMappingURL=dialect.js.map