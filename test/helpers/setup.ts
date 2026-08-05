/**
 * Every test gets a fresh in-memory database and ORM singleton, so no test can
 * observe another's rows, caches or write queue.
 */

import { ORM, type ORMConfig } from '../../src/orm';
import { SQLiteDialect } from '../../src/plugins/dialects/sqlite';

import { BunSqliteAdapter } from './adapter';
import { SCHEMA } from './schema';

export interface TestContext {
	adapter: BunSqliteAdapter;
	orm: ORM;
}

/** `enableWriteQueue` defaults to true, as recommended for SQLite. */
export async function freshDatabase(
	options: Partial<ORMConfig> = {},
): Promise<TestContext> {
	const adapter = new BunSqliteAdapter();
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

/** Unix seconds, matching SQLiteDialect.getCurrentTimestamp(). */
export function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}
