/**
 * Transactions, the SQLite write queue, and result caching.
 */

import { describe, expect, test } from 'bun:test';

import { ORM } from '../src/orm';
import { MemoryResultCache } from '../src/plugins/caching/memory';

import { Passage, User } from './helpers/models';
import { freshDatabase } from './helpers/setup';

function newPassage(ref: string): Promise<Passage> {
	return Passage.create({
		ref,
		title: ref,
		status: 'draft',
		sort: 0,
		auto_continue: 0,
		allow_back: 0,
	});
}

describe('transactions', () => {
	test('a successful transaction commits every write', async () => {
		await freshDatabase();

		await ORM.getInstance().transaction(async () => {
			await newPassage('a');
			await newPassage('b');
		});

		expect(await Passage.query().get()).toHaveLength(2);
	});

	test('a throwing transaction rolls everything back', async () => {
		await freshDatabase();

		await expect(
			ORM.getInstance().transaction(async () => {
				await newPassage('a');
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(await Passage.query().get()).toHaveLength(0);
	});

	test('the callback return value is passed through', async () => {
		await freshDatabase();

		const result = await ORM.getInstance().transaction(async () => {
			await newPassage('a');
			return 'done';
		});

		expect(result).toBe('done');
	});

	test('a nested transaction defers to the outermost one', async () => {
		const { adapter } = await freshDatabase();

		await ORM.getInstance().transaction(async () => {
			await newPassage('a');
			await ORM.getInstance().transaction(async () => {
				await newPassage('b');
			});
		});

		// Exactly one BEGIN/COMMIT pair, not two.
		expect(adapter.sqlLog().filter(s => s === 'BEGIN')).toHaveLength(0);
		expect(await Passage.query().get()).toHaveLength(2);
	});

	test('a nested failure rolls back the outer transaction too', async () => {
		await freshDatabase();

		await expect(
			ORM.getInstance().transaction(async () => {
				await newPassage('a');
				await ORM.getInstance().transaction(async () => {
					await newPassage('b');
					throw new Error('inner');
				});
			}),
		).rejects.toThrow('inner');

		expect(await Passage.query().get()).toHaveLength(0);
	});

	test('inTransaction reports the current state', async () => {
		await freshDatabase();
		const orm = ORM.getInstance();

		expect(orm.getAdapter().inTransaction()).toBe(false);
		await orm.transaction(async () => {
			expect(orm.getAdapter().inTransaction()).toBe(true);
		});
		expect(orm.getAdapter().inTransaction()).toBe(false);
	});
});

describe('write queue', () => {
	test('concurrent inserts are serialised', async () => {
		await freshDatabase({ enableWriteQueue: true });

		await Promise.all([
			newPassage('a'),
			newPassage('b'),
			newPassage('c'),
			newPassage('d'),
		]);

		const rows = await Passage.query().get();
		expect(rows.map(r => r.ref).sort()).toEqual(['a', 'b', 'c', 'd']);
	});

	test('one failed write does not poison the queue', async () => {
		await freshDatabase({ enableWriteQueue: true });
		await newPassage('a');

		// Duplicate primary key — this insert must fail.
		await expect(newPassage('a')).rejects.toThrow();

		// The queue must still accept subsequent writes.
		await newPassage('b');
		expect(await Passage.query().get()).toHaveLength(2);
	});

	test('writes still work with the queue disabled', async () => {
		await freshDatabase({ enableWriteQueue: false });

		await newPassage('a');
		expect(await Passage.query().get()).toHaveLength(1);
	});
});

describe('result cache', () => {
	test('an identical query is served from cache', async () => {
		const { adapter } = await freshDatabase({
			resultCacheAdapter: new MemoryResultCache(),
		});
		await User.create({ name: 'Ann', status: 'active' });

		adapter.clearLog();
		await User.query().where('status', 'active').get();
		const firstCount = adapter.log.length;

		await User.query().where('status', 'active').get();
		expect(adapter.log.length).toBe(firstCount);
	});

	test('a write invalidates the cache for that table', async () => {
		const { adapter } = await freshDatabase({
			resultCacheAdapter: new MemoryResultCache(),
		});
		await User.create({ name: 'Ann', status: 'active' });

		expect(await User.query().where('status', 'active').get()).toHaveLength(
			1,
		);

		await User.create({ name: 'Bob', status: 'active' });

		adapter.clearLog();
		const rows = await User.query().where('status', 'active').get();
		expect(rows).toHaveLength(2);
		expect(adapter.log.length).toBeGreaterThan(0);
	});

	test('queries inside a transaction are never cached', async () => {
		const { adapter } = await freshDatabase({
			resultCacheAdapter: new MemoryResultCache(),
		});
		await User.create({ name: 'Ann', status: 'active' });

		await ORM.getInstance().transaction(async () => {
			adapter.clearLog();
			await User.query().where('status', 'active').get();
			await User.query().where('status', 'active').get();
			// Both reads hit the database.
			expect(adapter.log.filter(e => e.kind === 'query')).toHaveLength(2);
		});
	});

	test('caching can be disabled at runtime', async () => {
		const { adapter } = await freshDatabase({
			resultCacheAdapter: new MemoryResultCache(),
		});
		await User.create({ name: 'Ann', status: 'active' });

		ORM.getInstance().setResultCacheDisabled(true);
		adapter.clearLog();
		await User.query().where('status', 'active').get();
		await User.query().where('status', 'active').get();

		expect(adapter.log.filter(e => e.kind === 'query')).toHaveLength(2);
	});
});

describe('lifecycle', () => {
	test('getInstance throws before initialize', async () => {
		const { orm } = await freshDatabase();
		await orm.close();
		// Reaching into the singleton is the only way to model a cold start.
		(ORM as unknown as { instance: ORM | null }).instance = null;

		expect(() => ORM.getInstance()).toThrow(/not initialized/i);

		await freshDatabase();
	});

	test('reInitialize swaps the adapter', async () => {
		const first = await freshDatabase();
		await Passage.create({
			ref: 'a',
			title: 'A',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});
		expect(await Passage.query().get()).toHaveLength(1);

		const second = await freshDatabase();
		expect(second.adapter).not.toBe(first.adapter);
		expect(await Passage.query().get()).toHaveLength(0);
	});
});
