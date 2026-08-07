/**
 * Primary key adoption on INSERT.
 *
 * The rule under test: adopt the database-generated key ONLY when the caller
 * supplied no value for a single-column primary key. Never for composite keys.
 */

import { describe, expect, test } from 'bun:test';

import {
	Asset,
	Character,
	CharacterTag,
	Condition,
	Passage,
	ProjectFile,
	ZeroKey,
} from './helpers/models';
import { freshDatabase } from './helpers/setup';

describe('primary key adoption on insert', () => {
	test('a caller-supplied TEXT primary key survives insert', async () => {
		await freshDatabase();

		const passage = new Passage();
		passage.ref = 'intro';
		passage.title = 'Intro';
		passage.status = 'draft';
		passage.sort = 0;
		await passage.save();

		expect(passage.ref).toBe('intro');

		const reloaded = await Passage.query().where('ref', 'intro').first();
		expect(reloaded).not.toBeNull();
		expect(reloaded!.title).toBe('Intro');
	});

	test('a caller-supplied UUID primary key survives insert', async () => {
		await freshDatabase();

		const uuid = crypto.randomUUID();
		const condition = new Condition();
		condition.uuid = uuid;
		condition.owner_kind = 'hotspot';
		condition.owner_ref = 'door';
		condition.variable_ref = 'has_key';
		condition.op = 'eq';
		condition.value = 'true';
		await condition.save();

		expect(condition.uuid).toBe(uuid);
		expect(condition.uuid).not.toBe(1);
	});

	test('successive UUID inserts each keep their own key', async () => {
		await freshDatabase();

		const uuids = [
			crypto.randomUUID(),
			crypto.randomUUID(),
			crypto.randomUUID(),
		];

		for (const uuid of uuids) {
			const condition = new Condition();
			condition.uuid = uuid;
			condition.owner_kind = 'choice';
			condition.owner_ref = 'c1';
			condition.variable_ref = 'v';
			condition.op = 'eq';
			condition.value = '1';
			await condition.save();
			expect(condition.uuid).toBe(uuid);
		}

		const rows = await Condition.query().get();
		expect(rows.map(r => r.uuid).sort()).toEqual([...uuids].sort());
	});

	test('an omitted AUTOINCREMENT key adopts lastInsertRowid', async () => {
		await freshDatabase();

		const file = new ProjectFile();
		file.path = 'assets/bg.png';
		file.name = 'bg.png';
		file.size = 1024;
		file.mime = 'image/png';
		file.extension = 'png';
		file.ctime = 0;
		file.mtime = 0;
		await file.save();

		expect(typeof file.id).toBe('number');
		expect(file.id).toBeGreaterThan(0);

		const second = new ProjectFile();
		second.path = 'assets/bg2.png';
		second.name = 'bg2.png';
		second.size = 2048;
		second.mime = 'image/png';
		second.extension = 'png';
		second.ctime = 0;
		second.mtime = 0;
		await second.save();

		expect(second.id).toBe(file.id + 1);
	});

	test('an explicitly supplied integer key is not replaced', async () => {
		await freshDatabase();

		const zero = new ZeroKey();
		zero.id = 42;
		zero.label = 'explicit';
		await zero.save();

		expect(zero.id).toBe(42);

		const reloaded = await ZeroKey.query().where('id', 42).first();
		expect(reloaded!.label).toBe('explicit');
	});

	test('a primary key of 0 is treated as supplied, not missing', async () => {
		await freshDatabase();

		const zero = new ZeroKey();
		zero.id = 0;
		zero.label = 'zero';
		await zero.save();

		// `0` is falsy; a truthiness check here would adopt the rowid instead.
		expect(zero.id).toBe(0);

		const rows = await ZeroKey.query().get();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.id).toBe(0);
	});

	test('composite primary keys never adopt an insert id', async () => {
		await freshDatabase();

		const tag = new CharacterTag();
		tag.character_ref = 'alice';
		tag.tag = 'protagonist';
		await tag.save();

		expect(tag.character_ref).toBe('alice');
		expect(tag.tag).toBe('protagonist');

		const rows = await CharacterTag.query().get();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.character_ref).toBe('alice');
		expect(rows[0]!.tag).toBe('protagonist');
	});

	test('create() returns a model carrying the supplied key', async () => {
		await freshDatabase();

		const character = await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});

		expect(character.ref).toBe('alice');
		expect(character.name).toBe('Alice');
	});

	test('a model is not dirty immediately after insert', async () => {
		await freshDatabase();

		const passage = await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			sort: 0,
		});

		expect(passage.isDirty).toBe(false);
		expect(passage.getDirty()).toEqual([]);
	});

	test('saving twice updates rather than inserting a duplicate', async () => {
		const { adapter } = await freshDatabase();

		const asset = new Asset();
		asset.ref = 'bg-room';
		asset.file_id = 1;
		asset.name = 'Room';
		asset.type = 'image';

		adapter.db.exec(
			"INSERT INTO files (id, path, name, size, mime, extension, ctime, mtime) VALUES (1, 'a.png', 'a.png', 1, 'image/png', 'png', 0, 0)",
		);

		await asset.save();
		asset.name = 'Room B';
		await asset.save();

		const rows = await Asset.query().get();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.name).toBe('Room B');
		expect(rows[0]!.ref).toBe('bg-room');
	});
});
