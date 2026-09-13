/**
 * Tauri7otionSqliteAdapter over a stand-in for tauri-plugin-7otion-sqlite-api: one
 * bun:sqlite connection behind the same `Database` surface the plugin's JS exposes.
 */

import { Database as SqliteDatabase } from 'bun:sqlite';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { ORM } from '../src/orm';
import { Tauri7otionSqliteAdapter } from '../src/plugins/adapters/tauri-7otion-sqlite-adapter';
import { SQLiteDialect } from '../src/plugins/dialects/sqlite';

import { Passage } from './helpers/models';
import { SCHEMA } from './helpers/schema';

const loads: { path: string; options: unknown }[] = [];

class PluginDatabase {
	private readonly db = new SqliteDatabase(':memory:');

	constructor() {
		this.db.exec(SCHEMA);
	}

	static async load(path: string, options?: unknown) {
		loads.push({ path, options });
		return new PluginDatabase();
	}

	async select(sql: string, params: unknown[] = []) {
		return this.db.prepare(sql).all(...(params as never[]));
	}

	async execute(sql: string, params: unknown[] = []) {
		const result = this.db.prepare(sql).run(...(params as never[]));
		return {
			rowsAffected: Number(result.changes),
			lastInsertId: Number(result.lastInsertRowid),
		};
	}

	async inTransaction() {
		return this.db.inTransaction;
	}

	async close() {
		this.db.close();
	}
}

mock.module('tauri-plugin-7otion-sqlite-api', () => ({
	Database: PluginDatabase,
}));

async function adapterFor(
	config: ConstructorParameters<typeof Tauri7otionSqliteAdapter>[0],
) {
	const adapter = new Tauri7otionSqliteAdapter(config);
	await adapter.initialize();
	await ORM.reInitialize({ adapter, dialect: new SQLiteDialect() });
	return adapter;
}

const passage = (ref: string) => ({
	ref,
	title: ref,
	status: 'draft',
	sort: 0,
	auto_continue: 0,
	allow_back: 0,
});

describe('Tauri7otionSqliteAdapter', () => {
	beforeEach(() => {
		loads.length = 0;
	});

	test('loads without options, so it attaches to a database already open', async () => {
		await adapterFor({ database: 'app.sqlite' });

		expect(loads).toEqual([{ path: 'app.sqlite', options: undefined }]);
	});

	test('passes a key and pragmas through', async () => {
		await adapterFor({
			database: 'app.sqlite',
			key: 'secret',
			pragmas: { busy_timeout: 1000 },
		});

		expect(loads[0]!.options).toEqual({
			key: 'secret',
			pragmas: { busy_timeout: 1000 },
		});
	});

	test('runs transactions: a throwing one rolls back', async () => {
		await adapterFor({ database: 'app.sqlite' });

		await expect(
			ORM.getInstance().transaction(async tx => {
				await Passage.create(passage('a'), tx);
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		await ORM.getInstance().transaction(async tx => {
			await Passage.create(passage('b'), tx);
		});

		expect((await Passage.query().get()).map(p => p.ref)).toEqual(['b']);
	});

	test('reports the database state and closes', async () => {
		const adapter = await adapterFor({ database: 'app.sqlite' });

		expect(await adapter.inTransaction()).toBe(false);
		await adapter.beginTransaction();
		expect(await adapter.inTransaction()).toBe(true);
		await adapter.rollback();

		await adapter.close();
		await expect(adapter.query('SELECT 1')).rejects.toThrow(
			/not initialized/,
		);
	});
});
