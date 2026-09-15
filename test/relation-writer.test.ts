/** `sync`: making the far side of a to-many relation hold exactly a given set, by difference. */

import { describe, expect, test } from 'bun:test';

import { Model } from '../src/model';
import { ORM } from '../src/orm';
import type { BunSqliteAdapter } from './helpers/adapter';
import { freshDatabase, freshPlainDatabase } from './helpers/setup';

class Tag extends Model<Tag> {
	static config = {
		table: 'character_tags',
		primaryKey: ['character_ref', 'tag'],
		timestamps: false,
	};

	character_ref!: string;
	tag!: string;
	sort!: number;

	static readonly relationships = {};
}

class Owner extends Model<Owner> {
	static config = {
		table: 'characters',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	name!: string;
	is_player!: number;
	pron_plural!: number;

	tags!: Tag[];

	static readonly relationships = {
		tags: this.hasMany(Tag, 'character_ref', 'ref'),
	};
}

const seed = async () => {
	await freshDatabase();
	return Owner.create({
		ref: 'alice',
		name: 'Alice',
		is_player: 0,
		pron_plural: 0,
	});
};

const tags = async () =>
	(await Tag.query().orderBy('tag').get()).map(
		row => `${row.tag}:${row.sort}`,
	);

describe('sync', () => {
	test('fills an empty set', async () => {
		const owner = await seed();

		expect(await owner.relation('tags').sync(['hero', 'mage'])).toEqual({
			attached: 2,
			detached: 0,
			updated: 0,
			unchanged: 0,
		});
		expect(await tags()).toEqual(['hero:0', 'mage:0']);
	});

	test('empties a full one', async () => {
		const owner = await seed();
		await owner.relation('tags').sync(['hero', 'mage']);

		expect(await owner.relation('tags').sync([])).toEqual({
			attached: 0,
			detached: 2,
			updated: 0,
			unchanged: 0,
		});
		expect(await tags()).toEqual([]);
	});

	test('diffs rather than deleting everything', async () => {
		const { adapter } = await freshDatabase();
		const owner = await Owner.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		await owner.relation('tags').sync(['hero', 'mage']);

		adapter.clearLog();
		const result = await owner.relation('tags').sync(['hero', 'rogue']);

		expect(result).toEqual({
			attached: 1,
			detached: 1,
			updated: 0,
			unchanged: 1,
		});
		expect(await tags()).toEqual(['hero:0', 'rogue:0']);

		// One statement each, and 'hero' was never touched.
		expect(
			adapter.sqlLog().filter(sql => /^(INSERT|DELETE|UPDATE)/.test(sql)),
		).toHaveLength(2);
	});

	test('updates a matched row whose other columns moved', async () => {
		const owner = await seed();
		await owner.relation('tags').sync([{ tag: 'hero', sort: 0 }]);

		expect(
			await owner.relation('tags').sync([{ tag: 'hero', sort: 5 }]),
		).toEqual({ attached: 0, detached: 0, updated: 1, unchanged: 0 });
		expect(await tags()).toEqual(['hero:5']);
	});

	test('a partial row leaves columns it does not mention', async () => {
		const owner = await seed();
		await owner.relation('tags').sync([{ tag: 'hero', sort: 7 }]);

		await owner.relation('tags').sync(['hero']);
		expect(await tags()).toEqual(['hero:7']);
	});

	test('a failed insert does not lose the rows it replaced', async () => {
		const { adapter } = await freshDatabase();
		const owner = await Owner.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		await owner.relation('tags').sync(['hero', 'mage']);

		const execute = adapter.execute.bind(adapter);
		adapter.execute = async (sql, params) => {
			if (sql.startsWith('INSERT')) throw new Error('boom');
			return execute(sql, params);
		};

		await expect(owner.relation('tags').sync(['rogue'])).rejects.toThrow(
			'boom',
		);
		adapter.execute = execute;

		expect(await tags()).toEqual(['hero:0', 'mage:0']);
	});
});

describe('identifying members', () => {
	test('a generated key cannot identify one, and says so', async () => {
		await freshDatabase();

		class Link extends Model<Link> {
			static config = { table: 'character_assets', timestamps: false };
			id!: number;
			character_ref!: string;
			asset_ref!: string;
			kind!: string;
			static readonly relationships = {};
		}
		class Holder extends Model<Holder> {
			static config = {
				table: 'characters',
				primaryKey: 'ref',
				timestamps: false,
			};
			ref!: string;
			name!: string;
			is_player!: number;
			pron_plural!: number;
			links!: Link[];
			static readonly relationships = {
				links: this.hasMany(Link, 'character_ref', 'ref'),
			};
		}

		const holder = await Holder.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});

		await expect(
			holder.relation('links').sync([{ asset_ref: 'a1', kind: 'p' }]),
		).rejects.toThrow(/identifies it/);

		// Naming the identifying columns makes it work.
		await holder.relation('links').sync(
			[
				{ asset_ref: 'a1', kind: 'portrait' },
				{ asset_ref: 'a2', kind: 'sprite' },
			],
			{ matchOn: ['asset_ref', 'kind'] },
		);

		expect(await Link.query().get()).toHaveLength(2);
	});
});

describe('transaction isolation', () => {
	test('a sync issued while a transaction is open is not swept into its rollback', async () => {
		const owner = await seed();

		const tx = ORM.getInstance().transaction(async () => {
			await new Promise(r => setTimeout(r, 20));
			throw new Error('rollback');
		});
		const outside = owner.relation('tags').sync(['hero']);

		await expect(tx).rejects.toThrow('rollback');
		await outside;

		expect(await tags()).toEqual(['hero:0']);
	});

	test('a sync inside a transaction without its handle is reported', async () => {
		const owner = await seed();

		await expect(
			ORM.getInstance().transaction(async () => {
				await owner.relation('tags').sync(['hero']);
			}),
		).rejects.toThrow(/without its tx handle/);
	});

	test('a sync diffs against the rows as they are when it runs', async () => {
		const owner = await seed();

		const tx = ORM.getInstance().transaction(async tx => {
			await new Promise(r => setTimeout(r, 20));
			await Tag.create(
				{ character_ref: 'alice', tag: 'mage', sort: 0 },
				tx,
			);
		});
		const synced = owner.relation('tags').sync(['hero']);

		await tx;
		await synced;

		expect(await tags()).toEqual(['hero:0']);
	});
});

describe('a transaction only when the work needs one', () => {
	const transactionStatements = (adapter: BunSqliteAdapter) =>
		adapter.log.filter(e => e.kind === 'transaction').map(e => e.sql);

	test('a one-statement sync issues no BEGIN', async () => {
		const { adapter } = await freshDatabase();
		const owner = await Owner.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});

		await owner.relation('tags').sync(['hero', 'mage']);

		expect(transactionStatements(adapter)).toEqual([]);
	});

	test('a sync that adds and removes runs in one transaction', async () => {
		const { adapter } = await freshDatabase();
		const owner = await Owner.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		await owner.relation('tags').sync(['hero', 'mage']);

		adapter.clearLog();
		await owner.relation('tags').sync(['hero', 'rogue']);

		expect(transactionStatements(adapter)).toEqual(['BEGIN', 'COMMIT']);
	});
});

describe('adapters without transactions', () => {
	const plainOwner = async () => {
		const context = await freshPlainDatabase();
		const owner = await Owner.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		return { ...context, owner };
	};

	test('a one-statement sync runs', async () => {
		const { owner } = await plainOwner();

		await owner.relation('tags').sync(['hero', 'mage']);

		expect(await tags()).toEqual(['hero:0', 'mage:0']);
	});

	test('a sync needing several statements is refused before writing', async () => {
		const { adapter, owner } = await plainOwner();
		await owner.relation('tags').sync(['hero', 'mage']);

		adapter.clearLog();
		await expect(
			owner.relation('tags').sync(['hero', 'rogue']),
		).rejects.toThrow(/needs 2 statements to land together/);

		expect(adapter.log.filter(e => e.kind !== 'query')).toEqual([]);
		expect(await tags()).toEqual(['hero:0', 'mage:0']);
	});
});

describe('bookkeeping', () => {
	test('a loaded relation is dropped, so the next read reloads', async () => {
		await seed();
		const [loaded] = await Owner.query().with('tags').get();

		await loaded!.relation('tags').sync(['hero']);

		expect('_tags' in (loaded as never as Record<string, unknown>)).toBe(
			false,
		);
	});

	test('a to-one relation and an unknown name are refused', async () => {
		const owner = await seed();

		class Solo extends Model<Solo> {
			static config = {
				table: 'characters',
				primaryKey: 'ref',
				timestamps: false,
			};
			ref!: string;
			static readonly relationships = {
				one: this.hasOne(Tag, 'character_ref', 'ref'),
			};
		}

		// Both are compile errors first; the runtime check backs up untyped
		// callers. The directives are themselves assertions.
		// @ts-expect-error a to-one relation has no set to write
		() => new Solo().relation('one');
		// @ts-expect-error no such relation
		() => owner.relation('nope');

		const untyped = (model: unknown) =>
			model as { relation(name: string): unknown };

		expect(() => untyped(new Solo()).relation('one')).toThrow(
			/not a to-many relation/,
		);
		expect(() => untyped(owner).relation('nope')).toThrow(
			/declares no relation/,
		);
	});
});
