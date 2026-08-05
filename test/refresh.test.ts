/**
 * refresh() — reloading a model, and replaying whatever was eager-loaded.
 */

import { describe, expect, test } from 'bun:test';

import {
	Character,
	CharacterTag,
	Condition,
	Line,
	Passage,
	Route,
	ZeroKey,
} from './helpers/models';
import { freshDatabase } from './helpers/setup';

async function seedStory(): Promise<void> {
	await Passage.create({
		ref: 'intro',
		title: 'Intro',
		status: 'draft',
		sort: 0,
		auto_continue: 0,
		allow_back: 0,
	});
	await Line.create({
		ref: 'intro/a',
		passage_ref: 'intro',
		sort: 10,
		kind: 'say',
		text: 'A',
		return_to_caller: 0,
	});
	await Route.create({
		ref: 'r1',
		owner_kind: 'line',
		owner_ref: 'intro/a',
		sort: 0,
		goto_ref: 'hall',
	});
	await Condition.create({
		uuid: 'c1',
		owner_kind: 'route',
		owner_ref: 'r1',
		variable_ref: 'has_key',
		op: 'eq',
		value: 'true',
	});
}

describe('refresh', () => {
	test('picks up a change made elsewhere', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		adapter.db.exec(
			"UPDATE passages SET title = 'Changed' WHERE ref = 'intro'",
		);

		await passage!.refresh();
		expect(passage!.title).toBe('Changed');
	});

	test('leaves the model clean afterwards', async () => {
		await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		passage!.title = 'Local edit';
		expect(passage!.isDirty).toBe(true);

		await passage!.refresh();
		expect(passage!.isDirty).toBe(false);
		expect(passage!.title).toBe('Intro');
	});

	test('replays previously eager-loaded relations', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();

		const [passage] = await Passage.query()
			.with('lines.routes.conditions')
			.where('ref', 'intro')
			.get();
		expect(passage!.lines[0]!.routes[0]!.conditions).toHaveLength(1);

		adapter.db.exec(
			"INSERT INTO lines (ref, passage_ref, sort, kind, return_to_caller) VALUES ('intro/b', 'intro', 20, 'say', 0)",
		);

		await passage!.refresh();

		expect(passage!.lines).toHaveLength(2);
		// The nested path was replayed too, not just the top level.
		const withRoute = passage!.lines.find(
			(l: Line) => l.ref === 'intro/a',
		)!;
		expect(withRoute.routes[0]!.conditions).toHaveLength(1);
	});

	test('an explicit path list overrides the replayed set', async () => {
		await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		await passage!.refresh(['lines']);

		expect(passage!.lines).toHaveLength(1);
	});

	test('refreshing a deleted row throws', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		adapter.db.exec("DELETE FROM passages WHERE ref = 'intro'");

		await expect(passage!.refresh()).rejects.toThrow(/no longer exists/i);
	});

	test('refresh works on a composite-key model', async () => {
		const { adapter } = await freshDatabase();

		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		await CharacterTag.create({ character_ref: 'alice', tag: 'hero' });

		const tag = await CharacterTag.query()
			.where('character_ref', 'alice')
			.first();

		adapter.clearLog();
		await tag!.refresh();

		const select = adapter.log.find(e => e.kind === 'query')!;
		expect(select.sql).toContain('character_ref = ?');
		expect(select.sql).toContain('tag = ?');
	});

	test('a primary key of 0 refreshes rather than being read as missing', async () => {
		const { adapter } = await freshDatabase();

		const zero = new ZeroKey();
		zero.id = 0;
		zero.label = 'zero';
		await zero.save();

		adapter.db.exec("UPDATE zero_keys SET label = 'changed' WHERE id = 0");
		await zero.refresh();

		expect(zero.id).toBe(0);
		expect(zero.label).toBe('changed');
	});

	test('an empty-string primary key refreshes too', async () => {
		const { adapter } = await freshDatabase();

		const passage = await Passage.create({
			ref: '',
			title: 'Empty ref',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});

		adapter.db.exec("UPDATE passages SET title = 'Changed' WHERE ref = ''");
		await passage.refresh();

		expect(passage.title).toBe('Changed');
	});

	test('a genuinely absent primary key is still rejected', async () => {
		await freshDatabase();

		const zero = new ZeroKey();
		zero.label = 'no key';
		await expect(zero.refresh()).rejects.toThrow(
			/without a primary key value/i,
		);
	});
});
