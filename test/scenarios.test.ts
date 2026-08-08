/**
 * Multi-step scenarios.
 *
 * The other suites each test one capability in isolation. These exercise
 * sequences — load, mutate, write back, reload — because that is where dirty
 * tracking, the attribute proxy, relation caching and the write path interact,
 * and where several real regressions have surfaced.
 */

import { describe, expect, test } from 'bun:test';

import {
	Asset,
	Character,
	CharacterAsset,
	CharacterTag,
	Choice,
	Condition,
	Effect,
	Hotspot,
	Line,
	Passage,
	ProjectFile,
	Route,
	Variable,
} from './helpers/models';
import { freshDatabase } from './helpers/setup';

function bySort<T extends { sort: number }>(a: T, b: T): number {
	return a.sort - b.sort;
}

/* ── load, mutate, write back ───────────────────────────────────────────── */

describe('load, mutate, write back', () => {
	async function seed(): Promise<void> {
		await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			group_ref: null,
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});
		for (const [ref, sort] of [
			['intro/say-b', 20],
			['intro/say-a', 10],
		] as const) {
			await Line.create({
				ref,
				passage_ref: 'intro',
				sort,
				kind: 'say',
				return_to_caller: 0,
			});
		}
		await Choice.create({
			ref: 'intro/c1',
			passage_ref: 'intro',
			sort: 0,
			text: 'Go',
		});
		await Route.create({
			ref: 'r1',
			owner_kind: 'choice',
			owner_ref: 'intro/c1',
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

	test('sorting eager-loaded children in place does not dirty the parent', async () => {
		await freshDatabase();
		await seed();

		const passages = await Passage.query()
			.with(
				'lines',
				'lines.routes.conditions',
				'choices.conditions',
				'choices.effects',
				'choices.routes.conditions',
			)
			.orderBy('sort', 'asc')
			.get();

		// Write the sorted arrays straight back onto the models.
		for (const p of passages) {
			p.lines = [...(p.lines ?? [])].sort(bySort);
			for (const l of p.lines) {
				l.routes = [...(l.routes ?? [])].sort(bySort);
			}
			p.choices = [...(p.choices ?? [])].sort(bySort);
			for (const c of p.choices) {
				c.routes = [...(c.routes ?? [])].sort(bySort);
			}
		}

		const intro = passages[0]!;
		expect(intro.lines.map(l => l.ref)).toEqual([
			'intro/say-a',
			'intro/say-b',
		]);
		expect(intro.choices[0]!.routes[0]!.conditions).toHaveLength(1);
		// Sorting must not have dirtied anything.
		expect(intro.isDirty).toBe(false);
	});

	test('a created model keeps its supplied key and accepts relation init', async () => {
		await freshDatabase();

		const ref = 'chapter-1:opening';
		const p = await Passage.create({
			ref,
			title: 'Opening',
			status: 'draft',
			group_ref: 'chapter-1',
			sort: 0,
		});
		p.lines = [];
		p.choices = [];

		expect(p.ref).toBe(ref);
		expect(p.lines).toEqual([]);

		const reloaded = await Passage.find(ref);
		expect(reloaded!.title).toBe('Opening');
	});

	test('changing one field writes only that column', async () => {
		const { adapter } = await freshDatabase();
		await seed();

		const [p] = await Passage.query().get();
		p!.title = 'Prologue';
		adapter.clearLog();
		await p!.save();

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).toContain('"title" = ?');
		expect(update.sql).toContain('"updated_at" = ?');
		expect(update.sql).not.toContain('"status" = ?');
	});

	test('concurrent saves write only the models that actually changed', async () => {
		const { adapter } = await freshDatabase();
		await seed();
		await Passage.create({
			ref: 'hall',
			title: 'Hall',
			status: 'draft',
			group_ref: null,
			sort: 1,
			auto_continue: 0,
			allow_back: 0,
		});

		const passages = await Passage.query().get();
		const byRef = new Map(passages.map(p => [p.ref, p]));
		const changed: Passage[] = [];

		// Reverse the order: only 'hall' actually moves to sort 0.
		for (const [i, ref] of ['hall', 'intro'].entries()) {
			const p = byRef.get(ref)!;
			if (p.sort !== i) {
				p.sort = i;
				changed.push(p);
			}
		}

		adapter.clearLog();
		await Promise.all(changed.map(p => p.save()));

		expect(changed).toHaveLength(2);
		expect(
			adapter.log.filter(e => e.sql.startsWith('UPDATE')),
		).toHaveLength(2);
	});

	test('a relation graph can be torn down leaf-first', async () => {
		await freshDatabase();
		await seed();

		const [p] = await Passage.query()
			.with(
				'lines',
				'lines.routes.conditions',
				'choices.conditions',
				'choices.effects',
				'choices.routes.conditions',
			)
			.get();

		const choices = p!.choices ?? [];
		const routes = [
			...choices.flatMap(c => c.routes ?? []),
			...(p!.lines ?? []).flatMap(l => l.routes ?? []),
		];

		await Promise.all(
			routes.flatMap(r => (r.conditions ?? []).map(x => x.delete())),
		);
		await Promise.all(routes.map(r => r.delete()));
		await Promise.all([
			...choices.flatMap(c => (c.conditions ?? []).map(x => x.delete())),
			...choices.flatMap(c => (c.effects ?? []).map(x => x.delete())),
		]);
		await Promise.all(choices.map(c => c.delete()));
		await Promise.all((p!.lines ?? []).map(l => l.delete()));
		await p!.delete();

		expect(await Passage.all()).toHaveLength(0);
		expect(await Line.all()).toHaveLength(0);
		expect(await Route.all()).toHaveLength(0);
		expect(await Condition.all()).toHaveLength(0);
	});
});

/* ── partial updates ────────────────────────────────────────────────────── */

describe('partial updates', () => {
	test('a key containing separators survives insert intact', async () => {
		await freshDatabase();

		const lineRef = 'intro/say-hello';
		const line = await Line.create({
			ref: lineRef,
			passage_ref: 'intro',
			sort: 10,
			kind: 'say',
		});

		expect(line.ref).toBe(lineRef);
		expect((await Line.find(lineRef))!.kind).toBe('say');
	});

	test('Object.assign applies a partial patch that then persists', async () => {
		await freshDatabase();

		const line = await Line.create({
			ref: 'intro/bg',
			passage_ref: 'intro',
			sort: 10,
			kind: 'bg',
		});

		Object.assign(line, { asset_ref: 'bg-room' });
		await line.save();

		const reloaded = await Line.find('intro/bg');
		expect(reloaded!.asset_ref).toBe('bg-room');
	});

	test('patching a column to null clears it in the database', async () => {
		await freshDatabase();

		const line = await Line.create({
			ref: 'intro/bg',
			passage_ref: 'intro',
			sort: 10,
			kind: 'bg',
			asset_ref: 'bg-room',
		});

		const assetRef = '';
		Object.assign(line, { asset_ref: assetRef || null });
		await line.save();

		expect((await Line.find('intro/bg'))!.asset_ref).toBeNull();
	});

	test('renumbering a set persists the new order', async () => {
		await freshDatabase();

		for (const [ref, sort] of [
			['a', 10],
			['b', 20],
			['c', 30],
		] as const) {
			await Line.create({
				ref,
				passage_ref: 'intro',
				sort,
				kind: 'say',
			});
		}

		const lines = await Line.query().orderBy('sort').get();
		const reordered = [lines[2]!, lines[0]!, lines[1]!];

		const changed: Line[] = [];
		reordered.forEach((line, i) => {
			const sort = (i + 1) * 10;
			if (line.sort !== sort) {
				line.sort = sort;
				changed.push(line);
			}
		});
		await Promise.all(changed.map(l => l.save()));

		const after = await Line.query().orderBy('sort').get();
		expect(after.map(l => l.ref)).toEqual(['c', 'a', 'b']);
	});
});

/* ── relation graphs ────────────────────────────────────────────────────── */

describe('relation graphs', () => {
	async function seedAsset(): Promise<Asset> {
		const file = await ProjectFile.create({
			path: 'assets/bg/room.png',
			name: 'room.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		return Asset.create({
			ref: 'bg-room',
			file_id: file.id,
			name: 'Room',
			type: 'image',
		});
	}

	test('REAL columns round-trip without precision loss', async () => {
		await freshDatabase();
		const asset = await seedAsset();

		const hotspot = await Hotspot.create({
			ref: `${asset.ref}-h10`,
			bg_asset_ref: asset.ref,
			sort: 10,
			label: '',
			x: 0.4,
			y: 0.4,
			w: 0.2,
			h: 0.2,
			mask_asset_ref: null,
		});

		expect(hotspot.ref).toBe('bg-room-h10');
		const reloaded = await Hotspot.find('bg-room-h10');
		expect(reloaded!.x).toBeCloseTo(0.4);
		expect(reloaded!.mask_asset_ref).toBeNull();
	});

	test('a UUID key survives insert and eager loads by it', async () => {
		await freshDatabase();
		const asset = await seedAsset();
		await Hotspot.create({
			ref: 'bg-room-h10',
			bg_asset_ref: asset.ref,
			sort: 10,
			label: 'Door',
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			mask_asset_ref: null,
		});

		const uuid = crypto.randomUUID();
		await Condition.create({
			uuid,
			owner_kind: 'hotspot',
			owner_ref: 'bg-room-h10',
			variable_ref: 'has_key',
			op: 'eq',
			value: 'true',
		});

		const [loaded] = await Asset.query()
			.with('hotspots.conditions')
			.where('ref', 'bg-room')
			.get();

		expect(loaded!.hotspots[0]!.conditions[0]!.uuid).toBe(uuid);
	});

	test('children of an eager-loaded relation can be sorted after load', async () => {
		await freshDatabase();
		const asset = await seedAsset();

		for (const sort of [20, 10]) {
			await Hotspot.create({
				ref: `h${sort}`,
				bg_asset_ref: asset.ref,
				sort,
				label: `H${sort}`,
				x: 0,
				y: 0,
				w: 1,
				h: 1,
				mask_asset_ref: null,
			});
		}

		const [loaded] = await Asset.query()
			.with(
				'hotspots.conditions',
				'hotspots.effects',
				'hotspots.routes.conditions',
			)
			.where('ref', asset.ref)
			.get();

		const hotspots = [...(loaded?.hotspots ?? [])].sort(bySort);
		expect(hotspots.map(h => h.ref)).toEqual(['h10', 'h20']);
	});

	test('deleting a parent after its children leaves nothing behind', async () => {
		await freshDatabase();
		const asset = await seedAsset();
		await Hotspot.create({
			ref: 'h1',
			bg_asset_ref: asset.ref,
			sort: 10,
			label: 'Door',
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			mask_asset_ref: null,
		});
		await Condition.create({
			uuid: 'c1',
			owner_kind: 'hotspot',
			owner_ref: 'h1',
			variable_ref: 'v',
			op: 'eq',
			value: '1',
		});
		await Effect.create({
			uuid: 'e1',
			owner_kind: 'hotspot',
			owner_ref: 'h1',
			variable_ref: 'v',
			op: 'add',
			value: '1',
		});

		const [loaded] = await Asset.query()
			.with(
				'hotspots.conditions',
				'hotspots.effects',
				'hotspots.routes.conditions',
			)
			.where('ref', asset.ref)
			.get();

		const hotspot = loaded!.hotspots[0]!;
		await Promise.all([
			...(hotspot.conditions ?? []).map(c => c.delete()),
			...(hotspot.effects ?? []).map(e => e.delete()),
		]);
		await hotspot.delete();

		expect(await Hotspot.all()).toHaveLength(0);
		expect(await Condition.all()).toHaveLength(0);
		expect(await Effect.all()).toHaveLength(0);
	});
});

/* ── relations and foreign keys ─────────────────────────────────────────── */

describe('relations and foreign keys', () => {
	test('assigning a belongsTo relation does not dirty the owner', async () => {
		await freshDatabase();

		const file = await ProjectFile.create({
			path: 'assets/bg.png',
			name: 'bg.png',
			size: 10,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});

		const asset = await Asset.create({
			file_id: file.id,
			name: 'bg',
			ref: 'bg',
			type: 'image',
		});
		asset.file = file;

		expect(asset.file.name).toBe('bg.png');
		expect(asset.isDirty).toBe(false);
	});

	test('an eager-loaded child can be mutated and saved independently', async () => {
		await freshDatabase();

		const file = await ProjectFile.create({
			path: 'assets/old/a.png',
			name: 'a.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		await Asset.create({
			ref: 'a',
			file_id: file.id,
			name: 'a',
			type: 'image',
		});

		const assets = await Asset.query().with('file').get();
		for (const asset of assets) {
			asset.file.path = 'assets/new/a.png';
			await asset.file.save();
		}

		expect((await ProjectFile.find(file.id))!.path).toBe(
			'assets/new/a.png',
		);
	});

	test('reassigning a primary key renames the row', async () => {
		const { adapter } = await freshDatabase();

		const file = await ProjectFile.create({
			path: 'a.png',
			name: 'a.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		const asset = await Asset.create({
			ref: 'old-ref',
			file_id: file.id,
			name: 'A',
			type: 'image',
		});

		adapter.clearLog();
		asset.ref = 'new-ref';
		await asset.save();

		// The WHERE clause must bind the ORIGINAL key. Binding the new one
		// produced `SET ref = 'new-ref' WHERE ref = 'new-ref'`, matching no
		// row and silently losing the write.
		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.params.at(-1)).toBe('old-ref');

		const rows = await Asset.all();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.ref).toBe('new-ref');
		expect(asset.isDirty).toBe(false);
	});

	test('a renamed model can be saved again afterwards', async () => {
		await freshDatabase();

		const file = await ProjectFile.create({
			path: 'a.png',
			name: 'a.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		const asset = await Asset.create({
			ref: 'old-ref',
			file_id: file.id,
			name: 'A',
			type: 'image',
		});

		asset.ref = 'new-ref';
		await asset.save();

		// _original must have adopted the new key, so the second save targets
		// the renamed row rather than the vanished original.
		asset.name = 'B';
		await asset.save();

		const rows = await Asset.all();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.ref).toBe('new-ref');
		expect(rows[0]!.name).toBe('B');
	});

	test('saving a model whose row was deleted elsewhere reports the failure', async () => {
		const { adapter } = await freshDatabase();

		const passage = await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			group_ref: null,
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});

		adapter.db.exec("DELETE FROM passages WHERE ref = 'intro'");

		passage.title = 'Changed';
		await expect(passage.save()).rejects.toThrow(/affected no rows/i);
	});

	test('swapping a foreign key and its cached relation stays consistent', async () => {
		await freshDatabase();

		const oldFile = await ProjectFile.create({
			path: 'old.png',
			name: 'old.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		const newFile = await ProjectFile.create({
			path: 'new.png',
			name: 'new.png',
			size: 2,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		await Asset.create({
			ref: 'a',
			file_id: oldFile.id,
			name: 'A',
			type: 'image',
		});

		const [asset] = await Asset.query().with('file').get();
		asset!.file_id = newFile.id;
		asset!.file = newFile;
		await asset!.save();

		const [reloaded] = await Asset.query().with('file').get();
		expect(reloaded!.file.path).toBe('new.png');
	});
});

/* ── bulk and composite-key writes ──────────────────────────────────────── */

describe('bulk and composite-key writes', () => {
	test('several relation trees load in one query pass', async () => {
		await freshDatabase();

		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		await CharacterTag.create({
			character_ref: 'alice',
			tag: 'hero',
		});
		const file = await ProjectFile.create({
			path: 'p.png',
			name: 'p.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		await Asset.create({
			ref: 'portrait',
			file_id: file.id,
			name: 'Portrait',
			type: 'image',
		});
		await CharacterAsset.create({
			character_ref: 'alice',
			asset_ref: 'portrait',
			kind: 'portrait',
		});

		const characters = await Character.query()
			.with('tags', 'assets.asset', 'fragments')
			.orderBy('created_at', 'asc')
			.get();

		const alice = characters[0]!;
		expect(alice.tags.map(t => t.tag)).toEqual(['hero']);
		expect(alice.assets[0]!.asset.name).toBe('Portrait');
		expect(alice.fragments).toEqual([]);
		expect(alice.created_at).toBeInstanceOf(Date);
	});

	test('a composite-key set can be replaced wholesale', async () => {
		await freshDatabase();

		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});

		const repo = CharacterTag;
		await repo.create({ character_ref: 'alice', tag: 'old-1' });
		await repo.create({ character_ref: 'alice', tag: 'old-2' });

		// Replace a whole composite-key set: delete by partial key, re-insert.
		await repo.query().where('character_ref', 'alice').delete();
		const created = await Promise.all(
			['hero', 'mage'].map(tag =>
				repo.create({ character_ref: 'alice', tag }),
			),
		);

		expect(created.map(t => t.tag)).toEqual(['hero', 'mage']);
		expect(created.every(t => t.character_ref === 'alice')).toBe(true);

		const [alice] = await Character.query().with('tags').get();
		expect(alice!.tags.map(t => t.tag).sort()).toEqual(['hero', 'mage']);
	});

	test('a bulk update and a single instance save compose correctly', async () => {
		await freshDatabase();

		for (const [ref, isPlayer] of [
			['alice', 1],
			['bob', 0],
		] as const) {
			await Character.create({
				ref,
				name: ref,
				is_player: isPlayer,
				pron_plural: 0,
			});
		}

		await Character.query()
			.where('is_player', 1)
			.where('ref', '!=', 'bob')
			.update({ is_player: 0 });

		const bob = await Character.find('bob');
		bob!.is_player = 1;
		await bob!.save();

		const all = await Character.query().orderBy('ref').get();
		expect(all.map(c => c.isPlayer)).toEqual([false, true]);
	});

	test('a patch built from computed keys applies through the proxy', async () => {
		await freshDatabase();

		const char = await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});

		const data = { plural: 1 };
		const patch = Object.fromEntries(
			Object.entries(data)
				.filter(([, v]) => v !== undefined)
				.map(([k, v]) => [`pron_${k}`, v]),
		);
		Object.assign(char, patch);
		await char.save();

		expect((await Character.find('alice'))!.pron_plural).toBe(1);
	});
});

/* ── column value round-trips ───────────────────────────────────────────── */

describe('column value round-trips', () => {
	test('JSON round-trips through a TEXT column', async () => {
		await freshDatabase();

		const variable = await Variable.create({
			namespace: 'global',
			ref: 'gold',
			name: null,
			type: 'number',
			initial_value: JSON.stringify(0),
			description: null,
		});

		variable.type = 'array';
		variable.initial_value = JSON.stringify([]);
		await variable.save();

		const reloaded = await Variable.find('gold');
		expect(reloaded!.type).toBe('array');
		expect(JSON.parse(reloaded!.initial_value!)).toEqual([]);
	});

	test('assigning null writes a real NULL', async () => {
		await freshDatabase();

		const variable = await Variable.create({
			namespace: 'global',
			ref: 'gold',
			name: 'Gold',
			type: 'number',
			initial_value: '0',
			description: null,
		});

		variable.name = null;
		await variable.save();

		expect((await Variable.find('gold'))!.name).toBeNull();
	});
});
