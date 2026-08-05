/**
 * save() / update() / delete(), dirty tracking, and timestamp handling.
 */

import { describe, expect, test } from 'bun:test';

import {
	Character,
	Line,
	Passage,
	ProjectFile,
	User,
	Variable,
} from './helpers/models';
import { freshDatabase, nowSeconds } from './helpers/setup';

async function seedPassage(ref = 'intro'): Promise<Passage> {
	return Passage.create({
		ref,
		title: 'Intro',
		status: 'draft',
		sort: 0,
		auto_continue: 0,
		allow_back: 0,
	});
}

describe('dirty tracking', () => {
	test('a freshly hydrated model is clean', async () => {
		await freshDatabase();
		await seedPassage();

		const passage = await Passage.query().where('ref', 'intro').first();
		expect(passage!.isDirty).toBe(false);
		expect(passage!.getDirty()).toEqual([]);
		expect(passage!.getChanges()).toEqual({});
	});

	test('assigning a different value marks the field dirty', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		passage.title = 'Prologue';
		expect(passage.isDirty).toBe(true);
		expect(passage.getDirty()).toEqual(['title']);
		expect(passage.getChanges()).toEqual({
			title: { old: 'Intro', new: 'Prologue' },
		});
	});

	test('assigning an identical value does not mark it dirty', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		passage.title = 'Intro';
		expect(passage.isDirty).toBe(false);
		expect(passage.getDirty()).toEqual([]);
	});

	test('saving clears the dirty state', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		passage.title = 'Prologue';
		await passage.save();

		expect(passage.isDirty).toBe(false);
		expect(passage.getDirty()).toEqual([]);
	});

	test('multiple dirty fields are all reported', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		passage.title = 'Prologue';
		passage.status = 'final';
		passage.sort = 7;

		expect(passage.getDirty().sort()).toEqual(['sort', 'status', 'title']);
	});
});

describe('update', () => {
	test('only dirty columns appear in the UPDATE statement', async () => {
		const { adapter } = await freshDatabase();
		const passage = await seedPassage();

		adapter.clearLog();
		passage.title = 'Prologue';
		await passage.save();

		const updates = adapter.log.filter(e => e.sql.startsWith('UPDATE'));
		expect(updates).toHaveLength(1);
		expect(updates[0]!.sql).toContain('"title" = ?');
		expect(updates[0]!.sql).not.toContain('"status" = ?');
		expect(updates[0]!.sql).not.toContain('"sort" = ?');
	});

	test('saving an unchanged model issues no UPDATE at all', async () => {
		const { adapter } = await freshDatabase();
		const passage = await seedPassage();

		adapter.clearLog();
		await passage.save();

		expect(adapter.log.filter(e => e.sql.startsWith('UPDATE'))).toEqual([]);
	});

	test('update targets the row by its primary key', async () => {
		await freshDatabase();
		await seedPassage('a');
		await seedPassage('b');

		const a = await Passage.query().where('ref', 'a').first();
		a!.title = 'Changed';
		await a!.save();

		const b = await Passage.query().where('ref', 'b').first();
		expect(b!.title).toBe('Intro');
	});

	test('updating a model that does not exist throws', async () => {
		await freshDatabase();

		const passage = new Passage();
		passage.ref = 'ghost';
		// `update()` is protected; reach it the way save() would if _exists lied.
		await expect(
			(passage as unknown as { update(): Promise<unknown> }).update(),
		).rejects.toThrow(/does not exist/i);
	});

	test('a composite-key model updates by both key columns', async () => {
		const { adapter } = await freshDatabase();

		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});

		const character = await Character.query().where('ref', 'alice').first();
		character!.name = 'Alicia';
		adapter.clearLog();
		await character!.save();

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).toContain('WHERE "ref" = ?');
	});
});

describe('delete', () => {
	test('delete removes the row and returns true', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		const result = await passage.delete();
		expect(result).toBe(true);
		expect(await Passage.query().get()).toHaveLength(0);
	});

	test('deleting a model that was never saved throws', async () => {
		await freshDatabase();

		const passage = new Passage();
		passage.ref = 'ghost';
		await expect(passage.delete()).rejects.toThrow(/does not exist/i);
	});

	test('deleting twice throws the second time', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		await passage.delete();
		await expect(passage.delete()).rejects.toThrow(/does not exist/i);
	});

	test('a composite-key row deletes by both columns', async () => {
		await freshDatabase();

		const { CharacterTag } = await import('./helpers/models');
		await CharacterTag.create({ character_ref: 'alice', tag: 'hero' });
		await CharacterTag.create({ character_ref: 'alice', tag: 'mage' });

		const tag = await CharacterTag.query()
			.where('character_ref', 'alice')
			.where('tag', 'hero')
			.first();
		await tag!.delete();

		const remaining = await CharacterTag.query().get();
		expect(remaining).toHaveLength(1);
		expect(remaining[0]!.tag).toBe('mage');
	});
});

describe('timestamps', () => {
	test('insert stamps both created_at and updated_at', async () => {
		await freshDatabase();
		const before = nowSeconds();

		const passage = await seedPassage();

		expect(passage.created_at).toBeGreaterThanOrEqual(before);
		expect(passage.updated_at).toBeGreaterThanOrEqual(before);
	});

	test('update bumps updated_at but leaves created_at alone', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		const createdAt = passage.created_at;
		// Force a distinguishable second boundary.
		(
			passage as unknown as { _attributes: Record<string, unknown> }
		)._attributes.updated_at = createdAt - 100;

		passage.title = 'Prologue';
		await passage.save();

		expect(passage.created_at).toBe(createdAt);
		expect(passage.updated_at).toBeGreaterThan(createdAt - 100);
	});

	test('timestamps: false writes no timestamp columns', async () => {
		const { adapter } = await freshDatabase();

		await Line.create({
			ref: 'intro/say-hi',
			passage_ref: 'intro',
			sort: 10,
			kind: 'say',
			return_to_caller: 0,
		});

		const insert = adapter.log.find(e => e.kind === 'insert')!;
		expect(insert.sql).not.toContain('created_at');
		expect(insert.sql).not.toContain('updated_at');
	});

	test('createdAt/updatedAt getters convert unix seconds to Date', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		expect(passage.createdAt).toBeInstanceOf(Date);
		expect(passage.updatedAt).toBeInstanceOf(Date);
		expect(passage.createdAt!.getTime()).toBe(passage.created_at * 1000);
	});

	test('createdAt is null when the model has timestamps disabled', async () => {
		await freshDatabase();

		const line = await Line.create({
			ref: 'intro/say-hi',
			passage_ref: 'intro',
			sort: 10,
			kind: 'say',
			return_to_caller: 0,
		});

		expect(line.createdAt).toBeNull();
		expect(line.updatedAt).toBeNull();
	});

	test('a custom timestamp column config is honoured', async () => {
		const { adapter } = await freshDatabase();

		await Variable.create({
			ref: 'gold',
			namespace: 'global',
			type: 'number',
			initial_value: '0',
		});

		const insert = adapter.log.find(e => e.kind === 'insert')!;
		expect(insert.sql).toContain('created_at');
		expect(insert.sql).toContain('updated_at');
	});
});

describe('slug generation', () => {
	test('a model declaring slug gets one derived from name', async () => {
		await freshDatabase();

		const user = await User.create({ name: 'John Doe' });
		expect(user.slug).toBe('john-doe');
	});

	test('an explicit slug is not overwritten', async () => {
		await freshDatabase();

		const user = await User.create({ name: 'John Doe', slug: 'custom' });
		expect(user.slug).toBe('custom');
	});

	test('a model without a slug field is unaffected', async () => {
		const { adapter } = await freshDatabase();

		await ProjectFile.create({
			path: 'a.png',
			name: 'A Name',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});

		const insert = adapter.log.find(e => e.kind === 'insert')!;
		expect(insert.sql).not.toContain('slug');
	});
});
