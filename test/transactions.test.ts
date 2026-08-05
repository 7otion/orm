/**
 * Transactions, the SQLite write queue, and ORM lifecycle.
 */

import { describe, expect, test } from 'bun:test';

import { ORM } from '../src/orm';

import { Passage } from './helpers/models';
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
