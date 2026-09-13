/**
 * Transactions, the SQLite write queue, and ORM lifecycle.
 */

import { describe, expect, spyOn, test } from 'bun:test';

import { ORM } from '../src/orm';
import { SQLiteDialect } from '../src/plugins/dialects/sqlite';
import type { Transaction } from '../src/transaction';

import {
	PlainBunSqliteAdapter,
	type BunSqliteAdapter,
} from './helpers/adapter';
import { CharacterTag, Passage } from './helpers/models';
import { freshDatabase, freshPlainDatabase } from './helpers/setup';

/** The pre-3.32 SQLite limit, so a few hundred rows span several statements. */
const smallLimit = () => ({
	dialect: new SQLiteDialect({ maxBindParameters: 999 }),
});

function transactionStatements(adapter: BunSqliteAdapter): string[] {
	return adapter.log.filter(e => e.kind === 'transaction').map(e => e.sql);
}

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

		expect(transactionStatements(adapter)).toEqual(['BEGIN', 'COMMIT']);
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

	test('the adapter reports the database state around a transaction', async () => {
		const { adapter } = await freshDatabase();

		expect(await adapter.inTransaction()).toBe(false);
		await ORM.getInstance().transaction(async () => {
			expect(await adapter.inTransaction()).toBe(true);
		});
		expect(await adapter.inTransaction()).toBe(false);
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
		await freshDatabase({ ...smallLimit(), enableWriteQueue: false });

		const bulk = Passage.createMany(rowsFailingInSecondStatement());
		const outside = newPassage('outside');

		await expect(bulk).rejects.toThrow();
		await outside;

		expect((await Passage.query().get()).map(p => p.ref)).toEqual([
			'outside',
		]);
	});

	test('a bulk write does not join another one', async () => {
		await freshDatabase({ ...smallLimit(), enableWriteQueue: false });

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
		adapter.rollback = async () => {
			throw new Error('rollback failed');
		};

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(reported).toHaveBeenCalled();
		reported.mockRestore();
		adapter.db.exec('ROLLBACK');
	});

	test('a transaction the database already ended is not rolled back again', async () => {
		const { adapter } = await freshDatabase();
		const reported = spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				adapter.db.exec('ROLLBACK');
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(reported).not.toHaveBeenCalled();
		expect(transactionStatements(adapter)).toEqual(['BEGIN']);
		reported.mockRestore();
	});

	test('the next transaction still rolls back', async () => {
		const { adapter } = await freshDatabase();

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				adapter.db.exec('ROLLBACK');
			}),
		).rejects.toThrow(/cannot commit/);

		expect(await adapter.inTransaction()).toBe(false);

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('b', tx);
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(await Passage.query().count()).toBe(0);
	});
});

describe('the database rolling a transaction back on its own', () => {
	/** Fails the insert for `ref` the way a disk-full error does: SQLite ends the transaction. */
	function failWithRollback(adapter: BunSqliteAdapter, ref: string): void {
		const insert = adapter.insert.bind(adapter);
		adapter.insert = async (sql, params) => {
			if (params?.includes(ref)) {
				adapter.db.exec('ROLLBACK');
				throw new Error('disk full');
			}
			return insert(sql, params);
		};
	}

	test('later writes with the handle are refused, and nothing commits', async () => {
		const { adapter } = await freshDatabase();
		failWithRollback(adapter, 'explode');

		let refused: unknown;
		await expect(
			ORM.getInstance().transaction(async tx => {
				await newPassage('a', tx);
				await newPassage('explode', tx).catch(() => {});
				refused = await newPassage('c', tx).catch(error => error);
			}),
		).rejects.toThrow(/rolled the whole transaction back/);

		expect(String(refused)).toMatch(/rolled the whole transaction back/);
		expect(await Passage.query().count()).toBe(0);
	});

	test('a caught constraint error leaves the transaction running', async () => {
		await freshDatabase();

		await ORM.getInstance().transaction(async tx => {
			await newPassage('a', tx);
			await newPassage('a', tx).catch(() => {});
			await newPassage('b', tx);
		});

		expect(await Passage.query().count()).toBe(2);
	});
});

describe('a transaction only when the work needs one', () => {
	const tags = (count: number, sort = 0) =>
		Array.from({ length: count }, (_, i) => ({
			character_ref: 'alice',
			tag: `tag-${i}`,
			sort,
		}));

	test('a one-statement createMany issues no BEGIN', async () => {
		const { adapter } = await freshDatabase();

		await CharacterTag.createMany(tags(3));

		expect(transactionStatements(adapter)).toEqual([]);
		expect(await CharacterTag.query().count()).toBe(3);
	});

	test('a createMany of several statements runs in one transaction', async () => {
		const { adapter } = await freshDatabase(smallLimit());

		// 999 / 3 columns = 333 rows per statement.
		await CharacterTag.createMany(tags(600));

		expect(transactionStatements(adapter)).toEqual(['BEGIN', 'COMMIT']);
	});

	test('a one-statement updateMany issues no BEGIN', async () => {
		const { adapter } = await freshDatabase();
		await CharacterTag.createMany(tags(3));
		const rows = await CharacterTag.query().get();
		rows.forEach((row, i) => (row.sort = i + 1));

		adapter.clearLog();
		await CharacterTag.updateMany(rows);

		expect(transactionStatements(adapter)).toEqual([]);
	});
});

describe('adapters without transactions', () => {
	test('transaction() is refused before anything runs', async () => {
		const { adapter } = await freshPlainDatabase();
		let ran = false;

		await expect(
			ORM.getInstance().transaction(async () => {
				ran = true;
			}),
		).rejects.toThrow(/does not implement TransactionalAdapter/);

		expect(ran).toBe(false);
		expect(adapter.log).toEqual([]);
	});

	test('a one-statement bulk write runs', async () => {
		await freshPlainDatabase();

		await CharacterTag.createMany([
			{ character_ref: 'alice', tag: 'hero' },
			{ character_ref: 'alice', tag: 'mage' },
		]);
		const rows = await CharacterTag.query().get();
		rows.forEach((row, i) => (row.sort = i + 1));
		await CharacterTag.updateMany(rows);

		expect(
			(await CharacterTag.query().orderBy('sort').get()).map(r => r.sort),
		).toEqual([1, 2]);
	});

	test('a bulk write needing several statements is refused before writing', async () => {
		const { adapter } = await freshPlainDatabase(smallLimit());

		const rows = Array.from({ length: 600 }, (_, i) => ({
			character_ref: 'alice',
			tag: `tag-${i}`,
		}));

		await expect(CharacterTag.createMany(rows)).rejects.toThrow(
			/needs 2 statements to land together/,
		);

		expect(adapter.log.filter(e => e.kind !== 'query')).toEqual([]);
		expect(await CharacterTag.query().count()).toBe(0);
	});

	test('an adapter with only some transaction methods is refused', async () => {
		await freshPlainDatabase();
		await newPassage('kept');
		const partial = Object.assign(new PlainBunSqliteAdapter(), {
			beginTransaction: async () => {},
		});

		await expect(
			ORM.reInitialize({
				adapter: partial,
				dialect: new SQLiteDialect(),
			}),
		).rejects.toThrow(/implements part of TransactionalAdapter/);

		// The refused config left the working ORM and its connection in place.
		expect(await Passage.query().count()).toBe(1);
	});
});
