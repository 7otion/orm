/**
 * Runtime behaviour of the column model that `ColumnKeys`/`Patch` describe.
 *
 * The type-level half lives in `types.test-d.ts`. These cover what survives
 * type erasure: what `fill` does when the data did not come from typed code —
 * `JSON.parse`, a plain-JS consumer, a cast — which is the only way to reach
 * these paths now.
 */

import { describe, expect, test } from 'bun:test';

import { Model } from '../src/model';
import { Line, Settable } from './helpers/models';
import { freshDatabase } from './helpers/setup';

/** An untyped payload, as it would arrive from the network or a file. */
function untrusted(json: string): any {
	return JSON.parse(json);
}

describe('fill() and computed properties', () => {
	test('names the model and the property when given a getter', async () => {
		await freshDatabase();

		const line = new Line();

		expect(() =>
			line.fill(untrusted('{"isReturnToCaller": true}')),
		).toThrow(
			/Line\.isReturnToCaller is a computed property, not a column/,
		);
	});

	test('the message explains the fix rather than leaking the proxy', async () => {
		await freshDatabase();

		const line = new Line();

		expect(() => line.fill(untrusted('{"summary": "x"}'))).toThrow(
			/Assign the columns it derives from, or give it a setter/,
		);
		// Not the proxy's own unlabelled "trap returned falsish" TypeError.
		expect(() => line.fill(untrusted('{"summary": "x"}'))).not.toThrow(
			/falsish/,
		);
	});

	test('refuses to overwrite an inherited method', async () => {
		await freshDatabase();

		const line = new Line();

		expect(() => line.fill(untrusted('{"save": 1}'))).toThrow(
			/Line\.save is a method, not a column/,
		);
	});

	test('an accessor with a setter is a column, and routes through it', async () => {
		await freshDatabase();

		const s = new Settable();
		s.fill({ label: 'hello' });

		// The setter ran, so the backing column holds the value.
		expect(s.raw_label).toBe('hello');
		expect(s.label).toBe('hello');
		expect(s.computed).toBe('HELLO');
	});

	test('a getter is still readable after filling its backing columns', async () => {
		await freshDatabase();

		const line = new Line();
		line.fill({ return_to_caller: 1, kind: 'return' });

		expect(line.isReturnToCaller).toBe(true);
	});
});

describe('fill() and non-columns', () => {
	test('still ignores ORM internals', async () => {
		await freshDatabase();

		const line = new Line();
		line.fill(
			untrusted('{"_exists": true, "_attributes": {}, "kind": "say"}'),
		);

		expect(line.kind).toBe('say');
		expect((line as unknown as { _exists: boolean })._exists).toBe(false);
	});

	test('an unknown key becomes a column, and fails at the database', async () => {
		await freshDatabase();

		const line = new Line();
		line.fill(
			untrusted(
				'{"ref": "intro/a", "passage_ref": "intro", "kind": "say"}',
			),
		);
		line.fill(untrusted('{"bogus_column": "zzz"}'));

		// Nothing in the ORM knows the table's real columns, so this is the
		// database's job — which is why `fillable` still exists for untrusted
		// input even though the type layer covers typed callers.
		await expect(line.save()).rejects.toThrow(/bogus_column/);
	});

	test('fillable still gates untyped data', async () => {
		await freshDatabase();

		class Restricted extends Model<Restricted> {
			static config = {
				table: 'lines',
				primaryKey: 'ref',
				timestamps: false,
				fillable: ['ref', 'passage_ref', 'kind'],
			};
			ref!: string;
			passage_ref!: string;
			kind!: string;
			text!: string | null;
		}

		const r = new Restricted();
		r.fill(
			untrusted(
				'{"ref": "a", "passage_ref": "p", "kind": "say", "text": "nope"}',
			),
		);

		expect(r.ref).toBe('a');
		expect(r.text).toBeUndefined();
	});

	test('a guarded computed property is skipped before it can throw', async () => {
		await freshDatabase();

		class Guarded extends Model<Guarded> {
			static config = {
				table: 'lines',
				primaryKey: 'ref',
				timestamps: false,
				guarded: ['summary'],
			};
			ref!: string;
			kind!: string;
			text!: string | null;

			get summary(): string {
				return this.text ?? '';
			}
		}

		const g = new Guarded();

		// `guarded` is checked first, so a hostile payload naming a computed
		// property is dropped rather than raising.
		expect(() =>
			g.fill(untrusted('{"summary": "x", "kind": "say"}')),
		).not.toThrow();
		expect(g.kind).toBe('say');
	});
});

describe('Model has no writable instance state to corrupt', () => {
	test('a payload naming `relationships` cannot shadow anything', async () => {
		await freshDatabase();

		const line: any = new Line();

		line.fill(untrusted('{"relationships": "evil"}'));

		// The class's registry is reached through the static, and is intact.
		expect(Line.relationships).toBeDefined();
		expect(Line.relationships.routes).toBeDefined();

		// The name is now nothing but an unknown column, and fails like one.
		await expect(line.save()).rejects.toThrow(/relationships/);
	});

	test('no writable non-underscore own property survives construction', async () => {
		await freshDatabase();

		const line = new Line();

		// Anything here would be reachable by an untrusted payload and shadowed
		// by `_attributes`. The proxy hides own properties, so probe through a
		// fresh instance's own keys directly.
		const own = Object.getOwnPropertyNames(line).filter(
			k => !k.startsWith('_'),
		);

		expect(own).toEqual([]);
	});
});

describe('the write guard and the proxy agree', () => {
	test('both resolve a declaration the same way', async () => {
		await freshDatabase();

		const line: any = new Line();

		// `fill` reports through assertWritableColumn; a direct assignment goes
		// through the proxy's set trap. Both call findDeclaration, so a getter
		// is refused on both paths.
		expect(() => line.fill(untrusted('{"summary": "x"}'))).toThrow(
			/computed property/,
		);
		expect(() => {
			line.summary = 'x';
		}).toThrow(TypeError);

		// A column named `toString` is still accepted by both paths, because
		// both stop before Object.prototype.
		const l2: any = new Line();
		expect(() => l2.fill(untrusted('{"toString": "col"}'))).not.toThrow();
		expect(l2._attributes.toString).toBe('col');

		// Reading it back is separate: the *get* trap walks the full chain on
		// purpose, so `Object.prototype.toString` still wins. The write guard
		// and the set trap agree; the get trap is asymmetric by design.
		expect(typeof l2.toString).toBe('function');
	});
});

describe('create() and update() go through the same guard', () => {
	test('create() rejects a computed property from untyped data', async () => {
		await freshDatabase();

		await expect(
			Line.create(untrusted('{"ref": "a", "summary": "x"}')),
		).rejects.toThrow(/Line\.summary is a computed property/);
	});

	test('a full round trip still writes every declared column', async () => {
		await freshDatabase();

		await Line.create({
			ref: 'intro/a',
			passage_ref: 'intro',
			sort: 10,
			kind: 'say',
			text: 'hello',
			character_ref: 'ann',
			return_to_caller: 0,
		});

		const found = (await Line.find('intro/a'))!;
		expect(found.text).toBe('hello');
		expect(found.character_ref).toBe('ann');
		expect(found.summary).toBe('ann · "hello"');

		found.fill({ text: 'patched' });
		await found.save();

		expect((await Line.find('intro/a'))!.text).toBe('patched');

		await Line.query().where('ref', 'intro/a').update({ sort: 20 });
		expect((await Line.find('intro/a'))!.sort).toBe(20);
	});
});
