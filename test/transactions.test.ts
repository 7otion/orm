/**
 * Transactions, the SQLite write queue, and ORM lifecycle.
 */

import { describe, expect, spyOn, test } from 'bun:test';

import { ORM } from '../src/orm';
import type { Transaction } from '../src/transaction';

import { Passage } from './helpers/models';
import { freshDatabase } from './helpers/setup';

function newPassage(ref: string, tx?: Transaction): Promise<Passage> {
	return Passage.create(
		{
			ref,
			title: ref,
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		},
		tx,
	);
}

/** Enough rows for two INSERT statements; the second repeats a key from the first. */
function rowsFailingInSecondStatement(): Parameters<
	typeof Passage.createMany
>[0] {
	const rows = Array.from({ length: 200 }, (_, i) => ({
		ref: `bulk-${i}`,
		title: 'bulk',
		status: 'draft',
		sort: 0,
		auto_continue: 0,
		allow_back: 0,
	}));
	rows[150]!.ref = 'bulk-0';
	return rows;
}

describe('transactions', () => {
	test('a successful transaction commits every write', async () => {
		await freshDatabase();

		await ORM.getInstance().transaction(async tx => {
			await newPassage('a', tx);
			await newPassage('b', tx);
		});

		expect(await Passage.query().get()).toHaveLength(2);
	});

	test('a throwing transaction rolls everything back', async () => {
		await freshDatabase();

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(await Passage.query().get()).toHaveLength(0);
	});

	test('the callback return value is passed through', async () => {
		await freshDatabase();

		const result = await ORM.getInstance().transaction(async tx => {
			await newPassage('a', tx);
			return 'done';
		});

		expect(result).toBe('done');
	});

	test('a nested transaction defers to the outermost one', async () => {
		const { adapter } = await freshDatabase();

		await ORM.getInstance().transaction(async tx => {
			await newPassage('a', tx);
			await ORM.getInstance().transaction(async inner => {
				expect(inner).toBe(tx);
				await newPassage('b', inner);
			}, tx);
		});

		// Exactly one BEGIN/COMMIT pair, not two.
		expect(adapter.sqlLog().filter(s => s === 'BEGIN')).toHaveLength(0);
		expect(await Passage.query().get()).toHaveLength(2);
	});

	test('a nested failure rolls back the outer transaction too', async () => {
		await freshDatabase();

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				await ORM.getInstance().transaction(async inner => {
					await newPassage('b', inner);
					throw new Error('inner');
				}, tx);
			}),
		).rejects.toThrow('inner');

		expect(await Passage.query().get()).toHaveLength(0);
	});

	test('a nested transaction without its handle is reported', async () => {
		await freshDatabase();

		await expect(
			ORM.getInstance().transaction(async () => {
				await ORM.getInstance().transaction(async inner => {
					await newPassage('a', inner);
				});
			}),
		).rejects.toThrow(/without its tx handle/);
	});

	test('a transaction from unrelated code waits instead of joining', async () => {
		await freshDatabase();

		const first = ORM.getInstance().transaction(async tx => {
			await newPassage('first', tx);
			await new Promise(r => setTimeout(r, 20));
			throw new Error('rollback');
		});
		// Issued once `first` is open, from outside its body.
		await new Promise(r => setTimeout(r, 5));
		const second = ORM.getInstance().transaction(async tx => {
			await newPassage('second', tx);
		});

		await expect(first).rejects.toThrow('rollback');
		await second;

		expect((await Passage.query().get()).map(p => p.ref)).toEqual([
			'second',
		]);
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

describe('transaction isolation', () => {
	test('an unrelated write is not swept into a rollback', async () => {
		await freshDatabase();
		await newPassage('seed');

		const tx = ORM.getInstance().transaction(async tx => {
			await newPassage('inTx', tx);
			await new Promise(r => setTimeout(r, 20));
			throw new Error('rollback');
		});

		// Issued while the transaction is open, from unrelated code.
		const outside = newPassage('outsideTx');

		await expect(tx).rejects.toThrow('rollback');
		await outside;

		const refs = (await Passage.query().get()).map(p => p.ref).sort();
		expect(refs).toEqual(['outsideTx', 'seed']);
	});

	test('held writes still run after a rollback', async () => {
		await freshDatabase();

		const tx = ORM.getInstance().transaction(async () => {
			await new Promise(r => setTimeout(r, 20));
			throw new Error('rollback');
		});
		const outside = newPassage('after');

		await expect(tx).rejects.toThrow('rollback');
		await outside;

		expect(await Passage.query().get()).toHaveLength(1);
	});

	test('a write already in flight is not swallowed by a transaction', async () => {
		await freshDatabase();

		const earlier = newPassage('earlier');
		const tx = ORM.getInstance().transaction(async tx => {
			await newPassage('inTx', tx);
			throw new Error('rollback');
		});

		await earlier;
		await expect(tx).rejects.toThrow('rollback');

		expect((await Passage.query().get()).map(p => p.ref)).toEqual([
			'earlier',
		]);
	});

	test('isolation holds with the write queue disabled', async () => {
		await freshDatabase({ enableWriteQueue: false });

		const tx = ORM.getInstance().transaction(async tx => {
			await newPassage('inTx', tx);
			await new Promise(r => setTimeout(r, 20));
			throw new Error('rollback');
		});
		const outside = newPassage('outsideTx');

		await expect(tx).rejects.toThrow('rollback');
		await outside;

		expect((await Passage.query().get()).map(p => p.ref)).toEqual([
			'outsideTx',
		]);
	});

	test('forgetting the handle reports it instead of stalling', async () => {
		await freshDatabase();

		await expect(
			ORM.getInstance().transaction(async () => {
				await newPassage('a');
			}),
		).rejects.toThrow(/without its tx handle/);
	});

	test('a handle from a finished transaction is refused', async () => {
		await freshDatabase();

		let stale!: Transaction;
		await ORM.getInstance().transaction(async tx => {
			stale = tx;
		});

		await expect(newPassage('a', stale)).rejects.toThrow(/already ended/);
	});
});

describe('bulk write isolation', () => {
	test('an unrelated write is not swept into a failed bulk write', async () => {
		await freshDatabase({ enableWriteQueue: false });

		const bulk = Passage.createMany(rowsFailingInSecondStatement());
		const outside = newPassage('outside');

		await expect(bulk).rejects.toThrow();
		await outside;

		expect((await Passage.query().get()).map(p => p.ref)).toEqual([
			'outside',
		]);
	});

	test('a bulk write does not join another one', async () => {
		await freshDatabase({ enableWriteQueue: false });

		const failing = Passage.createMany(rowsFailingInSecondStatement());
		const other = Passage.createMany([
			{
				ref: 'other',
				title: 'other',
				status: 'draft',
				sort: 0,
				auto_continue: 0,
				allow_back: 0,
			},
		]);

		await expect(failing).rejects.toThrow();
		await other;

		expect((await Passage.query().get()).map(p => p.ref)).toEqual([
			'other',
		]);
	});
});

describe('a failed commit or rollback', () => {
	test('the caller receives the original error when the rollback fails too', async () => {
		const { adapter } = await freshDatabase();
		const reported = spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				// SQLite ending the transaction on its own, as a disk-full error does.
				adapter.db.exec('ROLLBACK');
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(reported).toHaveBeenCalled();
		reported.mockRestore();
	});

	test('the next transaction still rolls back', async () => {
		const { adapter } = await freshDatabase();
		const reported = spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				adapter.db.exec('ROLLBACK');
			}),
		).rejects.toThrow(/cannot commit/);
		reported.mockRestore();

		expect(adapter.inTransaction()).toBe(false);

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('b', tx);
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(await Passage.query().count()).toBe(0);
	});
});
