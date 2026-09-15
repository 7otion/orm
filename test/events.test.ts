/** Model events: hooks inside the write, listeners after its commit. */

import { afterEach, describe, expect, test } from 'bun:test';

import { Model } from '../src/model';
import { ORM } from '../src/orm';
import { ListenerError } from '../src/transaction';
import type { Hook, ModelEvent, ModelHooks } from '../src/events';
import type { BunSqliteAdapter } from './helpers/adapter';
import { freshDatabase, freshPlainDatabase } from './helpers/setup';

const EVENTS: ModelEvent[] = [
	'saving',
	'creating',
	'created',
	'saved',
	'updating',
	'updated',
	'deleting',
	'deleted',
];

/* Hooks are static, so each class forwards every event to a slot a test fills. */
type Slots<T> = { [E in ModelEvent]?: Hook<T> };

const slots = {
	author: {} as Slots<Author>,
	tag: {} as Slots<AuthorTag>,
	memo: {} as Slots<Memo>,
};

function forwarding<T>(slot: Slots<T>): ModelHooks<T> {
	const hooks: { [E in ModelEvent]?: Hook<T> } = {};
	for (const event of EVENTS) {
		hooks[event] = (batch, tx) => slot[event]?.(batch, tx);
	}
	return hooks;
}

class AuthorTag extends Model<AuthorTag> {
	static config = {
		table: 'character_tags',
		primaryKey: ['character_ref', 'tag'],
		timestamps: false,
	};

	character_ref!: string;
	tag!: string;
	sort!: number;

	static readonly relationships = {};
	static readonly hooks: ModelHooks<AuthorTag> = forwarding(slots.tag);
}

class Author extends Model<Author> {
	static config = {
		table: 'characters',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	name!: string;
	is_player!: number;
	pron_plural!: number;

	tags!: AuthorTag[];

	static readonly relationships = {
		tags: this.hasMany(AuthorTag, 'character_ref', 'ref'),
	};
	static readonly hooks: ModelHooks<Author> = forwarding(slots.author);
}

/** Generated integer key, with hooks. */
class Memo extends Model<Memo> {
	static config = { table: 'notes', timestamps: false };

	id!: number;
	body!: string;

	static readonly relationships = {};
	static readonly hooks: ModelHooks<Memo> = forwarding(slots.memo);
}

/** Declares no hooks in its body; a test assigns them after the registry exists. */
class Late extends Model<Late> {
	static config = { table: 'notes', timestamps: false };

	id!: number;
	body!: string;

	static readonly relationships = {};
}

/** No hooks at all, so its writes stay plain unless a listener is attached. */
class Piece extends Model<Piece> {
	static config = { table: 'fragments', timestamps: false };

	id!: number;
	schema_ref!: string;
	owner_ref!: string;
	suffix!: string;
	content!: string | null;
	sort!: number;

	static readonly relationships = {};
}

const subscriptions: (() => void)[] = [];

/** Registers a listener for one test; `afterEach` removes it. */
function listen(unsubscribe: () => void): void {
	subscriptions.push(unsubscribe);
}

afterEach(() => {
	for (const slot of Object.values(slots)) {
		for (const event of EVENTS) delete slot[event];
	}
	for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
	Late.hooks = undefined;
});

function transactionStatements(adapter: BunSqliteAdapter): string[] {
	return adapter.log.filter(e => e.kind === 'transaction').map(e => e.sql);
}

function statementsStartingWith(
	adapter: BunSqliteAdapter,
	prefix: string,
): string[] {
	return adapter.log.map(e => e.sql).filter(sql => sql.startsWith(prefix));
}

function newAuthor(ref: string, tx?: Parameters<Hook<Author>>[1]) {
	return Author.create({ ref, name: ref, is_player: 0, pron_plural: 0 }, tx);
}

async function seedAuthorWithTags(ref = 'alice'): Promise<Author> {
	const author = await newAuthor(ref);
	await AuthorTag.createMany([
		{ character_ref: ref, tag: 'hero' },
		{ character_ref: ref, tag: 'mage' },
	]);
	return author;
}

describe('hooks run inside the write', () => {
	test('a deleting hook removes children with the parent, in one unit', async () => {
		const { adapter } = await freshDatabase();
		const alice = await seedAuthorWithTags();

		slots.author.deleting = async (batch, tx) => {
			await AuthorTag.query()
				.whereIn(
					'character_ref',
					batch.models.map(author => author.ref),
				)
				.delete(tx);
		};

		adapter.clearLog();
		await alice.delete();

		expect(transactionStatements(adapter)).toEqual(['BEGIN', 'COMMIT']);
		expect(statementsStartingWith(adapter, 'DELETE')).toHaveLength(2);
		expect(await AuthorTag.query().count()).toBe(0);
		expect(await Author.query().count()).toBe(0);
	});

	test('a hook that throws rolls the write back', async () => {
		const { adapter } = await freshDatabase();
		const alice = await newAuthor('alice');

		slots.author.deleted = () => {
			throw new Error('nope');
		};

		adapter.clearLog();
		await expect(alice.delete()).rejects.toThrow('nope');

		expect(transactionStatements(adapter)).toEqual(['BEGIN', 'ROLLBACK']);
		expect(await Author.query().count()).toBe(1);
	});

	test('every write path passes one batch', async () => {
		await freshDatabase();
		await newAuthor('alice');

		const saved: number[] = [];
		const deleted: number[] = [];
		slots.tag.saved = batch => {
			saved.push(batch.models.length);
		};
		slots.tag.deleted = batch => {
			deleted.push(batch.models.length);
		};

		const tags = await AuthorTag.createMany([
			{ character_ref: 'alice', tag: 'a' },
			{ character_ref: 'alice', tag: 'b' },
			{ character_ref: 'alice', tag: 'c' },
		]);
		expect(saved).toEqual([3]);

		tags[0]!.sort = 1;
		await tags[0]!.save();
		expect(saved).toEqual([3, 1]);

		tags.forEach((tag, i) => (tag.sort = i + 10));
		await AuthorTag.updateMany(tags);
		expect(saved).toEqual([3, 1, 3]);

		await AuthorTag.query().update({ sort: 99 });
		expect(saved).toEqual([3, 1, 3, 3]);

		await AuthorTag.query().delete();
		expect(deleted).toEqual([3]);
	});

	test('events fire in order, and a saving change reaches the row', async () => {
		await freshDatabase();

		const order: string[] = [];
		for (const event of EVENTS) {
			slots.author[event] = () => {
				order.push(event);
			};
		}
		slots.author.saving = batch => {
			order.push('saving');
			for (const author of batch.models) author.name += '!';
		};
		slots.author.creating = batch => {
			order.push('creating');
			expect(batch.models[0]!.name).toBe('alice!');
		};

		const alice = await newAuthor('alice');
		expect(order).toEqual(['saving', 'creating', 'created', 'saved']);
		expect((await Author.find('alice'))!.name).toBe('alice!');

		order.length = 0;
		alice.is_player = 1;
		await alice.save();
		expect(order).toEqual(['saving', 'updating', 'updated', 'saved']);

		order.length = 0;
		await alice.delete();
		expect(order).toEqual(['deleting', 'deleted']);
	});

	test('a clean model is not written and fires nothing', async () => {
		const { adapter } = await freshDatabase();
		const alice = await newAuthor('alice');

		let fired = 0;
		slots.author.saving = () => {
			fired++;
		};

		adapter.clearLog();
		await alice.save();

		expect(fired).toBe(0);
		expect(adapter.log).toEqual([]);
	});

	test('the batch says what the write changed', async () => {
		await freshDatabase();
		const alice = await newAuthor('alice');

		const seen: unknown[] = [];
		slots.author.updated = batch => {
			const [author] = batch.models;
			seen.push(
				batch.changed(author!, 'name'),
				batch.previous(author!, 'name'),
				batch.changed(author!, 'is_player'),
				batch.changed(author!),
			);
		};

		alice.name = 'Alicia';
		await alice.save();

		expect(seen).toEqual([true, 'alice', false, true]);
	});

	test('hooks assigned after the registry exists still run', async () => {
		const { adapter } = await freshDatabase();

		const seen: string[] = [];
		// Builds the registry before any hooks exist.
		listen(
			Late.on('created', () => {
				seen.push('listener');
			}),
		);

		Late.hooks = {
			creating: batch => {
				seen.push('hook');
				for (const memo of batch.models) memo.body += '!';
			},
		};

		adapter.clearLog();
		const memo = await Late.create({ body: 'a' });

		expect(seen).toEqual(['hook', 'listener']);
		expect(memo.body).toBe('a!');
		expect(transactionStatements(adapter)).toEqual(['BEGIN', 'COMMIT']);

		Late.hooks = undefined;
		seen.length = 0;
		await Late.create({ body: 'b' });
		expect(seen).toEqual(['listener']);
	});

	test('a created hook can create children in bulk with the keys it got', async () => {
		await freshDatabase();

		slots.memo.created = async (batch, tx) => {
			await Piece.createMany(
				batch.models.map(memo => ({
					schema_ref: 'memo',
					owner_ref: String(memo.id),
					suffix: 'x',
				})),
				tx,
			);
		};

		const memos = await Memo.createMany([{ body: 'a' }, { body: 'b' }]);
		const ids = memos.map(memo => memo.id);
		expect(ids.every(id => Number.isInteger(id))).toBe(true);

		const pieces = await Piece.query().orderBy('id').get();
		expect(pieces.map(piece => piece.owner_ref)).toEqual(ids.map(String));
	});
});

describe('listeners run after commit', () => {
	test('a listener alone needs no transaction and sees the committed write', async () => {
		const { adapter } = await freshDatabase();

		const seen: { ids: number[]; committed: boolean }[] = [];
		listen(
			Piece.on('created', batch => {
				seen.push({
					ids: batch.models.map(piece => piece.id),
					committed:
						statementsStartingWith(adapter, 'INSERT').length === 1,
				});
			}),
		);

		adapter.clearLog();
		const piece = await Piece.create({
			schema_ref: 's',
			owner_ref: 'o',
			suffix: 'a',
		});

		expect(seen).toEqual([{ ids: [piece.id], committed: true }]);
		expect(transactionStatements(adapter)).toEqual([]);
	});

	test('with hooks, the listener runs after COMMIT', async () => {
		const { adapter } = await freshDatabase();

		let log: string[] = [];
		listen(
			Author.on('created', () => {
				log = transactionStatements(adapter);
			}),
		);

		adapter.clearLog();
		await newAuthor('alice');

		expect(log).toEqual(['BEGIN', 'COMMIT']);
	});

	test('the same function registers once, and unsubscribing stops it', async () => {
		await freshDatabase();

		let calls = 0;
		const listener = () => {
			calls++;
		};
		const off = Author.on('created', listener);
		listen(Author.on('created', listener));

		await newAuthor('a');
		expect(calls).toBe(1);

		off();
		await newAuthor('b');
		expect(calls).toBe(1);
	});

	test('listeners are dropped when the write rolls back', async () => {
		await freshDatabase();

		let calls = 0;
		listen(
			Author.on('created', () => {
				calls++;
			}),
		);
		slots.author.saved = () => {
			throw new Error('nope');
		};

		await expect(newAuthor('alice')).rejects.toThrow('nope');
		expect(calls).toBe(0);
	});

	test('a failing listener leaves the write standing and is reported as such', async () => {
		await freshDatabase();

		const ran: string[] = [];
		listen(
			Author.on('created', () => {
				throw new Error('store is broken');
			}),
		);
		listen(
			Author.on('created', () => {
				ran.push('second');
			}),
		);

		let caught: unknown;
		try {
			await newAuthor('alice');
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(ListenerError);
		const failure = caught as ListenerError;
		expect(failure.committed).toBe(true);
		expect(failure.failures).toHaveLength(1);
		expect(failure.failures[0]!.event).toBe('created');
		expect(failure.failures[0]!.model).toBe('Author');
		expect(failure.message).toMatch(/committed.*store is broken/);
		expect((failure.result as Author).ref).toBe('alice');

		expect(ran).toEqual(['second']);
		expect(await Author.query().count()).toBe(1);
	});

	test('a listener may write: the queue is released before it runs', async () => {
		await freshDatabase();

		listen(
			Author.on('created', async batch => {
				await Piece.create({
					schema_ref: 'welcome',
					owner_ref: batch.models[0]!.ref,
					suffix: 'x',
				});
			}),
		);

		await newAuthor('alice');

		expect(
			(await Piece.query().get()).map(piece => piece.owner_ref),
		).toEqual(['alice']);
	});

	test('inside transaction(), listeners wait for the outermost commit, in order', async () => {
		const { adapter } = await freshDatabase();

		const seen: string[] = [];
		const record = (label: string) => () => {
			seen.push(
				`${label}:${transactionStatements(adapter).includes('COMMIT')}`,
			);
		};
		listen(Author.on('saved', record('author')));
		listen(AuthorTag.on('saved', record('tag')));

		await ORM.getInstance().transaction(async tx => {
			await newAuthor('a', tx);
			await AuthorTag.createMany([{ character_ref: 'a', tag: 't' }], tx);
			await newAuthor('b', tx);
			expect(seen).toEqual([]);
		});

		expect(seen).toEqual(['author:true', 'tag:true', 'author:true']);
	});

	test('a failing listener rejects the transaction() promise', async () => {
		await freshDatabase();

		listen(
			Author.on('saved', () => {
				throw new Error('later');
			}),
		);

		await expect(
			ORM.getInstance().transaction(async tx => {
				await newAuthor('a', tx);
				return 'done';
			}),
		).rejects.toBeInstanceOf(ListenerError);

		expect(await Author.query().count()).toBe(1);
	});

	test('a deferred listener reads the change set captured when its event fired', async () => {
		await freshDatabase();
		const alice = await newAuthor('alice');

		// Normalises its own batch, which writes the same instance again.
		slots.author.updated = async (batch, tx) => {
			for (const author of batch.models) {
				if (batch.changed(author, 'name')) {
					author.name = author.name.toUpperCase();
				}
			}
			await Author.updateMany(batch.models, tx);
		};

		const seen: unknown[] = [];
		listen(
			Author.on('updated', batch => {
				const [author] = batch.models;
				seen.push([batch.previous(author!, 'name'), author!.name]);
			}),
		);

		alice.name = 'Bob';
		await alice.save();

		expect(seen).toEqual([
			['alice', 'BOB'],
			['Bob', 'BOB'],
		]);
		expect((await Author.find('alice'))!.name).toBe('BOB');
	});
});

describe('query writes', () => {
	async function seedPieces(): Promise<void> {
		await Piece.createMany([
			{ schema_ref: 's', owner_ref: 'a', suffix: '1', sort: 0 },
			{ schema_ref: 's', owner_ref: 'a', suffix: '2', sort: 0 },
			{ schema_ref: 's', owner_ref: 'b', suffix: '1', sort: 0 },
		]);
	}

	test('query().update() is one statement until something listens', async () => {
		const { adapter } = await freshDatabase();
		await seedPieces();

		adapter.clearLog();
		expect(
			await Piece.query().where('owner_ref', 'a').update({ sort: 5 }),
		).toBe(2);
		expect(adapter.sqlLog()).toHaveLength(1);
		expect(adapter.sqlLog()[0]).toMatch(/^UPDATE/);

		const sizes: number[] = [];
		listen(
			Piece.on('updated', batch => {
				sizes.push(batch.models.length);
			}),
		);

		adapter.clearLog();
		expect(
			await Piece.query().where('owner_ref', 'a').update({ sort: 6 }),
		).toBe(2);

		expect(adapter.sqlLog().map(sql => sql.split(' ')[0])).toEqual([
			'SELECT',
			'UPDATE',
		]);
		expect(sizes).toEqual([2]);
		expect(
			await Piece.query().where('owner_ref', 'a').pluck('sort'),
		).toEqual([6, 6]);
	});

	test('a hook changing one model still lands in the same statement', async () => {
		const { adapter } = await freshDatabase();
		await newAuthor('a');
		await newAuthor('b');

		slots.author.updating = batch => {
			batch.models[0]!.name = 'renamed';
		};

		adapter.clearLog();
		await Author.query().update({ is_player: 1 });

		expect(statementsStartingWith(adapter, 'UPDATE')).toHaveLength(1);

		const rows = await Author.query().orderBy('ref').get();
		expect(rows.map(author => [author.name, author.is_player])).toEqual([
			['renamed', 1],
			['b', 1],
		]);
	});

	test('query().delete() fires for the rows it selected', async () => {
		const { adapter } = await freshDatabase();
		await seedPieces();

		const seen: string[][] = [];
		listen(
			Piece.on('deleted', batch => {
				seen.push(batch.models.map(piece => piece.suffix));
			}),
		);

		adapter.clearLog();
		expect(await Piece.query().where('owner_ref', 'a').delete()).toBe(2);

		expect(seen).toEqual([['1', '2']]);
		expect(statementsStartingWith(adapter, 'DELETE')).toHaveLength(1);
		expect(await Piece.query().count()).toBe(1);
	});

	test('an empty selection fires nothing and issues no statement', async () => {
		const { adapter } = await freshDatabase();
		await seedPieces();

		let calls = 0;
		listen(
			Piece.on('deleted', () => {
				calls++;
			}),
		);
		listen(
			Piece.on('updated', () => {
				calls++;
			}),
		);

		adapter.clearLog();
		expect(await Piece.query().where('owner_ref', 'nobody').delete()).toBe(
			0,
		);
		expect(
			await Piece.query()
				.where('owner_ref', 'nobody')
				.update({ sort: 1 }),
		).toBe(0);

		expect(calls).toBe(0);
		expect(adapter.sqlLog().every(sql => sql.startsWith('SELECT'))).toBe(
			true,
		);
	});
});

describe('cascades', () => {
	test('a delete cycle stops at the ledger', async () => {
		const { adapter } = await freshDatabase();
		const alice = await seedAuthorWithTags();

		slots.author.deleting = async (batch, tx) => {
			await AuthorTag.query()
				.whereIn(
					'character_ref',
					batch.models.map(author => author.ref),
				)
				.delete(tx);
		};
		slots.tag.deleting = async (batch, tx) => {
			await Author.query()
				.whereIn(
					'ref',
					batch.models.map(tag => tag.character_ref),
				)
				.delete(tx);
		};

		adapter.clearLog();
		await alice.delete();

		expect(statementsStartingWith(adapter, 'DELETE')).toHaveLength(2);
		expect(await Author.query().count()).toBe(0);
		expect(await AuthorTag.query().count()).toBe(0);
	});

	test('an instance delete an outer delete already covers is a no-op that marks it gone', async () => {
		const { adapter } = await freshDatabase();
		await seedAuthorWithTags();
		const other = (await Author.find('alice'))!;

		slots.author.deleting = async (batch, tx) => {
			await AuthorTag.query()
				.whereIn(
					'character_ref',
					batch.models.map(author => author.ref),
				)
				.delete(tx);
		};
		slots.tag.deleted = async (_batch, tx) => {
			await other.delete(tx);
		};

		adapter.clearLog();
		await Author.query().where('ref', 'alice').delete();

		expect(statementsStartingWith(adapter, 'DELETE')).toHaveLength(2);
		expect(other._exists).toBe(false);
		await expect(other.delete()).rejects.toThrow(/does not exist/);
	});

	test('a hook that changes a value every time hits the depth cap', async () => {
		await freshDatabase();
		const alice = await newAuthor('alice');

		slots.author.updated = async (batch, tx) => {
			for (const author of batch.models) author.pron_plural += 1;
			await Author.updateMany(batch.models, tx);
		};

		alice.is_player = 1;
		await expect(alice.save()).rejects.toThrow(/nested 32 deep/);

		const stored = (await Author.find('alice'))!;
		expect([stored.is_player, stored.pron_plural]).toEqual([0, 0]);
	});
});

describe('adapters without transactions', () => {
	test('a hook that writes is refused before anything lands', async () => {
		await freshPlainDatabase();
		const alice = await seedAuthorWithTags();

		slots.author.deleting = async (batch, tx) => {
			await AuthorTag.query()
				.whereIn(
					'character_ref',
					batch.models.map(author => author.ref),
				)
				.delete(tx);
		};

		await expect(alice.delete()).rejects.toThrow(
			/hook of Author\.delete\(\).*does not implement TransactionalAdapter/,
		);
		expect(await Author.query().count()).toBe(1);
		expect(await AuthorTag.query().count()).toBe(2);
	});

	test('a hook that only observes runs', async () => {
		await freshPlainDatabase();
		const alice = await newAuthor('alice');

		const seen: string[] = [];
		slots.author.deleted = batch => {
			seen.push(...batch.models.map(author => author.ref));
		};

		await alice.delete();

		expect(seen).toEqual(['alice']);
		expect(await Author.query().count()).toBe(0);
	});
});

describe('sync', () => {
	test("fires the related class's events", async () => {
		await freshDatabase();
		const alice = await newAuthor('alice');

		const created: number[] = [];
		const deleted: number[] = [];
		slots.tag.created = batch => {
			created.push(batch.models.length);
		};
		slots.tag.deleted = batch => {
			deleted.push(batch.models.length);
		};

		await alice.relation('tags').sync(['hero', 'mage']);
		expect(created).toEqual([2]);

		await alice.relation('tags').sync(['hero']);
		expect(deleted).toEqual([1]);
	});
});
