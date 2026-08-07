/**
 * Type-level tests.
 *
 * Nothing here runs; it is checked by `bun run check`, and a regression shows
 * up as a compile error. A library whose selling point is type safety cannot
 * protect its types with runtime tests alone.
 *
 * Assertions are written as call expressions inside functions rather than with
 * `ReturnType<>`, so they resolve the same way real user code does.
 *
 * A `@ts-expect-error` is itself an assertion: if the call it guards stops
 * being an error, the compiler reports the directive as unused and this file
 * fails. Deleting one silently weakens the suite, so they are load-bearing.
 */

import { QueryBuilder } from '../src/query-builder';
import type { ColumnKeys, Patch } from '../src/columns';

import { HasMany } from '../src/relationships/hasMany';

import { Category, Line, Passage, Route, Settable } from './helpers/models';

/* ── assertion helpers ──────────────────────────────────────────────────── */

type Equal<X, Y> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
		? true
		: false;

/**
 * Compile-time assertion. Erased entirely — `declare` emits nothing and the
 * call is never executed. Written as a call rather than an unused `type`
 * alias so the file passes `noUnusedLocals` like the rest of the codebase.
 */
declare function expectType<_T extends true>(): void;

/** Passage's declared relationship registry. */
type PassageRelations = typeof Passage.relationships;

/* ── The static entry points resolve to the concrete subclass ───────────── */

export async function _staticSurfaceIsTyped() {
	const found = await Passage.find('intro');
	const everything = await Passage.all();
	const created = await Passage.create({ ref: 'x' });
	const rows = await Passage.query().get();

	// A polymorphic `this` parameter binds T to the subclass, so these no
	// longer erase to `any` — with no change at the call site.
	expectType<Equal<typeof found, Passage | null>>();
	expectType<Equal<typeof everything, Passage[]>>();
	expectType<Equal<typeof created, Passage>>();
	expectType<Equal<typeof rows, Passage[]>>();

	// Nullability is now surfaced rather than swallowed.
	// @ts-expect-error - 'found' is possibly 'null'.
	found.title;

	// @ts-expect-error - 'thisFieldDoesNotExist' does not exist on Passage.
	found!.thisFieldDoesNotExist;
	// @ts-expect-error - 'alsoNotAField' does not exist on Passage.
	created.alsoNotAField;

	// And traversing a relation keeps its type, so callbacks are contextually
	// typed instead of raising an implicit-any error in strict consumers.
	const [first] = await Passage.query().with('lines').get();
	first!.lines.map(l => l.ref);
	// @ts-expect-error - 'nope' does not exist on Line.
	first!.lines.map(l => l.nope);
}

/* ── Statics are inherited correctly by each subclass ───────────────────── */

export async function _staticsBindToTheCallingSubclass() {
	// Each call binds T independently; no leakage between models.
	const passage = await Passage.find('intro');
	const line = await Line.find('intro/a');

	expectType<Equal<typeof passage, Passage | null>>();
	expectType<Equal<typeof line, Line | null>>();

	// @ts-expect-error - a Line is not a Passage.
	const wrong: Passage | null = line;
}

/* ── The full read surface, straight off the class ──────────────────────── */

export async function _readSurfaceIsTyped() {
	// Direct statics — no facade.
	const repo = Passage;

	const found = await repo.find('intro');
	expectType<Equal<typeof found, Passage | null>>();

	const everything = await repo.all();
	expectType<Equal<typeof everything, Passage[]>>();

	const builder = repo.query();
	// The builder now also carries the model's relation registry, so `with()`
	// is checked here too.
	expectType<
		Equal<typeof builder, QueryBuilder<Passage, PassageRelations>>
	>();

	const rows = await repo.query().where('status', 'draft').get();
	expectType<Equal<typeof rows, Passage[]>>();

	const single = await repo.query().first();
	expectType<Equal<typeof single, Passage | null>>();

	const page = await repo.query().paginate(1, 10);
	expectType<Equal<typeof page, { data: Passage[]; total: number }>>();

	// The statics carry full type information, so no repository indirection
	// is needed to recover it.
	everything.map(p => p.ref);
	// @ts-expect-error - 'nope' does not exist on Passage.
	everything.map(p => p.nope);
}

/* ── Chaining preserves the builder type ────────────────────────────────── */

export function _builderChainingIsTyped() {
	const q = Passage.query();
	type Q = QueryBuilder<Passage, PassageRelations>;

	expectType<Equal<ReturnType<typeof q.where>, Q>>();
	expectType<Equal<ReturnType<typeof q.orderBy>, Q>>();
	expectType<Equal<ReturnType<typeof q.limit>, Q>>();
	expectType<Equal<ReturnType<typeof q.with>, Q>>();
}

/* ── with() is checked against the model's relationship literal ─────────── */

export function _relationPathsAreChecked() {
	const q = Passage.query();

	// Top-level relation names.
	q.with('lines', 'choices');

	// Nested dotted paths, walked through each relation's related class.
	q.with('lines.routes', 'lines.routes.conditions');
	q.with(
		'choices.conditions',
		'choices.effects',
		'choices.routes.conditions',
	);

	// A parent path requested alongside its own nested paths.
	q.with(
		'lines',
		'lines.routes.conditions',
		'choices.conditions',
		'choices.effects',
		'choices.routes.conditions',
	);

	// @ts-expect-error - 'linez' is not a relation of Passage.
	q.with('linez');
	// @ts-expect-error - 'routez' is not a relation of Line.
	q.with('lines.routez');
	// @ts-expect-error - 'conditionz' is not a relation of Route.
	q.with('lines.routes.conditionz');
	// @ts-expect-error - Condition declares no relations, so it has no paths.
	q.with('lines.routes.conditions.anything');

	// The full valid set is derived, not hand-maintained.
	type PassagePaths = Parameters<typeof q.with>[number];
	expectType<
		Equal<
			PassagePaths,
			| 'lines'
			| 'choices'
			| 'lines.routes'
			| 'lines.routes.conditions'
			| 'choices.conditions'
			| 'choices.effects'
			| 'choices.routes'
			| 'choices.routes.conditions'
		>
	>();
}

export function _untypedModelsStillAcceptAnyString() {
	// Category never declares a `relationships` literal, so its registry is an
	// index signature and stays permissive rather than becoming uncallable.
	Category.query().with('whatever', 'nested.path');
}

/* ── Operators and columns are checked against the model ────────────────── */

export function _queryIdentifiersAreChecked() {
	const q = Passage.query();

	q.where('status', 'draft');
	q.where('sort', '>', 1);
	q.whereIn('ref', ['intro', 'hall']);
	q.orderBy('sort', 'desc');
	q.select('ref', 'title');

	// Splitting `where` into two overloads means the operator is a real union
	// again, instead of being absorbed into `string`.
	// @ts-expect-error - '>>>' is not a WhereOperator.
	q.where('sort', '>>>', 1);

	// @ts-expect-error - 'not_a_column' is not a column of Passage.
	q.whereIn('not_a_column', [1]);
	// @ts-expect-error - 'also_not_a_column' is not a column of Passage.
	q.select('also_not_a_column');
	// @ts-expect-error - 'nope' is not a column of Passage.
	q.orderBy('nope');
	// @ts-expect-error - 'raw' is reserved for orderByRaw().
	q.orderBy('sort', 'raw');

	// The two-argument form checks the value against the column's own type.
	// @ts-expect-error - 'sort' is a number.
	q.where('sort', 'not-a-number');
	// @ts-expect-error - whereIn values follow the column type too.
	q.whereIn('sort', ['a']);

	// …and so does the three-argument form.
	// @ts-expect-error - 'sort' is a number.
	q.where('sort', '>', 'not-a-number');
	// @ts-expect-error - 'ref' is a string.
	q.where('ref', '>', 12345);

	// The operator decides the shape, not just the type.
	q.where('ref', 'IN', ['intro', 'hall']);
	q.where('title', 'IS', null);
	q.where('title', 'LIKE', '%intro%');

	// @ts-expect-error - IN over a string column needs string values.
	q.where('ref', 'IN', [1, 2]);
	// @ts-expect-error - IN takes a list, not a single value.
	q.where('ref', 'IN', 'intro');
	// @ts-expect-error - IS only ever compares against null.
	q.where('title', 'IS', 'intro');

	// A relation is not a column, however it is spelled.
	// @ts-expect-error - 'lines' is a relation of Passage.
	q.where('lines', 1);
}

export function _qualifiedColumnsSurviveForJoins() {
	// A join compares against a table the model type knows nothing about, so
	// `table.column` stays open and is validated at runtime instead.
	Passage.query()
		.innerJoin('lines', 'lines.passage_ref', '=', 'passages.ref')
		.where('lines.kind', 'say')
		.select('passages.ref', 'lines.text')
		.orderBy('lines.sort');
}

/* ── Instance surface ───────────────────────────────────────────────────── */

export async function _instanceSurfaceIsTyped() {
	const line = (await Line.find('intro/a'))!;

	const saved = await line.save();
	expectType<Equal<typeof saved, Line>>();

	const deleted = await line.delete();
	expectType<Equal<typeof deleted, boolean>>();

	expectType<Equal<typeof line.isDirty, boolean>>();
	expectType<Equal<ReturnType<typeof line.getDirty>, string[]>>();
	expectType<Equal<typeof line.createdAt, Date | null>>();

	// Declared columns and relations keep the types the model author wrote.
	expectType<Equal<typeof line.text, string | null>>();
	expectType<Equal<typeof line.routes, Route[]>>();

	// @ts-expect-error - 'nope' does not exist on Line.
	line.nope;
}

/* ── Columns are derived from the class, not from a hand-written list ───── */

export function _columnsAreDerived() {
	expectType<
		Equal<
			ColumnKeys<Line>,
			| 'ref'
			| 'passage_ref'
			| 'sort'
			| 'kind'
			| 'text'
			| 'character_ref'
			| 'asset_ref'
			| 'position'
			| 'volume'
			| 'return_to_caller'
		>
	>();

	// Column types survive.
	expectType<
		Equal<Patch<Line>['character_ref'], string | null | undefined>
	>();

	// Computed properties are `readonly` in the type system, which is what
	// separates them from columns — no list required.
	expectType<'summary' extends ColumnKeys<Line> ? false : true>();
	expectType<'isReturnToCaller' extends ColumnKeys<Line> ? false : true>();

	// Relations are model-typed, so they are not columns either.
	expectType<'routes' extends ColumnKeys<Line> ? false : true>();

	// Nor is anything Model itself contributes.
	expectType<'save' extends ColumnKeys<Line> ? false : true>();
	expectType<'isDirty' extends ColumnKeys<Line> ? false : true>();
	expectType<'relationships' extends ColumnKeys<Line> ? false : true>();

	// An accessor with a setter is writable, so it *is* a column.
	expectType<'label' extends ColumnKeys<Settable> ? true : false>();
}

/* ── fill() / create() / update() accept exactly the columns ────────────── */

export async function _writeSurfacesAreTyped() {
	const line = (await Line.find('intro/a'))!;

	line.fill({ text: 'hi', volume: 0.5 });
	await Line.create({ ref: 'intro/b', passage_ref: 'intro', kind: 'say' });
	await Line.query().where('ref', 'intro/a').update({ text: 'patched' });

	// @ts-expect-error - computed property, not a column.
	line.fill({ isReturnToCaller: true });
	// @ts-expect-error - computed property, not a column.
	line.fill({ summary: 'x' });
	// @ts-expect-error - relation, not a column.
	line.fill({ routes: [] });
	// @ts-expect-error - not a column at all.
	line.fill({ nope: 1 });
	// @ts-expect-error - inherited method.
	line.fill({ save: null });
	// @ts-expect-error - wrong type for a real column.
	line.fill({ text: 12345 });

	// @ts-expect-error - create() is checked the same way.
	await Line.create({ summary: 'x' });
	// @ts-expect-error - and so is the bulk update.
	await Line.query().update({ isReturnToCaller: true });

	// `NoInfer` keeps `data` from widening T: without it the mapped type is a
	// second inference site and `create` degrades to accepting anything.
	const created = await Line.create({ ref: 'x' });
	expectType<Equal<typeof created, Line>>();
}

/* ── The relationship registry: names survive, related types do not ─────── */

export function _relationshipRegistry() {
	// Because models declare `static readonly relationships = { ... }` as a
	// typed object literal, it SHADOWS the base class's
	// `Record<string, any>` getter — so the relation names are already
	// recoverable from the type system today.
	type PassageRelations = keyof typeof Passage.relationships;
	expectType<Equal<PassageRelations, 'lines' | 'choices'>>();

	// The related model type survives too: the relationship's second type
	// parameter carries the related class, which nested `with()` paths walk
	// into.
	type LinesRelation = (typeof Passage.relationships)['lines'];
	expectType<Equal<LinesRelation, HasMany<Line, typeof Line>>>();

	// Which means the loaded shape is recoverable from the registry alone.
	expectType<Equal<ReturnType<LinesRelation['get']>, Promise<Line[]>>>();
}

export type {};
