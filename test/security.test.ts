/**
 * Regression tests for the identifier-injection and mass-assignment findings.
 *
 * Values were always bound; these cover the parts that are interpolated into
 * SQL (column and table names) and the paths that write model state from a
 * caller-supplied object.
 */

import { describe, expect, test } from 'bun:test';

import { Model } from '../src/model';
import { Passage, User } from './helpers/models';
import { freshDatabase } from './helpers/setup';

describe('identifier injection', () => {
	test('where() rejects a column that is not a plain name', async () => {
		await freshDatabase();

		expect(() =>
			User.query().where('1=1 OR name IS NOT NULL --', 'x'),
		).toThrow(/unsafe column/i);
	});

	test('whereIn() rejects an injected column', async () => {
		await freshDatabase();

		expect(() => User.query().whereIn('id) OR 1=1 --', [1])).toThrow(
			/unsafe column/i,
		);
	});

	test('orderBy() rejects an injected column', async () => {
		await freshDatabase();

		expect(() => User.query().orderBy('name; DROP TABLE users--')).toThrow(
			/unsafe column/i,
		);
	});

	test('select() rejects an injected column', async () => {
		await freshDatabase();

		expect(() => User.query().select('* FROM users; --')).toThrow(
			/unsafe column/i,
		);
	});

	test('join() rejects injected tables and columns', async () => {
		await freshDatabase();

		expect(() =>
			User.query().innerJoin('roles; DROP TABLE users--', 'a', '=', 'b'),
		).toThrow(/unsafe table/i);

		expect(() =>
			User.query().innerJoin('roles', 'a OR 1=1', '=', 'b'),
		).toThrow(/unsafe join column/i);
	});

	test('legitimate plain and dotted identifiers still work', async () => {
		await freshDatabase();
		await User.create({ name: 'Ann', status: 'active' });

		const rows = await User.query()
			.select('users.id', 'users.name')
			.where('users.status', 'active')
			.orderBy('users.name')
			.get();

		expect(rows).toHaveLength(1);
	});

	test('column names are escaped in the emitted SQL', async () => {
		const { adapter } = await freshDatabase();
		await User.create({ name: 'Ann', status: 'active' });

		adapter.clearLog();
		await User.query().where('status', 'active').get();

		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).toContain('"status" = ?');
	});

	test('expressions must go through the raw escape hatch', async () => {
		await freshDatabase();
		await User.create({ name: 'ANN', status: 'active' });

		expect(() => User.query().where('LOWER(name)', 'ann')).toThrow(
			/unsafe column/i,
		);

		const rows = await User.query()
			.whereRaw('LOWER(name) = ?', ['ann'])
			.get();
		expect(rows).toHaveLength(1);
	});

	test('values containing SQL are still bound, never interpolated', async () => {
		const { adapter } = await freshDatabase();
		await User.create({ name: 'Ann' });

		await User.query().where('name', "'); DROP TABLE users;--").get();

		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).not.toContain('DROP TABLE');
		expect(await User.query().get()).toHaveLength(1);
	});
});

describe('mass assignment', () => {
	class Account extends Model<Account> {
		static config = {
			table: 'users',
			timestamps: false,
			guarded: ['status'],
		};
		id!: number;
		name!: string | null;
		status!: string | null;
	}

	class Restricted extends Model<Restricted> {
		static config = {
			table: 'users',
			timestamps: false,
			fillable: ['name'],
		};
		id!: number;
		name!: string | null;
		status!: string | null;
	}

	test('guarded columns are skipped by create()', async () => {
		await freshDatabase();

		const a = await Account.create({ name: 'Eve', status: 'admin' });
		expect(a.name).toBe('Eve');
		expect(a.status).toBeUndefined();
	});

	test('fillable acts as an allow-list', async () => {
		await freshDatabase();

		const r = await Restricted.create({
			name: 'Eve',
			status: 'admin',
			id: 9999,
		});
		expect(r.name).toBe('Eve');
		expect(r.status).toBeUndefined();
		expect(r.id).not.toBe(9999);
	});

	test('fill() never writes ORM internals', async () => {
		await freshDatabase();

		const passage = await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});

		passage.fill(
			JSON.parse('{"_exists": false, "_attributes": {}, "title": "Ok"}'),
		);

		expect(passage.title).toBe('Ok');
		// Persistence state survived a hostile payload.
		expect((passage as unknown as { _exists: boolean })._exists).toBe(true);
		await passage.save();
		expect(await Passage.query().get()).toHaveLength(1);
	});

	test('a model declaring neither still accepts every column', async () => {
		await freshDatabase();

		const u = await User.create({ name: 'Ann', status: 'active' });
		expect(u.name).toBe('Ann');
		expect(u.status).toBe('active');
	});
});
