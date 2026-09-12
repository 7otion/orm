/**
 * save() / update() / delete(), dirty tracking, and timestamp handling.
 */

import { describe, expect, test } from 'bun:test';

import {
	Character,
	CharacterTag,
	Fragment,
	Line,
	Passage,
	ProjectFile,
	User,
	Variable,
} from './helpers/models';
import { freshDatabase } from './helpers/setup';

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
		// Floored to match the column's stored precision: seconds, not ms.
		const before = new Date(Math.floor(Date.now() / 1000) * 1000);

		const passage = await seedPassage();

		expect(passage.created_at.getTime()).toBeGreaterThanOrEqual(
			before.getTime(),
		);
		expect(passage.updated_at.getTime()).toBeGreaterThanOrEqual(
			before.getTime(),
		);
	});

	test('update bumps updated_at but leaves created_at alone', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		const createdAt = passage.created_at;
		// Force a distinguishable second boundary.
		(
			passage as unknown as { _attributes: Record<string, unknown> }
		)._attributes.updated_at = new Date(createdAt.getTime() - 100_000);

		passage.title = 'Prologue';
		await passage.save();

		expect(passage.created_at.getTime()).toBe(createdAt.getTime());
		expect(passage.updated_at.getTime()).toBeGreaterThan(
			createdAt.getTime() - 100_000,
		);
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

	test('created_at/updated_at round-trip as Date, stored as unix seconds', async () => {
		const { adapter } = await freshDatabase();
		const passage = await seedPassage();

		expect(passage.created_at).toBeInstanceOf(Date);
		expect(passage.updated_at).toBeInstanceOf(Date);

		const raw = adapter.db
			.query(`SELECT created_at, typeof(created_at) AS ty FROM passages`)
			.get() as { created_at: number; ty: string };
		expect(raw.ty).toBe('integer');
		expect(passage.created_at.getTime()).toBe(raw.created_at * 1000);
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

/**
 * A timestamp column is a `date` column that the ORM populates itself, so the
 * casting half is covered by the `date` suite. What is specific to timestamps
 * is that the ORM owns the value — a caller-supplied one is meant to be
 * discarded.
 *
 * No application code sets these: `created_at` is when the row was written and
 * `updated_at` is when it last changed, so both are facts about the write, not
 * data the caller supplies. Every write path enforces that — insert, instance
 * update, and bulk update alike.
 */
describe('timestamps are owned by the ORM, not the caller', () => {
	const PAST = new Date('2001-01-01T00:00:00.000Z');

	const seedWithStamps = () =>
		Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
			created_at: PAST,
			updated_at: PAST,
		} as never);

	test('insert discards caller-supplied created_at and updated_at', async () => {
		await freshDatabase();
		const before = new Date(Math.floor(Date.now() / 1000) * 1000);

		const passage = await seedWithStamps();

		expect(passage.created_at.getTime()).toBeGreaterThanOrEqual(
			before.getTime(),
		);
		expect(passage.updated_at.getTime()).toBeGreaterThanOrEqual(
			before.getTime(),
		);
		expect(passage.created_at.getTime()).not.toBe(PAST.getTime());
	});

	test('the discarded value never reaches the database either', async () => {
		const { adapter } = await freshDatabase();

		await seedWithStamps();

		const raw = adapter.db
			.query(`SELECT created_at FROM passages`)
			.get() as { created_at: number };
		expect(raw.created_at).not.toBe(PAST.getTime() / 1000);
	});

	test('assigning a timestamp is refused, and says why', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		expect(() => {
			(passage as unknown as { updated_at: Date }).updated_at = PAST;
		}).toThrow(/updated_at is a timestamp, which the ORM maintains/);

		expect(() => {
			(passage as unknown as { created_at: Date }).created_at = PAST;
		}).toThrow(/created_at is a timestamp, which the ORM maintains/);
	});

	test('fill() drops a supplied timestamp instead of throwing', async () => {
		await freshDatabase();
		const passage = await seedPassage();
		const createdAt = passage.created_at.getTime();

		// Dropped, like a `guarded` column, so round-tripping a whole row back
		// through fill() keeps working.
		passage.fill({ title: 'Prologue', created_at: PAST } as never);

		expect(passage.title).toBe('Prologue');
		expect(passage.created_at.getTime()).toBe(createdAt);
	});

	test('created_at cannot be changed once the row exists', async () => {
		await freshDatabase();
		const passage = await seedPassage();
		const createdAt = passage.created_at.getTime();

		// The only way past the proxy is a direct `_attributes` write, which
		// update() must still refuse to send.
		(
			passage as unknown as { _attributes: Record<string, unknown> }
		)._attributes.created_at = PAST;
		passage.title = 'Prologue';
		await passage.save();

		expect((await Passage.find('intro'))!.created_at.getTime()).toBe(
			createdAt,
		);
		// …and the in-memory row is put back in step with the database.
		expect(passage.created_at.getTime()).toBe(createdAt);
	});

	test('an instance update refreshes updated_at', async () => {
		await freshDatabase();
		const passage = await seedPassage();

		// Back-date through `_attributes` so a fresh stamp is distinguishable.
		const stale = new Date(passage.updated_at.getTime() - 100_000);
		(
			passage as unknown as { _attributes: Record<string, unknown> }
		)._attributes.updated_at = stale;

		passage.title = 'Prologue';
		await passage.save();

		expect(
			(await Passage.find('intro'))!.updated_at.getTime(),
		).toBeGreaterThan(stale.getTime());
	});

	test('a bulk update refreshes updated_at', async () => {
		const { adapter } = await freshDatabase();
		await seedPassage();

		// Back-date the stored row, not just a local variable: otherwise the
		// insert stamp already satisfies "later than stale" and the assertion
		// holds even when the bulk path stamps nothing.
		const stale = Math.floor(Date.now() / 1000) - 100_000;
		adapter.db.run(`UPDATE passages SET updated_at = ${stale}`);
		expect((await Passage.find('intro'))!.updated_at.getTime()).toBe(
			stale * 1000,
		);

		await Passage.query()
			.where('ref', 'intro')
			.update({ title: 'Prologue' } as never);

		const after = (await Passage.find('intro'))!;
		expect(after.title).toBe('Prologue');
		expect(after.updated_at.getTime()).toBeGreaterThan(stale * 1000);
	});

	test('a bulk update ignores a caller-supplied updated_at', async () => {
		await freshDatabase();
		await seedPassage();

		await Passage.query()
			.where('ref', 'intro')
			.update({ title: 'Prologue', updated_at: PAST } as never);

		expect((await Passage.find('intro'))!.updated_at.getTime()).not.toBe(
			PAST.getTime(),
		);
	});

	test('a bulk update cannot rewrite created_at', async () => {
		await freshDatabase();
		const passage = await seedPassage();
		const createdAt = passage.created_at.getTime();

		await Passage.query()
			.where('ref', 'intro')
			.update({ created_at: PAST } as never);

		expect((await Passage.find('intro'))!.created_at.getTime()).toBe(
			createdAt,
		);
	});

	test('timestamps use the same date cast as any other date column', async () => {
		const { adapter } = await freshDatabase();
		const passage = await seedPassage();

		// `Model.casts` folds the timestamp columns in as `date`, so they are
		// seconds on disk and a Date in memory — one conversion path, not a
		// parallel one.
		expect(passage.created_at).toBeInstanceOf(Date);

		const raw = adapter.db
			.query(`SELECT typeof(created_at) AS ty FROM passages`)
			.get() as { ty: string };
		expect(raw.ty).toBe('integer');
	});

	test('a freshly stamped model is not dirty', async () => {
		await freshDatabase();

		// The stamp is written into `_attributes` during insert, then snapshot
		// into `_original`. A Date detached by the snapshot must compare by
		// value, or every newly created model would read dirty.
		const passage = await seedPassage();
		expect(passage.isDirty).toBe(false);
		expect(passage.getDirty()).toEqual([]);
	});

	test('the in-memory stamp matches the persisted one exactly', async () => {
		await freshDatabase();

		// `Timestamps.now()` floors to seconds precisely so these agree; a
		// plain `new Date()` would keep milliseconds the column cannot store.
		const passage = await seedPassage();
		const reloaded = (await Passage.find('intro'))!;

		expect(passage.created_at.getTime()).toBe(
			reloaded.created_at.getTime(),
		);
		expect(passage.updated_at.getTime()).toBe(
			reloaded.updated_at.getTime(),
		);
	});
});

describe('createMany', () => {
	test('writes every row in one statement and reports the count', async () => {
		const { adapter } = await freshDatabase();

		adapter.clearLog();
		const written = await CharacterTag.createMany([
			{ character_ref: 'alice', tag: 'hero' },
			{ character_ref: 'alice', tag: 'mage' },
			{ character_ref: 'bob', tag: 'hero' },
		]);

		expect(written).toBe(3);
		expect(
			adapter.log.filter(e => e.sql.startsWith('INSERT')),
		).toHaveLength(1);
		expect(await CharacterTag.query().get()).toHaveLength(3);
	});

	test('an empty list writes nothing', async () => {
		const { adapter } = await freshDatabase();

		adapter.clearLog();
		expect(await CharacterTag.createMany([])).toBe(0);
		expect(adapter.log).toHaveLength(0);
	});

	test('stamps timestamps on every row', async () => {
		await freshDatabase();

		await Passage.createMany([
			{ ref: 'intro', title: 'Intro', status: 'draft' },
			{ ref: 'hall', title: 'Hall', status: 'draft' },
		]);

		const rows = await Passage.query().get();
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.created_at).toBeInstanceOf(Date);
			expect(row.updated_at).toBeInstanceOf(Date);
		}
	});

	test('rows omitting a column keep its default, in their own statement', async () => {
		const { adapter } = await freshDatabase();

		adapter.clearLog();
		const written = await Fragment.createMany([
			{ schema_ref: 'appearance', owner_ref: 'alice', suffix: '1' },
			{
				schema_ref: 'appearance',
				owner_ref: 'bob',
				suffix: '1',
				sort: 7,
			},
		]);

		expect(written).toBe(2);
		// Two shapes, so two statements rather than NULL over the default.
		expect(
			adapter.log.filter(e => e.sql.startsWith('INSERT')),
		).toHaveLength(2);

		const rows = await Fragment.query().orderBy('owner_ref', 'asc').get();
		expect(rows.map(r => r.sort)).toEqual([0, 7]);
	});

	test('chunks past the dialect parameter limit', async () => {
		const { adapter } = await freshDatabase();

		// 999 / 3 columns = 333 rows per statement.
		const rows = Array.from({ length: 600 }, (_, i) => ({
			character_ref: 'alice',
			tag: `tag-${i}`,
			sort: i,
		}));

		adapter.clearLog();
		expect(await CharacterTag.createMany(rows)).toBe(600);

		const inserts = adapter.log.filter(e => e.sql.startsWith('INSERT'));
		expect(inserts).toHaveLength(2);
		expect(inserts[0]!.params).toHaveLength(999);
		expect(await CharacterTag.query().get()).toHaveLength(600);
	});
});

describe('updateMany', () => {
	async function seedFragments(): Promise<void> {
		await Fragment.createMany([
			{
				schema_ref: 'appearance',
				owner_ref: 'alice',
				suffix: 'a',
				sort: 0,
			},
			{
				schema_ref: 'appearance',
				owner_ref: 'alice',
				suffix: 'b',
				sort: 1,
			},
			{
				schema_ref: 'appearance',
				owner_ref: 'alice',
				suffix: 'c',
				sort: 2,
			},
		]);
	}

	test('gives every row its own value in one statement', async () => {
		const { adapter } = await freshDatabase();
		await seedFragments();

		const before = await Fragment.query().orderBy('suffix', 'asc').get();
		adapter.clearLog();

		const written = await Fragment.updateMany([
			{ id: before[0]!.id, sort: 2 },
			{ id: before[1]!.id, sort: 0 },
			{ id: before[2]!.id, sort: 1 },
		]);

		expect(written).toBe(3);
		expect(
			adapter.log.filter(e => e.sql.startsWith('UPDATE')),
		).toHaveLength(1);

		const after = await Fragment.query().orderBy('suffix', 'asc').get();
		expect(after.map(f => f.sort)).toEqual([2, 0, 1]);
	});

	test('a column a row omits is left alone', async () => {
		await freshDatabase();
		await seedFragments();

		const before = await Fragment.query().orderBy('suffix', 'asc').get();

		// Only the second row sets `content`; the first must keep its own.
		await Fragment.updateMany([
			{ id: before[0]!.id, sort: 9 },
			{ id: before[1]!.id, sort: 8, content: 'written' },
		]);

		const after = await Fragment.query().orderBy('suffix', 'asc').get();
		expect(after[0]!.sort).toBe(9);
		expect(after[0]!.content).toBeNull();
		expect(after[1]!.content).toBe('written');
		// Untouched by either row.
		expect(after[2]!.sort).toBe(2);
	});

	test('matches on a composite key', async () => {
		const { adapter } = await freshDatabase();

		await CharacterTag.createMany([
			{ character_ref: 'alice', tag: 'hero', sort: 0 },
			{ character_ref: 'alice', tag: 'mage', sort: 1 },
			{ character_ref: 'bob', tag: 'hero', sort: 0 },
		]);

		adapter.clearLog();
		const written = await CharacterTag.updateMany([
			{ character_ref: 'alice', tag: 'hero', sort: 5 },
			{ character_ref: 'bob', tag: 'hero', sort: 6 },
		]);

		expect(written).toBe(2);
		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).toContain('OR');

		const rows = await CharacterTag.query().get();
		const sorted = rows.map(r => `${r.character_ref}/${r.tag}=${r.sort}`);
		expect(sorted.sort()).toEqual([
			'alice/hero=5',
			'alice/mage=1',
			'bob/hero=6',
		]);
	});

	test('stamps updated_at once for the whole statement', async () => {
		const { adapter } = await freshDatabase();

		await Passage.createMany([
			{ ref: 'intro', title: 'Intro', status: 'draft' },
			{ ref: 'hall', title: 'Hall', status: 'draft' },
		]);

		adapter.clearLog();
		await Passage.updateMany([
			{ ref: 'intro', title: 'Prologue' },
			{ ref: 'hall', title: 'Great Hall' },
		]);

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).toContain('"updated_at" = ?');
		expect(update.sql).not.toContain('"updated_at" = CASE');
	});

	test('a caller-supplied timestamp is ignored', async () => {
		const { adapter } = await freshDatabase();
		await Passage.createMany([
			{ ref: 'intro', title: 'Intro', status: 'draft' },
		]);

		adapter.clearLog();
		await Passage.updateMany([
			{
				ref: 'intro',
				title: 'Prologue',
				created_at: new Date(0),
			} as never,
		]);

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).not.toContain('"created_at"');
	});

	test('chunks past the dialect parameter limit', async () => {
		const { adapter } = await freshDatabase();

		const tags = Array.from({ length: 400 }, (_, i) => ({
			character_ref: 'alice',
			tag: `tag-${i}`,
			sort: 0,
		}));
		await CharacterTag.createMany(tags);

		adapter.clearLog();
		const written = await CharacterTag.updateMany(
			tags.map((tag, i) => ({ ...tag, sort: i + 1 })),
		);

		expect(written).toBe(400);
		expect(
			adapter.log.filter(e => e.sql.startsWith('UPDATE')).length,
		).toBeGreaterThan(1);

		const rows = await CharacterTag.query().where('tag', 'tag-399').get();
		expect(rows[0]!.sort).toBe(400);
	});

	test('empty input, and rows with nothing to set, write nothing', async () => {
		const { adapter } = await freshDatabase();
		await seedFragments();

		const before = await Fragment.query().get();
		adapter.clearLog();

		expect(await Fragment.updateMany([])).toBe(0);
		expect(await Fragment.updateMany([{ id: before[0]!.id }])).toBe(0);
		expect(adapter.log.filter(e => e.sql.startsWith('UPDATE'))).toEqual([]);
	});

	test('a row missing its key is refused', async () => {
		await freshDatabase();
		await seedFragments();

		await expect(Fragment.updateMany([{ sort: 3 }])).rejects.toThrow(
			/"id" is missing/i,
		);
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
