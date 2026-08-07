/**
 * Proxy behaviour: what a model looks like to plain JavaScript.
 *
 * Consumers spread models, sort them, render them and hand them to
 * `Object.assign` — all of which go through the instance Proxy. These are the
 * invariants that keep that working.
 */

import { describe, expect, test } from 'bun:test';

import {
	Asset,
	Character,
	Line,
	Passage,
	ProjectFile,
	Variable,
} from './helpers/models';
import { freshDatabase } from './helpers/setup';

async function seedLine(): Promise<Line> {
	return Line.create({
		ref: 'intro/say-hi',
		passage_ref: 'intro',
		sort: 10,
		kind: 'say',
		text: 'Hello',
		character_ref: 'alice',
		return_to_caller: 0,
	});
}

describe('attribute access', () => {
	test('a declared field reads back the stored attribute', async () => {
		await freshDatabase();
		const line = await seedLine();

		// `text!: string | null` is a type-only declaration; the value has to
		// come from the attribute store, not the undefined class field.
		expect(line.text).toBe('Hello');
		expect(line.kind).toBe('say');
	});

	test('an undeclared attribute is still readable after hydration', async () => {
		await freshDatabase();
		await seedLine();

		const line = await Line.query().first();
		expect((line as unknown as Record<string, unknown>).passage_ref).toBe(
			'intro',
		);
	});

	test('an unknown property reads as undefined', async () => {
		await freshDatabase();
		const line = await seedLine();

		expect(
			(line as unknown as Record<string, unknown>).nope,
		).toBeUndefined();
	});

	test('assignment round-trips through the attribute store', async () => {
		await freshDatabase();
		const line = await seedLine();

		line.text = 'Changed';
		expect(line.text).toBe('Changed');
		expect(line.getDirty()).toEqual(['text']);
	});

	test('Object.assign applies a patch', async () => {
		await freshDatabase();
		const line = await seedLine();

		Object.assign(line, { text: 'Patched', position: 'left' });

		expect(line.text).toBe('Patched');
		expect(line.position).toBe('left');
		expect(line.getDirty().sort()).toEqual(['position', 'text']);
	});

	test('a null assignment is stored as null, not dropped', async () => {
		await freshDatabase();
		const line = await seedLine();

		line.text = null;
		await line.save();

		const reloaded = await Line.query().first();
		expect(reloaded!.text).toBeNull();
	});
});

describe('enumeration', () => {
	test('Object.keys lists attributes only', async () => {
		await freshDatabase();
		const line = await seedLine();

		const keys = Object.keys(line).sort();
		expect(keys).toContain('ref');
		expect(keys).toContain('kind');
		expect(keys).not.toContain('routes');
		expect(keys).not.toContain('_attributes');
	});

	test('spreading yields a plain attribute bag', async () => {
		await freshDatabase();
		const line = await seedLine();

		const copy = { ...line };
		expect(copy.ref).toBe('intro/say-hi');
		expect(copy.text).toBe('Hello');
		expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
	});

	test('JSON.stringify serialises the attributes', async () => {
		await freshDatabase();
		const line = await seedLine();

		const parsed = JSON.parse(JSON.stringify(line)) as Record<
			string,
			unknown
		>;
		expect(parsed.ref).toBe('intro/say-hi');
		expect(parsed.text).toBe('Hello');
		expect(parsed).not.toHaveProperty('routes');
	});

	test('eager-loaded relations stay out of enumeration', async () => {
		await freshDatabase();
		await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});
		await seedLine();

		const [passage] = await Passage.query().with('lines').get();
		expect(passage!.lines).toHaveLength(1);
		expect(Object.keys(passage!)).not.toContain('lines');
		expect(JSON.stringify(passage!)).not.toContain('say-hi');
	});
});

describe('methods and getters', () => {
	test('a computed getter reads through to attributes', async () => {
		await freshDatabase();
		const line = await seedLine();

		expect(line.summary).toBe('alice · "Hello"');
	});

	test('a boolean-coercing getter works on hydrated models', async () => {
		await freshDatabase();
		await Character.create({
			ref: 'alice',
			name: 'Alice',
			is_player: 1,
			pron_plural: 0,
		});

		const character = await Character.query().first();
		expect(character!.isPlayer).toBe(true);
	});

	test('a getter that reads through a relation works once loaded', async () => {
		await freshDatabase();

		const file = await ProjectFile.create({
			path: 'assets/backgrounds/room.png',
			name: 'room.png',
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

		const [asset] = await Asset.query().with('file').get();
		expect(asset!.path).toBe('assets/backgrounds/room.png');
		expect(asset!.folder).toBe('backgrounds');
	});

	test('a method on the direct prototype cannot be clobbered', async () => {
		await freshDatabase();

		class Owned extends Line {
			describe(): string {
				return this.kind;
			}
		}

		const line = new Owned();
		expect(() => {
			(line as unknown as Record<string, unknown>).describe = 'nope';
		}).toThrow();
		expect(typeof line.describe).toBe('function');
	});

	test('a setter on the direct prototype receives the write', async () => {
		await freshDatabase();

		class WithSetter extends Line {
			get label(): string {
				return this.text ?? '';
			}
			set label(value: string) {
				this.text = value.trim();
			}
		}

		const line = new WithSetter();
		line.label = '  spaced  ';
		expect(line.text).toBe('spaced');
	});

	test('a getter-only property rejects assignment instead of shadowing it', async () => {
		await freshDatabase();
		const line = await seedLine();

		// Falling through would create a phantom `summary` attribute, which
		// becomes a phantom column on the next UPDATE.
		expect(() => {
			(line as unknown as Record<string, unknown>).summary = 'nope';
		}).toThrow();

		expect(line.summary).toBe('alice · "Hello"');
		expect(line.getDirty()).not.toContain('summary');
	});

	test('an inherited method name cannot be shadowed by an attribute', async () => {
		await freshDatabase();
		const line = await seedLine();

		// `save` lives on Model.prototype, above Line.prototype, so this
		// exercises the set trap's full chain walk, not just the immediate one.
		expect(() => {
			(line as unknown as Record<string, unknown>).save = 'nope';
		}).toThrow();

		expect(typeof line.save).toBe('function');
		expect(line.getDirty()).not.toContain('save');
	});

	test('inherited getters are protected too', async () => {
		await freshDatabase();
		const line = await seedLine();

		// `isDirty` is a getter on ChangeStateMixin, copied onto
		// Model.prototype — two levels up from the instance.
		expect(() => {
			(line as unknown as Record<string, unknown>).isDirty = true;
		}).toThrow();
		expect(line.getDirty()).not.toContain('isDirty');
	});

	test('ordinary columns still write normally', async () => {
		await freshDatabase();
		const line = await seedLine();

		line.text = 'Changed';
		line.position = 'left';

		expect(line.getDirty().sort()).toEqual(['position', 'text']);
	});

	test('the chain walk stops before Object.prototype', async () => {
		await freshDatabase();
		const line = await seedLine();

		// A schema is allowed a column named `toString`; protecting Model's
		// API should not make Object.prototype's members unwritable too.
		(line as unknown as Record<string, unknown>)['toString'] =
			'legacy column' as unknown as () => string;

		expect(line.getDirty()).toContain('toString');
	});

	test('constructor resolves to the real class with its statics', async () => {
		await freshDatabase();
		const line = await seedLine();

		expect(line.constructor).toBe(Line);
		expect((line.constructor as typeof Line).config.table).toBe('lines');
	});

	test('instanceof still holds through the proxy', async () => {
		await freshDatabase();
		const line = await seedLine();

		expect(line instanceof Line).toBe(true);
		expect(line instanceof Passage).toBe(false);
	});

	test('a static helper is reachable from the class', async () => {
		await freshDatabase();
		expect(Variable.getTableName()).toBe('variables');
	});
});

describe('mixin methods reach instance state', () => {
	test('getDirty, getChanges and isDirty all see the same attributes', async () => {
		await freshDatabase();
		const line = await seedLine();

		line.text = 'Changed';
		line.sort = 20;

		expect(line.isDirty).toBe(true);
		expect(line.getDirty().sort()).toEqual(['sort', 'text']);
		expect(line.getChanges()).toEqual({
			text: { old: 'Hello', new: 'Changed' },
			sort: { old: 10, new: 20 },
		});
	});
});
