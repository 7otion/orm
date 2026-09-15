# Adapters and dialects

## Adapters

Implement `DatabaseAdapter` to target another driver:

```ts
import type { DatabaseAdapter, DatabaseRow, QueryValue } from '@7otion/orm';

export class MyAdapter implements DatabaseAdapter {
	async query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]> {
		/* … */
	}
	async execute(sql: string, params?: QueryValue[]): Promise<number> {
		/* affected rows */
	}
	async insert(sql: string, params?: QueryValue[]): Promise<number> {
		/* new row id */
	}
	async close(): Promise<void> {
		/* … */
	}
}
```

`insert()` must return the generated row id — that is what an omitted primary
key adopts. `query()` must run any statement that yields rows, including an
`INSERT … RETURNING`, which `createMany()` uses to adopt generated keys.

An adapter that can run transactions implements `TransactionalAdapter`, which
adds four methods:

```ts
import type { TransactionalAdapter } from '@7otion/orm';

export class MyTransactionalAdapter
	extends MyAdapter
	implements TransactionalAdapter
{
	async beginTransaction(): Promise<void> {
		/* BEGIN */
	}
	async commit(): Promise<void> {
		/* COMMIT */
	}
	async rollback(): Promise<void> {
		/* ROLLBACK */
	}
	async inTransaction(): Promise<boolean> {
		/* the database's own state — for SQLite, !sqlite3_get_autocommit() */
	}
}
```

`BEGIN`, the statements after it and `COMMIT` or `ROLLBACK` are separate calls,
so every call must reach the same connection. An adapter over a connection pool
cannot promise that and must not implement `TransactionalAdapter`.

`inTransaction()` must read the database, not a flag the adapter keeps: it is
asked after a failure, when only the database knows whether the transaction
survived.

The ORM decides by which interface the adapter implements. One that has some of
the four methods but not all is refused when the ORM is initialised.

## Bundled adapters

```ts
import { TauriAdapter, Tauri7otionSqliteAdapter } from '@7otion/orm';

const adapter = new TauriAdapter({
	database: 'sqlite:myapp.db',
	debug: true, // log every statement
});
await adapter.initialize();
```

`TauriAdapter` supports no transactions. `tauri-plugin-sql` runs each call on
a connection taken from a pool, so a `BEGIN` and its `COMMIT` can reach different
connections ([tauri-apps/plugins-workspace#886](https://github.com/tauri-apps/plugins-workspace/issues/886)).
Anything that needs a transaction is refused on it — see
[Transactions](transactions.md). For the same reason it sets only
`journal_mode = WAL`, which SQLite stores in the database file; a per-connection
setting would reach one pooled connection.

For transactions in Tauri, use `Tauri7otionSqliteAdapter` with
[tauri-plugin-7otion-sqlite](https://github.com/7otion/tauri-plugin-7otion-sqlite),
which keeps one connection per database file:

```ts
const adapter = new Tauri7otionSqliteAdapter({ database: 'app.sqlite' });
await adapter.initialize();
```

It also takes `key` (SQLCipher) and `pragmas`, passed to the plugin's `load`.

## Dialects

Implement `SqlDialect` to target another SQL flavour. `SQLiteDialect` ships
with the package.

| method               | required for                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `compileSelect`      | reads                                                            |
| `compileInsert`      | `save()` on a new model                                          |
| `compileInsertMany`  | `createMany()`; with `returning`, yields rowid and those columns |
| `compileUpdate`      | `save()` on an existing model                                    |
| `compileDelete`      | `model.delete()`                                                 |
| `compileCount`       | `paginate()`, `count()`                                          |
| `compileAggregate`   | `sum()`, `avg()`, `min()`, `max()` — optional                    |
| `compileDeleteQuery` | `QueryBuilder.delete()`                                          |
| `compileUpdateQuery` | `QueryBuilder.update()`                                          |

Dialects generate SQL and never execute it. Bind every value; only identifiers
belong in the statement text.
