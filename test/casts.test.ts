/**
 * Column casts, and the SQLite boolean gap they close.
 *
 * Without these, a model wanting `is_active: boolean` had to carry a
 * `=== 1` getter and a `? 1 : 0` at every write, because SQLite stores no
 * booleans — and a driver handed a raw `true` may not even store 0/1.
 */

import { describe, expect, test } from 'bun:test';

import { Model } from '../src/model';
import { BooleanCast, Caster, DateCast, type ColumnCast } from '../src/casts';
import { Timestamps } from '../src/timestamps';
import { SQLiteDialect } from '../src/plugins/dialects/sqlite';
import { Passage } from './helpers/models';
import { freshDatabase } from './helpers/setup';

class Casted extends Model<Casted> {
	static config = {
		table: 'casted',
		primaryKey: 'ref',
		timestamps: false,
		casts: {
			is_active: 'boolean',
			settings: 'json',
			due_at: 'date',
			nickname: 'emptyToNull',
		} as const,
	};

	ref!: string;
	is_active!: boolean;
	settings!: { theme: string; level: number } | null;
	due_at!: Date | null;
	nickname!: string | null;
	plain_count!: number;
}

/** No casts declared — the control for every assertion below. */
class Uncast extends Model<Uncast> {
	static config = { table: 'casted', primaryKey: 'ref', timestamps: false };

	ref!: string;
	is_active!: number;
	settings!: string | null;
	due_at!: number | null;
	nickname!: string | null;
	plain_count!: number;
}

describe('boolean cast', () => {
	test('round-trips as a boolean, and stores 0/1', async () => {
		const { adapter } = await freshDatabase();

		await Casted.create({ ref: 'a', is_active: true, settings: null });

		const found = (await Casted.find('a'))!;
		expect(found.is_active).toBe(true);

		// Stored shape is the integer, not the JSON text `"true"`.
		const raw = adapter.db
			.query(`SELECT is_active, typeof(is_active) AS ty FROM casted`)
			.get() as { is_active: unknown; ty: string };
		expect(raw.is_active).toBe(1);
		expect(raw.ty).toBe('integer');
	});

	test('false stores 0 and reads back false', async () => {
		await freshDatabase();

		await Casted.create({ ref: 'a', is_active: false, settings: null });
		expect((await Casted.find('a'))!.is_active).toBe(false);

		// A model without the cast sees the underlying integer.
		expect((await Uncast.find('a'))!.is_active).toBe(0);
	});

	test('an update writes 0/1, not a bound boolean', async () => {
		await freshDatabase();

		await Casted.create({ ref: 'a', is_active: false, settings: null });
		const model = (await Casted.find('a'))!;
		model.fill({ is_active: true });
		await model.save();

		expect((await Uncast.find('a'))!.is_active).toBe(1);
	});

	test('a hydrated model is not dirty', async () => {
		await freshDatabase();

		await Casted.create({ ref: 'a', is_active: true, settings: null });
		const found = (await Casted.find('a'))!;

		// `_original` is cast alongside `_attributes`, so `true !== 1` never
		// makes a freshly loaded row look changed.
		expect(found.isDirty).toBe(false);
		expect(found.getDirty()).toEqual([]);
	});

	test('legacy rows holding the JSON text still read as booleans', async () => {
		const { adapter } = await freshDatabase();

		// What a driver that binds a raw boolean wrote before the dialect
		// normalised it.
		adapter.db.run(
			`INSERT INTO casted (ref, is_active, settings) VALUES ('a', 'true', NULL)`,
		);

		expect((await Casted.find('a'))!.is_active).toBe(true);
	});

	test('an uncast integer column is left alone', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: true,
			settings: null,
			plain_count: 3,
		});

		expect((await Casted.find('a'))!.plain_count).toBe(3);
	});
});

describe('json cast', () => {
	test('round-trips a structured value', async () => {
		const { adapter } = await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: { theme: 'dark', level: 3 },
		});

		expect((await Casted.find('a'))!.settings).toEqual({
			theme: 'dark',
			level: 3,
		});

		// Stored as text, so the consumer no longer stringifies by hand.
		const raw = adapter.db
			.query(`SELECT settings, typeof(settings) AS ty FROM casted`)
			.get() as { settings: string; ty: string };
		expect(raw.ty).toBe('text');
		expect(JSON.parse(raw.settings)).toEqual({ theme: 'dark', level: 3 });
	});

	test.each([
		['a plain string', 'hello'],
		['an empty string', ''],
		['a number', 42],
		['a boolean', true],
		['an array', [1, 'two', false]],
	])('round-trips %s', async (_label, value) => {
		await freshDatabase();

		// Strings are the trap: storing them unserialised reads back as a
		// parse error rather than the value.
		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: value as never,
		});

		expect((await Casted.find('a'))!.settings).toEqual(value as never);
	});

	test('null survives in both directions', async () => {
		await freshDatabase();

		await Casted.create({ ref: 'a', is_active: false, settings: null });
		expect((await Casted.find('a'))!.settings).toBeNull();
	});

	test('malformed JSON names the column instead of failing obscurely', async () => {
		const { adapter } = await freshDatabase();

		adapter.db.run(
			`INSERT INTO casted (ref, is_active, settings) VALUES ('a', 0, '{not json')`,
		);

		await expect(Casted.find('a')).rejects.toThrow(
			/Column "settings" is cast to 'json' but does not hold valid JSON/,
		);
	});
});

describe('date cast', () => {
	const DUE = new Date('2030-06-15T12:34:56.000Z');

	test('round-trips as a Date, stored as unix seconds', async () => {
		const { adapter } = await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: DUE,
		});

		const found = (await Casted.find('a'))!;
		expect(found.due_at).toBeInstanceOf(Date);
		expect(found.due_at!.getTime()).toBe(DUE.getTime());

		// Seconds, not milliseconds — the unit `timestamps` has always used.
		const raw = adapter.db
			.query(`SELECT due_at, typeof(due_at) AS ty FROM casted`)
			.get() as { due_at: number; ty: string };
		expect(raw.ty).toBe('integer');
		expect(raw.due_at).toBe(DUE.getTime() / 1000);
	});

	test('sub-second precision is truncated, not rounded up', async () => {
		await freshDatabase();

		// The column stores seconds, so the millisecond part cannot survive.
		// Truncating means a reloaded value is never *ahead* of what was set.
		const withMs = new Date('2030-06-15T12:34:56.789Z');
		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: withMs,
		});

		expect((await Uncast.find('a'))!.due_at).toBe(
			Math.floor(withMs.getTime() / 1000),
		);
	});

	test('null survives in both directions', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: null,
		});
		expect((await Casted.find('a'))!.due_at).toBeNull();
	});

	test('an untouched date column is not dirty', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: DUE,
		});

		// The snapshot detaches the Date, so `_original` holds a different
		// instance — compared by reference this would read dirty on every
		// single load.
		const found = (await Casted.find('a'))!;
		expect(found.isDirty).toBe(false);
		expect(found.getDirty()).toEqual([]);
	});

	test('reassigning the date marks it dirty and persists', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: DUE,
		});

		const found = (await Casted.find('a'))!;
		const later = new Date('2031-01-01T00:00:00.000Z');
		found.fill({ due_at: later });

		expect(found.getDirty()).toContain('due_at');
		await found.save();

		expect((await Casted.find('a'))!.due_at!.getTime()).toBe(
			later.getTime(),
		);
	});

	test('an in-place edit of the Date is tracked', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: DUE,
		});

		const found = (await Casted.find('a'))!;
		// Date is mutable, so this is the same hazard `json` has: without a
		// detached snapshot and a value comparison, the edit is invisible.
		found.due_at!.setUTCFullYear(2031);

		expect(found.getDirty()).toContain('due_at');
		expect(found.isDirty).toBe(true);

		await found.save();
		expect((await Casted.find('a'))!.due_at!.getUTCFullYear()).toBe(2031);
	});

	test('re-saving after an in-place edit settles', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: DUE,
		});

		const found = (await Casted.find('a'))!;
		found.due_at!.setUTCFullYear(2031);
		await found.save();

		// The post-save snapshot is detached too, so the model does not stay
		// permanently dirty.
		expect(found.isDirty).toBe(false);
	});

	test('query().update() writes seconds, not a raw Date', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			due_at: null,
		});

		// The bulk path is where `json` was originally missed; a new cast type
		// is exactly the thing likely to miss it again.
		const affected = await Casted.query()
			.where('ref', 'a')
			.update({ due_at: DUE });

		expect(affected).toBe(1);
		expect((await Uncast.find('a'))!.due_at).toBe(DUE.getTime() / 1000);
		expect((await Casted.find('a'))!.due_at!.getTime()).toBe(DUE.getTime());
	});
});

describe('emptyToNull cast', () => {
	test('an empty string is stored and read back as null', async () => {
		const { adapter } = await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			nickname: '',
		});

		expect((await Casted.find('a'))!.nickname).toBeNull();

		const raw = adapter.db.query(`SELECT nickname FROM casted`).get() as {
			nickname: unknown;
		};
		expect(raw.nickname).toBeNull();
	});

	test('a non-empty string is left alone', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			nickname: 'Bud',
		});

		expect((await Casted.find('a'))!.nickname).toBe('Bud');
	});

	test('null is left alone, not passed through the cast', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			nickname: null,
		});

		expect((await Casted.find('a'))!.nickname).toBeNull();
	});

	test('query().update() converts an empty string to null too', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			nickname: 'Bud',
		});

		const affected = await Casted.query()
			.where('ref', 'a')
			.update({ nickname: '' });

		expect(affected).toBe(1);
		expect((await Casted.find('a'))!.nickname).toBeNull();
	});

	test('fill() converts an empty string on an existing model', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: null,
			nickname: 'Bud',
		});

		const found = (await Casted.find('a'))!;
		found.fill({ nickname: '' });
		await found.save();

		expect((await Casted.find('a'))!.nickname).toBeNull();
	});
});

describe('the bulk write path casts too', () => {
	test('query().update() serialises a json column', async () => {
		const { adapter } = await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: { theme: 'light', level: 1 },
		});

		const affected = await Casted.query()
			.where('ref', 'a')
			.update({ settings: { theme: 'dark', level: 2 } });

		// Without the cast the driver is handed a raw object: the statement
		// matches nothing, `update()` reports 0, and the edit is lost with no
		// error anywhere.
		expect(affected).toBe(1);

		const raw = adapter.db
			.query(`SELECT settings, typeof(settings) AS ty FROM casted`)
			.get() as { settings: string; ty: string };
		expect(raw.ty).toBe('text');
		expect(JSON.parse(raw.settings)).toEqual({ theme: 'dark', level: 2 });

		expect((await Casted.find('a'))!.settings).toEqual({
			theme: 'dark',
			level: 2,
		});
	});

	test('query().update() still writes booleans as 0/1', async () => {
		await freshDatabase();

		await Casted.create({ ref: 'a', is_active: false, settings: null });
		await Casted.query().where('ref', 'a').update({ is_active: true });

		expect((await Uncast.find('a'))!.is_active).toBe(1);
	});
});

describe('in-place edits to a json column are tracked', () => {
	test('mutating the loaded object marks the model dirty', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: { theme: 'light', level: 1 },
		});

		const found = (await Casted.find('a'))!;

		// A shallow snapshot would leave `_original.settings` as the very same
		// object, so this edit would mutate both sides and be invisible.
		found.settings!.theme = 'dark';

		expect(found.getDirty()).toContain('settings');
		expect(found.isDirty).toBe(true);

		await found.save();
		expect((await Casted.find('a'))!.settings).toEqual({
			theme: 'dark',
			level: 1,
		});
	});

	test('an untouched json column is not dirty', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: { theme: 'light', level: 1 },
		});

		const found = (await Casted.find('a'))!;

		// Detaching the snapshot must not make every load look changed: the
		// comparison is by value, not by reference.
		expect(found.isDirty).toBe(false);
		expect(found.getDirty()).toEqual([]);
	});

	test('a nested in-place edit is tracked', async () => {
		const { adapter } = await freshDatabase();

		adapter.db.run(
			`INSERT INTO casted (ref, is_active, settings)
			 VALUES ('a', 0, '{"theme":"light","tags":["x"]}')`,
		);

		const found = (await Casted.find('a'))! as unknown as {
			settings: { tags: string[] };
			isDirty: boolean;
		};
		found.settings.tags.push('y');

		expect(found.isDirty).toBe(true);
	});

	test('re-saving after an in-place edit settles', async () => {
		await freshDatabase();

		await Casted.create({
			ref: 'a',
			is_active: false,
			settings: { theme: 'light', level: 1 },
		});

		const found = (await Casted.find('a'))!;
		found.settings!.theme = 'dark';
		await found.save();

		// The post-save snapshot is detached too, so the model settles rather
		// than staying permanently dirty.
		expect(found.isDirty).toBe(false);
	});
});

/* ── custom casts ───────────────────────────────────────────────────────── */

class Money {
	constructor(readonly cents: number) {}
}

/**
 * A cast a consumer could write: it implements `ColumnCast` and nothing else,
 * with no access to ORM internals.
 *
 * The counters are how the optional hooks are shown to be *used* rather than
 * merely accepted — a `clone`/`equals` the ORM ignored would still let most
 * assertions pass by falling back to the defaults.
 */
let cloneCalls = 0;
let equalsCalls = 0;

const MoneyCast: ColumnCast<Money, number> = {
	fromDatabase: cents => new Money(Number(cents)),
	toDatabase: money => money.cents,
	clone: money => {
		cloneCalls++;
		return new Money(money.cents);
	},
	equals: (a, b) => {
		equalsCalls++;
		return a.cents === b.cents;
	},
};

/** A custom cast and a built-in shorthand side by side on one model. */
class Priced extends Model<Priced> {
	static config = {
		table: 'casted',
		primaryKey: 'ref',
		timestamps: false,
		casts: { plain_count: MoneyCast, is_active: 'boolean' } as const,
	};

	ref!: string;
	plain_count!: Money;
	is_active!: boolean;
}

/** Declares neither `clone` nor `equals`, so the defaults have to cover it. */
const BareBoxCast: ColumnCast<{ n: number }, string> = {
	fromDatabase: value => JSON.parse(String(value)) as { n: number },
	toDatabase: value => JSON.stringify(value),
};

class Boxed extends Model<Boxed> {
	static config = {
		table: 'casted',
		primaryKey: 'ref',
		timestamps: false,
		casts: { settings: BareBoxCast } as const,
	};

	ref!: string;
	settings!: { n: number };
}

/** The built-ins are `ColumnCast`s, so they can be named directly. */
class DirectBuiltins extends Model<DirectBuiltins> {
	static config = {
		table: 'casted',
		primaryKey: 'ref',
		timestamps: false,
		casts: { is_active: BooleanCast, due_at: DateCast } as const,
	};

	ref!: string;
	is_active!: boolean;
	due_at!: Date | null;
}

describe('custom casts', () => {
	test('round-trips a class instance the ORM knows nothing about', async () => {
		const { adapter } = await freshDatabase();

		await Priced.create({ ref: 'a', plain_count: new Money(1999) });

		const found = (await Priced.find('a'))!;
		expect(found.plain_count).toBeInstanceOf(Money);
		expect(found.plain_count.cents).toBe(1999);

		// Stored as whatever `toDatabase` returned, not as an object.
		const raw = adapter.db
			.query(`SELECT plain_count, typeof(plain_count) AS ty FROM casted`)
			.get() as { plain_count: number; ty: string };
		expect(raw.ty).toBe('integer');
		expect(raw.plain_count).toBe(1999);
	});

	test('the cast decides equality, so a distinct instance is not a change', async () => {
		await freshDatabase();
		await Priced.create({ ref: 'a', plain_count: new Money(1999) });

		const found = (await Priced.find('a'))!;
		equalsCalls = 0;

		expect(found.isDirty).toBe(false);
		expect(equalsCalls).toBeGreaterThan(0);

		// Reference equality would call this dirty; `equals` says otherwise.
		found.plain_count = new Money(1999);
		expect(found.getDirty()).not.toContain('plain_count');

		found.plain_count = new Money(500);
		expect(found.getDirty()).toContain('plain_count');
	});

	test('the cast clones for the snapshot, keeping its own type', async () => {
		await freshDatabase();
		await Priced.create({ ref: 'a', plain_count: new Money(1999) });

		cloneCalls = 0;
		const found = (await Priced.find('a'))!;
		expect(cloneCalls).toBeGreaterThan(0);

		// `structuredClone` would have stripped the prototype here; the cast's
		// own `clone` keeps `_original` holding a real Money.
		const original = (
			found as unknown as { _original: { plain_count: Money } }
		)._original.plain_count;
		expect(original).toBeInstanceOf(Money);
		expect(original.cents).toBe(1999);
	});

	test('a cast declaring neither hook still detaches and compares by value', async () => {
		await freshDatabase();
		await Boxed.create({ ref: 'a', settings: { n: 1 } });

		const found = (await Boxed.find('a'))!;
		// Default equality: two structurally identical objects are unchanged.
		expect(found.isDirty).toBe(false);

		// Default clone: `_original` is a separate object, so an in-place edit
		// of the live one is still visible.
		found.settings.n = 2;
		expect(found.getDirty()).toContain('settings');

		await found.save();
		expect((await Boxed.find('a'))!.settings).toEqual({ n: 2 });
	});

	test('a custom cast is applied on the bulk write path too', async () => {
		await freshDatabase();
		await Priced.create({ ref: 'a', plain_count: new Money(1) });

		const affected = await Priced.query()
			.where('ref', 'a')
			.update({ plain_count: new Money(2500) });

		expect(affected).toBe(1);
		expect((await Uncast.find('a'))!.plain_count).toBe(2500);
		expect((await Priced.find('a'))!.plain_count.cents).toBe(2500);
	});

	test('a custom cast coexists with a built-in shorthand', async () => {
		await freshDatabase();

		await Priced.create({
			ref: 'a',
			plain_count: new Money(700),
			is_active: true,
		});

		const found = (await Priced.find('a'))!;
		expect(found.plain_count).toBeInstanceOf(Money);
		expect(found.is_active).toBe(true);

		// Both reached the database in their stored shapes.
		const raw = (await Uncast.find('a'))!;
		expect(raw.plain_count).toBe(700);
		expect(raw.is_active).toBe(1);
	});

	test('a built-in named directly behaves like its shorthand', async () => {
		await freshDatabase();

		const due = new Date('2030-06-15T12:34:56.000Z');
		await DirectBuiltins.create({ ref: 'a', is_active: true, due_at: due });

		const found = (await DirectBuiltins.find('a'))!;
		expect(found.is_active).toBe(true);
		expect(found.due_at!.getTime()).toBe(due.getTime());

		// Identical storage to the `'boolean'`/`'date'` spellings, because the
		// shorthand resolves to these very objects.
		const raw = (await Uncast.find('a'))!;
		expect(raw.is_active).toBe(1);
		expect(raw.due_at).toBe(due.getTime() / 1000);
	});
});

/* ── resolution and caching ─────────────────────────────────────────────── */

describe('a class resolves its casts and timestamps once', () => {
	test('the same Caster and Timestamps are reused', () => {
		expect(Casted.casts).toBeInstanceOf(Caster);
		expect(Casted.timestamps).toBeInstanceOf(Timestamps);

		expect(Casted.casts).toBe(Casted.casts);
		expect(Casted.timestamps).toBe(Casted.timestamps);
	});

	test('each class gets its own, rather than sharing one', () => {
		// `Casted` and `Uncast` are the same table with different declarations,
		// so a cache keyed too loosely would hand one the other's casts.
		expect(Casted.casts).not.toBe(Uncast.casts);
		expect(Casted.timestamps).not.toBe(Passage.timestamps);
	});

	test('Timestamps reports the columns the class actually declared', () => {
		expect(Passage.timestamps.enabled).toBe(true);
		expect(Passage.timestamps.columns).toEqual({
			created_at: 'created_at',
			updated_at: 'updated_at',
		});
		expect(Passage.timestamps.owns('created_at')).toBe(true);
		expect(Passage.timestamps.owns('title')).toBe(false);

		expect(Casted.timestamps.enabled).toBe(false);
		expect(Casted.timestamps.columns).toBeNull();
		expect(Casted.timestamps.owns('created_at')).toBe(false);
	});

	test('strip() removes only the timestamp columns', () => {
		expect(
			Passage.timestamps.strip({
				title: 'x',
				created_at: 1,
				updated_at: 2,
			}),
		).toEqual({ title: 'x' });

		// Nothing is owned when timestamps are off, so nothing is removed.
		const untouched = { ref: 'a', created_at: 1 };
		expect(Casted.timestamps.strip(untouched)).toBe(untouched);
	});

	test('now() carries no milliseconds the column cannot store', () => {
		expect(Passage.timestamps.now().getMilliseconds()).toBe(0);
	});
});

describe('dialect normalises stray booleans', () => {
	test('a where() operand is bound as 0/1', async () => {
		await freshDatabase();

		await Casted.create({ ref: 'on', is_active: true, settings: null });
		await Casted.create({ ref: 'off', is_active: false, settings: null });

		// The value never passes through a model, so only the dialect can
		// catch it. Bound as the JSON text `"true"` it would match nothing.
		const active = await Casted.query().where('is_active', true).get();
		expect(active.map(c => c.ref)).toEqual(['on']);

		const inactive = await Casted.query().where('is_active', false).get();
		expect(inactive.map(c => c.ref)).toEqual(['off']);
	});

	test('compiled bindings contain no booleans', () => {
		const dialect = new SQLiteDialect();

		const compiled = dialect.compileSelect({
			table: 'casted',
			wheres: [
				{
					type: 'basic',
					column: 'is_active',
					operator: '=',
					value: true,
				},
				{
					type: 'basic',
					column: 'plain_count',
					operator: '!=',
					value: false,
				},
			],
			orders: [],
		});

		expect(compiled.bindings).toEqual([1, 0]);
	});

	test('non-boolean bindings are untouched', () => {
		const dialect = new SQLiteDialect();

		const compiled = dialect.compileSelect({
			table: 'casted',
			wheres: [
				{ type: 'basic', column: 'ref', operator: '=', value: 'a' },
				{
					type: 'basic',
					column: 'plain_count',
					operator: '=',
					value: 0,
				},
				{
					type: 'basic',
					column: 'settings',
					operator: 'IS',
					value: null,
				},
			],
			orders: [],
		});

		// `IS`/`IS NOT` inline a literal NULL and contribute no binding, so
		// only two values appear.
		expect(compiled.sql).toContain('IS NULL');
		expect(compiled.bindings).toEqual(['a', 0]);
	});
});
