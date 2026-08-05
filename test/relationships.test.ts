/**
 * Relationship loading — eager, lazy, nested, and the partial-load guard.
 *
 * The multi-level `with()` calls here are the heaviest relation graphs the
 * ORM is asked to build: three levels deep, with a parent path and its nested
 * paths requested together.
 */

import { describe, expect, test } from 'bun:test';

import { Model } from '../src/model';
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
	Note,
	Passage,
	ProjectFile,
	Profile,
	Role,
	Route,
	ThunkLine,
	ThunkPassage,
	User,
} from './helpers/models';
import { freshDatabase } from './helpers/setup';
import type { BunSqliteAdapter } from './helpers/adapter';

/** Builds a passage → lines → routes → conditions graph. */
async function seedStory(): Promise<void> {
	await Passage.create({
		ref: 'intro',
		title: 'Intro',
		status: 'draft',
		sort: 0,
		auto_continue: 0,
		allow_back: 0,
	});
	await Passage.create({
		ref: 'hall',
		title: 'Hall',
		status: 'draft',
		sort: 1,
		auto_continue: 0,
		allow_back: 0,
	});

	await Line.create({
		ref: 'intro/say-hi',
		passage_ref: 'intro',
		sort: 10,
		kind: 'say',
		text: 'Hello',
		return_to_caller: 0,
	});
	await Line.create({
		ref: 'intro/jump-hall',
		passage_ref: 'intro',
		sort: 20,
		kind: 'jump',
		return_to_caller: 0,
	});

	await Route.create({
		ref: 'r-intro-1',
		owner_kind: 'line',
		owner_ref: 'intro/jump-hall',
		sort: 0,
		goto_ref: 'hall',
	});

	await Condition.create({
		uuid: 'cond-1',
		owner_kind: 'route',
		owner_ref: 'r-intro-1',
		variable_ref: 'has_key',
		op: 'eq',
		value: 'true',
	});

	await Choice.create({
		ref: 'intro/c1',
		passage_ref: 'intro',
		sort: 0,
		text: 'Go north',
	});
	await Effect.create({
		uuid: 'eff-1',
		owner_kind: 'choice',
		owner_ref: 'intro/c1',
		variable_ref: 'gold',
		op: 'add',
		value: '5',
	});
}

function selectCount(adapter: BunSqliteAdapter): number {
	return adapter.log.filter(e => e.kind === 'query').length;
}

describe('eager loading', () => {
	test('hasMany loads children in one extra query', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();
		adapter.clearLog();

		const passages = await Passage.query().with('lines').get();

		expect(passages).toHaveLength(2);
		const intro = passages.find(p => p.ref === 'intro')!;
		expect(intro.lines).toHaveLength(2);
		// One SELECT for passages, one for all lines — not one per passage.
		expect(selectCount(adapter)).toBe(2);
	});

	test('hasMany yields an empty array when there are no children', async () => {
		await freshDatabase();
		await seedStory();

		const passages = await Passage.query().with('lines').get();
		const hall = passages.find(p => p.ref === 'hall')!;
		expect(hall.lines).toEqual([]);
	});

	test('belongsTo loads the parent', async () => {
		await freshDatabase();

		const file = await ProjectFile.create({
			path: 'assets/bg/room.png',
			name: 'room.png',
			size: 10,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		await Asset.create({
			ref: 'bg-room',
			file_id: file.id,
			name: 'Room',
			type: 'image',
		});

		const [asset] = await Asset.query().with('file').get();
		expect(asset!.file).not.toBeNull();
		expect(asset!.file.path).toBe('assets/bg/room.png');
	});

	test('belongsTo yields null when the foreign key points nowhere', async () => {
		await freshDatabase();

		// Dangling asset_ref: the row exists, the target does not.
		await CharacterAsset.create({
			character_ref: 'alice',
			asset_ref: 'missing',
			kind: 'portrait',
		});

		const [link] = await CharacterAsset.query().with('asset').get();
		expect(link!.asset).toBeNull();
	});

	test('belongsTo yields null when the foreign key itself is null', async () => {
		await freshDatabase();

		await Note.create({ body: 'orphan', target_kind: null });

		const [note] = await Note.query().with('target').get();
		expect(note!.target).toBeNull();
	});

	test('hasOne loads a single related model', async () => {
		await freshDatabase();

		const user = await User.create({ name: 'Ann' });
		await Profile.create({ user_id: user.id, bio: 'Hi' });

		const [loaded] = await User.query().with('profile').get();
		expect(loaded!.profile).not.toBeNull();
		expect(loaded!.profile!.bio).toBe('Hi');
	});

	test('hasOne yields null when there is no match', async () => {
		await freshDatabase();
		await User.create({ name: 'Ann' });

		const [loaded] = await User.query().with('profile').get();
		expect(loaded!.profile).toBeNull();
	});

	test('belongsToMany loads through the pivot table', async () => {
		const { adapter } = await freshDatabase();

		const user = await User.create({ name: 'Ann' });
		const admin = await Role.create({ name: 'admin' });
		const editor = await Role.create({ name: 'editor' });
		adapter.db.exec(
			`INSERT INTO user_roles (user_id, role_id) VALUES (${user.id}, ${admin.id}), (${user.id}, ${editor.id})`,
		);

		const [loaded] = await User.query().with('roles').get();
		expect(loaded!.roles.map((r: Role) => r.name).sort()).toEqual([
			'admin',
			'editor',
		]);
	});

	test('morphTo resolves each discriminator to its own model', async () => {
		await freshDatabase();

		const user = await User.create({ name: 'Ann' });
		const role = await Role.create({ name: 'admin' });

		await Note.create({
			body: 'about a user',
			target_kind: 'user',
			target_id: user.id,
		});
		await Note.create({
			body: 'about a role',
			target_kind: 'role',
			target_id: role.id,
		});
		await Note.create({ body: 'about nothing' });

		const notes = await Note.query().with('target').orderBy('id').get();

		expect((notes[0]!.target as User).name).toBe('Ann');
		expect((notes[1]!.target as Role).name).toBe('admin');
		expect(notes[2]!.target).toBeNull();
	});

	test('deduplicates repeated foreign keys into one IN clause', async () => {
		const { adapter } = await freshDatabase();

		const file = await ProjectFile.create({
			path: 'shared.png',
			name: 'shared.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		for (const ref of ['a', 'b', 'c']) {
			await Asset.create({
				ref,
				file_id: file.id,
				name: ref,
				type: 'image',
			});
		}

		adapter.clearLog();
		await Asset.query().with('file').get();

		const fileQuery = adapter.log.find(e => e.sql.includes('FROM files'))!;
		// Three assets share one file: the IN list must collapse to a single id.
		expect(fileQuery.params).toEqual([file.id]);
	});
});

describe('nested eager loading', () => {
	test('loads two levels with dot notation', async () => {
		await freshDatabase();
		await seedStory();

		const [intro] = await Passage.query()
			.with('lines.routes')
			.where('ref', 'intro')
			.get();

		const jump = intro!.lines.find(
			(l: Line) => l.ref === 'intro/jump-hall',
		)!;
		expect(jump.routes).toHaveLength(1);
		expect(jump.routes[0]!.goto_ref).toBe('hall');
	});

	test('loads three levels with dot notation', async () => {
		await freshDatabase();
		await seedStory();

		const [intro] = await Passage.query()
			.with('lines.routes.conditions')
			.where('ref', 'intro')
			.get();

		const jump = intro!.lines.find(
			(l: Line) => l.ref === 'intro/jump-hall',
		)!;
		expect(jump.routes[0]!.conditions).toHaveLength(1);
		expect(jump.routes[0]!.conditions[0]!.variable_ref).toBe('has_key');
	});

	test('nested load through hasMany then belongsTo', async () => {
		await freshDatabase();

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
		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		await CharacterAsset.create({
			character_ref: 'alice',
			asset_ref: 'portrait',
			kind: 'portrait',
		});

		const [alice] = await Character.query().with('assets.asset').get();
		expect(alice!.assets).toHaveLength(1);
		expect(alice!.assets[0]!.asset.name).toBe('Portrait');
	});

	test('listing a parent path alongside its nested path loads both', async () => {
		await freshDatabase();
		await seedStory();

		// A parent path listed alongside its own nested paths.
		const [intro] = await Passage.query()
			.with(
				'lines',
				'lines.routes.conditions',
				'choices.conditions',
				'choices.effects',
				'choices.routes.conditions',
			)
			.where('ref', 'intro')
			.get();

		expect(intro!.lines).toHaveLength(2);
		const jump = intro!.lines.find(
			(l: Line) => l.ref === 'intro/jump-hall',
		)!;
		expect(jump.routes[0]!.conditions).toHaveLength(1);
		expect(intro!.choices).toHaveLength(1);
		expect(intro!.choices[0]!.effects).toHaveLength(1);
		expect(intro!.choices[0]!.conditions).toEqual([]);
	});

	test('the partial-load guard does not re-query an already-loaded relation', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();
		adapter.clearLog();

		await Passage.query().with('lines', 'lines.routes').get();

		const lineQueries = adapter.log.filter(e =>
			e.sql.includes('FROM lines'),
		);
		// 'lines' and 'lines.routes' both need lines, but only one SELECT should fire.
		expect(lineQueries).toHaveLength(1);
	});

	test('a three-level graph with sibling branches loads end to end', async () => {
		await freshDatabase();

		const file = await ProjectFile.create({
			path: 'bg.png',
			name: 'bg.png',
			size: 1,
			mime: 'image/png',
			extension: 'png',
			ctime: 0,
			mtime: 0,
		});
		await Asset.create({
			ref: 'bg-room',
			file_id: file.id,
			name: 'Room',
			type: 'image',
		});
		await Hotspot.create({
			ref: 'bg-room-h10',
			bg_asset_ref: 'bg-room',
			sort: 10,
			label: 'Door',
			x: 0.4,
			y: 0.4,
			w: 0.2,
			h: 0.2,
			mask_asset_ref: null,
		});
		await Route.create({
			ref: 'r-door',
			owner_kind: 'hotspot',
			owner_ref: 'bg-room-h10',
			sort: 0,
			goto_ref: 'hall',
		});
		await Condition.create({
			uuid: 'c-door',
			owner_kind: 'route',
			owner_ref: 'r-door',
			variable_ref: 'has_key',
			op: 'eq',
			value: 'true',
		});

		const [asset] = await Asset.query()
			.with(
				'hotspots.conditions',
				'hotspots.effects',
				'hotspots.routes.conditions',
			)
			.where('ref', 'bg-room')
			.get();

		expect(asset!.hotspots).toHaveLength(1);
		const hotspot = asset!.hotspots[0]!;
		expect(hotspot.label).toBe('Door');
		expect(hotspot.routes).toHaveLength(1);
		expect(hotspot.routes[0]!.conditions).toHaveLength(1);
		expect(hotspot.conditions).toEqual([]);
		expect(hotspot.effects).toEqual([]);
	});

	test('an unknown nested relation name throws', async () => {
		await freshDatabase();
		await seedStory();

		// `with()` now rejects this at compile time; the cast reaches the
		// runtime guard, which still matters for plain-JS consumers.
		await expect(
			Passage.query()
				.with('lines.nonexistent' as 'lines')
				.get(),
		).rejects.toThrow(/not found/i);
	});
});

describe('lazy loading', () => {
	test('load() populates a relation on demand', async () => {
		await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		await passage!.load('lines');

		expect(passage!.lines).toHaveLength(2);
	});

	test('load() is idempotent and does not re-query', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		await passage!.load('lines');
		adapter.clearLog();
		await passage!.load('lines');

		expect(adapter.log.filter(e => e.sql.includes('FROM lines'))).toEqual(
			[],
		);
	});

	test('concurrent load() calls share a single query', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		adapter.clearLog();
		await Promise.all([passage!.load('lines'), passage!.load('lines')]);

		expect(
			adapter.log.filter(e => e.sql.includes('FROM lines')),
		).toHaveLength(1);
	});

	test('load() of an unknown relation rejects', async () => {
		await freshDatabase();
		await seedStory();

		const passage = await Passage.query().where('ref', 'intro').first();
		await expect(passage!.load('nope')).rejects.toThrow(/not found/i);
	});
});

describe('relationship assignment', () => {
	test('assigning a relation stores it outside the attribute set', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();

		const [intro] = await Passage.query().with('lines').get();

		// A common pattern: sort eager-loaded children, then write them back.
		intro!.lines = [...intro!.lines].sort((a, b) => b.sort - a.sort);
		expect(intro!.lines[0]!.ref).toBe('intro/jump-hall');

		// Crucially, it must not have become a pending attribute write.
		expect(intro!.getDirty()).toEqual([]);

		adapter.clearLog();
		intro!.title = 'Changed';
		await intro!.save();

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).not.toContain('lines');
	});

	test('assigning a belongsTo relation does not create a phantom column', async () => {
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
			ref: 'bg',
			file_id: file.id,
			name: 'Bg',
			type: 'image',
		});

		asset.file = file;
		expect(asset.file.path).toBe('a.png');
		expect(asset.getDirty()).toEqual([]);

		adapter.clearLog();
		asset.name = 'Bg2';
		await asset.save();

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).not.toContain('"file"');
	});

	test('mutating an eager-loaded child and saving it persists', async () => {
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
			ref: 'bg',
			file_id: file.id,
			name: 'Bg',
			type: 'image',
		});

		const [asset] = await Asset.query().with('file').get();
		asset!.file.path = 'assets/new/a.png';
		await asset!.file.save();

		const reloaded = await ProjectFile.query().where('id', file.id).first();
		expect(reloaded!.path).toBe('assets/new/a.png');
	});
});

describe('relationship cache invalidation', () => {
	test('changing an owner key clears and reloads the affected relation', async () => {
		await freshDatabase();
		await seedStory();

		// A line belonging to the ref we are about to rename *into*.
		await Line.create({
			ref: 'prologue/say-there',
			passage_ref: 'prologue',
			sort: 10,
			kind: 'say',
			text: 'There',
			return_to_caller: 0,
		});

		const [intro] = await Passage.query()
			.with('lines')
			.where('ref', 'intro')
			.get();
		expect(intro!.lines).toHaveLength(2);

		// `lines` keys off `ref`, so changing `ref` must invalidate it.
		intro!.ref = 'prologue';
		await intro!.save();

		expect(intro!.lines).toHaveLength(1);
		expect(intro!.lines[0]!.ref).toBe('prologue/say-there');

		// …and the rename itself must have persisted.
		expect(
			await Passage.query().where('ref', 'prologue').first(),
		).not.toBeNull();
		expect(await Passage.query().where('ref', 'intro').first()).toBeNull();
	});

	test('changing an unrelated column leaves relations cached', async () => {
		const { adapter } = await freshDatabase();
		await seedStory();

		const [intro] = await Passage.query()
			.with('lines')
			.where('ref', 'intro')
			.get();

		adapter.clearLog();
		intro!.title = 'Changed';
		await intro!.save();

		expect(adapter.log.filter(e => e.sql.includes('FROM lines'))).toEqual(
			[],
		);
		expect(intro!.lines).toHaveLength(2);
	});
});

describe('thunk-resolved relationships', () => {
	test('a thunk defers resolution of a mutually-referential model', async () => {
		await freshDatabase();

		await ThunkPassage.create({ ref: 'intro', title: 'Intro' });
		await ThunkLine.create({
			ref: 'intro/a',
			passage_ref: 'intro',
			kind: 'say',
		});

		const [passage] = await ThunkPassage.query().with('lines').get();
		expect(passage!.lines).toHaveLength(1);

		const [line] = await ThunkLine.query().with('passage').get();
		expect(line!.passage!.title).toBe('Intro');
	});

	test('a thunk without explicit keys is rejected at definition time', () => {
		expect(() => {
			class Bad extends Model<Bad> {
				static config = { table: 'roles', timestamps: false };
				static readonly relationships = {
					roles: this.hasMany(() => Role),
				};
			}
			return Bad;
		}).toThrow(/explicit foreignKey/i);
	});
});

describe('key inference', () => {
	test('hasMany infers foreignKey from the parent class name', async () => {
		await freshDatabase();

		class InferUser extends Model<InferUser> {
			static config = { table: 'users', timestamps: false };
			id!: number;
			name!: string | null;
			static readonly relationships = {
				profiles: this.hasMany(Profile),
			};
		}

		const rel = (
			InferUser.relationships as {
				profiles: { getForeignKey(): string; getLocalKey(): string };
			}
		).profiles;
		expect(rel.getForeignKey()).toBe('infer_user_id');
		expect(rel.getLocalKey()).toBe('id');
	});

	test('belongsTo infers foreignKey from the related class name', async () => {
		await freshDatabase();

		class InferProfile extends Model<InferProfile> {
			static config = { table: 'profiles', timestamps: false };
			id!: number;
			static readonly relationships = {
				role: this.belongsTo(Role),
			};
		}

		const rel = (
			InferProfile.relationships as {
				role: { getForeignKey(): string; getLocalKey(): string };
			}
		).role;
		expect(rel.getForeignKey()).toBe('role_id');
		expect(rel.getLocalKey()).toBe('id');
	});
});

describe('CharacterTag composite children', () => {
	test('a composite-key hasMany eager loads', async () => {
		await freshDatabase();

		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 0,
			pron_plural: 0,
		});
		await CharacterTag.create({ character_ref: 'alice', tag: 'hero' });
		await CharacterTag.create({ character_ref: 'alice', tag: 'mage' });

		const [alice] = await Character.query().with('tags').get();
		expect(alice!.tags.map((t: CharacterTag) => t.tag).sort()).toEqual([
			'hero',
			'mage',
		]);
	});
});
