/**
 * QueryBuilder: filtering, ordering, projection, pagination and bulk writes.
 */

import { describe, expect, test } from 'bun:test';

import { Character, Line, Passage, Role, User } from './helpers/models';
import { freshDatabase } from './helpers/setup';

async function seedUsers(): Promise<void> {
	await User.create({ name: 'Ann', status: 'active', age: 30 });
	await User.create({ name: 'Bob', status: 'active', age: 20 });
	await User.create({ name: 'Cid', status: 'inactive', age: 40 });
	await User.create({ name: 'Dee', status: null, age: null });
}

describe('where', () => {
	test('two-argument form defaults to equality', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query().where('status', 'active').get();
		expect(rows.map(r => r.name).sort()).toEqual(['Ann', 'Bob']);
	});

	test('three-argument form uses the given operator', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query().where('age', '>', 25).get();
		expect(rows.map(r => r.name).sort()).toEqual(['Ann', 'Cid']);
	});

	test('!= excludes matching rows', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query().where('status', '!=', 'active').get();
		expect(rows.map(r => r.name)).toEqual(['Cid']);
	});

	test('LIKE matches a pattern', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query().where('name', 'LIKE', 'A%').get();
		expect(rows.map(r => r.name)).toEqual(['Ann']);
	});

	test('IS NULL is expressed without a binding', async () => {
		const { adapter } = await freshDatabase();
		await seedUsers();

		adapter.clearLog();
		const rows = await User.query().where('status', 'IS', null).get();

		expect(rows.map(r => r.name)).toEqual(['Dee']);
		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).toContain('status IS NULL');
		expect(select.params).toEqual([]);
	});

	test('chained wheres are ANDed', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query()
			.where('status', 'active')
			.where('age', '>', 25)
			.get();
		expect(rows.map(r => r.name)).toEqual(['Ann']);
	});

	test('whereIn filters by a list', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query().whereIn('name', ['Ann', 'Cid']).get();
		expect(rows.map(r => r.name).sort()).toEqual(['Ann', 'Cid']);
	});

	test('IN via the operator form behaves the same', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query()
			.where('name', 'IN', ['Ann', 'Cid'])
			.get();
		expect(rows.map(r => r.name).sort()).toEqual(['Ann', 'Cid']);
	});

	test('whereRaw passes bindings through', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query()
			.whereRaw('age > ? AND status = ?', [18, 'active'])
			.get();
		expect(rows.map(r => r.name).sort()).toEqual(['Ann', 'Bob']);
	});

	test('values are bound, not interpolated', async () => {
		const { adapter } = await freshDatabase();
		await seedUsers();

		adapter.clearLog();
		await User.query().where('name', "Rob'); DROP TABLE users;--").get();

		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).not.toContain('DROP TABLE');
		expect(select.params).toEqual(["Rob'); DROP TABLE users;--"]);

		// The table is still there.
		expect(await User.query().get()).toHaveLength(4);
	});
});

describe('ordering, limiting and projection', () => {
	test('orderBy ascending and descending', async () => {
		await freshDatabase();
		await seedUsers();

		const asc = await User.query().orderBy('name', 'asc').get();
		expect(asc.map(r => r.name)).toEqual(['Ann', 'Bob', 'Cid', 'Dee']);

		const desc = await User.query().orderBy('name', 'desc').get();
		expect(desc.map(r => r.name)).toEqual(['Dee', 'Cid', 'Bob', 'Ann']);
	});

	test('orderBy quotes the column, so reserved words work', async () => {
		const { adapter } = await freshDatabase();
		await seedUsers();

		adapter.clearLog();
		await User.query().orderBy('status').get();

		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).toContain('ORDER BY "status" ASC');
	});

	test('orderByRaw is emitted verbatim', async () => {
		const { adapter } = await freshDatabase();
		await seedUsers();

		adapter.clearLog();
		await User.query().orderByRaw('age DESC, name ASC').get();

		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).toContain('ORDER BY age DESC, name ASC');
	});

	test('limit and offset page through results', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query()
			.orderBy('name', 'asc')
			.limit(2)
			.offset(1)
			.get();
		expect(rows.map(r => r.name)).toEqual(['Bob', 'Cid']);
	});

	test('select narrows the projected columns', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query().select('id', 'name').get();
		expect(Object.keys(rows[0] as object).sort()).toEqual(['id', 'name']);
	});

	test('selectRaw supports aggregates', async () => {
		await freshDatabase();
		await seedUsers();

		const rows = await User.query().selectRaw('COUNT(*) as total').get();
		expect((rows[0] as unknown as { total: number }).total).toBe(4);
	});
});

describe('first', () => {
	test('returns the first row', async () => {
		await freshDatabase();
		await seedUsers();

		const user = await User.query().orderBy('name', 'asc').first();
		expect(user!.name).toBe('Ann');
	});

	test('returns null rather than throwing when nothing matches', async () => {
		await freshDatabase();
		await seedUsers();

		expect(await User.query().where('name', 'Zed').first()).toBeNull();
	});

	test('applies LIMIT 1', async () => {
		const { adapter } = await freshDatabase();
		await seedUsers();

		adapter.clearLog();
		await User.query().first();

		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).toContain('LIMIT ?');
		expect(select.params).toContain(1);
	});
});

describe('paginate', () => {
	test('returns a page plus the unpaginated total', async () => {
		await freshDatabase();
		await seedUsers();

		const { data, total } = await User.query()
			.orderBy('name', 'asc')
			.paginate(2, 2);

		expect(total).toBe(4);
		expect(data.map(r => r.name)).toEqual(['Cid', 'Dee']);
	});

	test('counts only matching rows', async () => {
		await freshDatabase();
		await seedUsers();

		const { total } = await User.query()
			.where('status', 'active')
			.paginate(1, 10);
		expect(total).toBe(2);
	});

	test('an out-of-range page yields no data but a real total', async () => {
		await freshDatabase();
		await seedUsers();

		const { data, total } = await User.query().paginate(99, 10);
		expect(data).toEqual([]);
		expect(total).toBe(4);
	});
});

describe('bulk update', () => {
	test('updates every matching row in one statement', async () => {
		const { adapter } = await freshDatabase();

		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 1,
			pron_plural: 0,
		});
		await Character.create({
			ref: 'bob',
			name: 'Bob',
			is_player: 1,
			pron_plural: 0,
		});

		adapter.clearLog();
		// Demote every other row, then promote one — a common two-step.
		const affected = await Character.query()
			.where('is_player', 1)
			.where('ref', '!=', 'alice')
			.update({ is_player: 0 });

		expect(affected).toBe(1);
		expect(
			adapter.log.filter(e => e.sql.startsWith('UPDATE')),
		).toHaveLength(1);

		const alice = await Character.query().where('ref', 'alice').first();
		const bob = await Character.query().where('ref', 'bob').first();
		expect(alice!.is_player).toBe(1);
		expect(bob!.is_player).toBe(0);
	});

	test('an unfiltered update touches every row', async () => {
		await freshDatabase();
		await seedUsers();

		const affected = await User.query().update({ status: 'archived' });
		expect(affected).toBe(4);
	});
});

describe('bulk delete', () => {
	test('deletes matching rows and reports the count', async () => {
		await freshDatabase();
		await seedUsers();

		const affected = await User.query().where('status', 'active').delete();
		expect(affected).toBe(2);
		expect(await User.query().get()).toHaveLength(2);
	});

	test('deleting with no match affects nothing', async () => {
		await freshDatabase();
		await seedUsers();

		expect(await User.query().where('name', 'Zed').delete()).toBe(0);
		expect(await User.query().get()).toHaveLength(4);
	});

	test('composite-key rows delete by a partial key', async () => {
		await freshDatabase();
		const { CharacterTag } = await import('./helpers/models');

		await CharacterTag.create({ character_ref: 'alice', tag: 'hero' });
		await CharacterTag.create({ character_ref: 'alice', tag: 'mage' });
		await CharacterTag.create({ character_ref: 'bob', tag: 'hero' });

		// Replace a whole composite-key set: delete by partial key, re-insert.
		const affected = await CharacterTag.query()
			.where('character_ref', 'alice')
			.delete();

		expect(affected).toBe(2);
		expect(await CharacterTag.query().get()).toHaveLength(1);
	});
});

describe('joins', () => {
	test('innerJoin restricts to matching rows', async () => {
		const { adapter } = await freshDatabase();

		const user = await User.create({ name: 'Ann' });
		await User.create({ name: 'Bob' });
		const role = await Role.create({ name: 'admin' });
		adapter.db.exec(
			`INSERT INTO user_roles (user_id, role_id) VALUES (${user.id}, ${role.id})`,
		);

		const rows = await User.query()
			.selectRaw('users.*')
			.innerJoin('user_roles', 'user_roles.user_id', '=', 'users.id')
			.get();

		expect(rows.map(r => r.name)).toEqual(['Ann']);
	});

	test('leftJoin keeps unmatched rows', async () => {
		const { adapter } = await freshDatabase();

		const user = await User.create({ name: 'Ann' });
		await User.create({ name: 'Bob' });
		const role = await Role.create({ name: 'admin' });
		adapter.db.exec(
			`INSERT INTO user_roles (user_id, role_id) VALUES (${user.id}, ${role.id})`,
		);

		const rows = await User.query()
			.selectRaw('users.*')
			.leftJoin('user_roles', 'user_roles.user_id', '=', 'users.id')
			.get();

		expect(rows.map(r => r.name).sort()).toEqual(['Ann', 'Bob']);
	});
});

describe('static shorthands', () => {
	test('find() looks up by the configured primary key', async () => {
		await freshDatabase();
		await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});

		const found = await Passage.find('intro');
		expect(found!.title).toBe('Intro');
	});

	test('find() returns null when the row is absent', async () => {
		await freshDatabase();
		expect(await Passage.find('nope')).toBeNull();
	});

	test('find() accepts a composite key as an array', async () => {
		await freshDatabase();
		const { CharacterTag } = await import('./helpers/models');
		await CharacterTag.create({ character_ref: 'alice', tag: 'hero' });

		const found = await CharacterTag.find(['alice', 'hero']);
		expect(found!.tag).toBe('hero');
	});

	test('find() rejects a composite key of the wrong arity', async () => {
		await freshDatabase();
		const { CharacterTag } = await import('./helpers/models');

		await expect(CharacterTag.find(['alice'])).rejects.toThrow(
			/length mismatch/i,
		);
	});

	test('all() returns every row', async () => {
		await freshDatabase();
		await seedUsers();

		expect(await User.all()).toHaveLength(4);
	});

	test('create() inserts and returns a persisted model', async () => {
		await freshDatabase();

		const line = await Line.create({
			ref: 'intro/say-hi',
			passage_ref: 'intro',
			sort: 10,
			kind: 'say',
			text: 'Hi',
			return_to_caller: 0,
		});

		expect(line.ref).toBe('intro/say-hi');
		expect(await Line.query().get()).toHaveLength(1);
	});
});
