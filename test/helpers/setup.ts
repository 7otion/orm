/**
 * Every test gets a fresh in-memory database and ORM singleton, so no test can
 * observe another's rows or write queue.
 */

import { ORM, type ORMConfig } from '../../src/orm';
import { SQLiteDialect } from '../../src/plugins/dialects/sqlite';

import { BunSqliteAdapter, PlainBunSqliteAdapter } from './adapter';
import { SCHEMA } from './schema';

export interface TestContext<
	A extends PlainBunSqliteAdapter = BunSqliteAdapter,
> {
	adapter: A;
	orm: ORM;
}

/** `enableWriteQueue` defaults to true, as recommended for SQLite. */
export async function freshDatabase(
	options: Partial<ORMConfig> = {},
): Promise<TestContext> {
	return initialize(new BunSqliteAdapter(), options);
}

/** The same database behind an adapter without transactions. */
export async function freshPlainDatabase(
	options: Partial<ORMConfig> = {},
): Promise<TestContext<PlainBunSqliteAdapter>> {
	return initialize(new PlainBunSqliteAdapter(), options);
}

async function initialize<A extends PlainBunSqliteAdapter>(
	adapter: A,
	options: Partial<ORMConfig>,
): Promise<TestContext<A>> {
	adapter.db.exec(SCHEMA);

	await ORM.reInitialize({
		adapter,
		dialect: new SQLiteDialect(),
		enableWriteQueue: true,
		...options,
	});

	adapter.clearLog();

	return { adapter, orm: ORM.getInstance() };
}
