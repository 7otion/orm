/**
 * Per-test database bootstrap.
 *
 * Every test gets a brand new in-memory SQLite database and a fresh ORM
 * singleton, so no test can observe another's rows, caches or write queue.
 */

import { ORM, type ORMConfig } from '../../src/orm';
import { SQLiteDialect } from '../../src/plugins/dialects/sqlite';

import { BunSqliteAdapter } from './adapter';
import { SCHEMA } from './schema';

export interface TestContext {
	adapter: BunSqliteAdapter;
	orm: ORM;
}

/**
 * Creates a fresh database + ORM. `enableWriteQueue` defaults to true, which
 * is the recommended configuration for SQLite.
 */
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
