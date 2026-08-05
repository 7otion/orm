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
 * Blocks marked `CURRENT:` pin behaviour that is expected to change. They
 * should be rewritten, not deleted, as the typing work lands.
 */

import { Model } from '../src/model';
import { QueryBuilder } from '../src/query-builder';

import { HasMany } from '../src/relationships/hasMany';

import { Category, Line, Passage, Route } from './helpers/models';

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
	// index signature. Such models keep the old permissive behaviour rather
	// than becoming uncallable.
	Category.query().with('whatever', 'nested.path');
}

/* ── CURRENT: operators and columns are still unchecked strings ─────────── */

export function _stringlyTypedSurfaces() {
	const q = Passage.query();

	// `WhereOperator | QueryValue` collapses to a plain string union, so a
	// nonsense operator compiles. Target: reject this.
	q.where('sort', '>>>', 1);

	// `whereIn`/`select` are declared `keyof T | string`, which absorbs to
	// `string` — the `keyof T` half contributes nothing.
	q.whereIn('not_a_column', [1]);
	q.select('also_not_a_column');
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

/* ── `keyof Model<T>` is part of the public contract ───────────────────── */

// Consumers derive "editable columns" types by subtracting Model's own
// members, so Model's *public member set* is load-bearing: adding a public
// member to Model silently changes what downstream code treats as editable.
type EditableLineFields = Partial<
	Omit<
		Line,
		| keyof Model<Line>
		| 'summary'
		| 'ref'
		| 'passage_ref'
		| 'sort'
		| 'kind'
		| 'routes'
	>
>;

expectType<'save' extends keyof EditableLineFields ? false : true>();
expectType<'summary' extends keyof EditableLineFields ? false : true>();
expectType<'text' extends keyof EditableLineFields ? true : false>();
expectType<
	Equal<EditableLineFields['character_ref'], string | null | undefined>
>();

/* ── The relationship registry: names survive, related types do not ─────── */

export function _relationshipRegistry() {
	// Because models declare `static readonly relationships = { ... }` as a
	// typed object literal, it SHADOWS the base class's
	// `Record<string, any>` getter — so the relation names are already
	// recoverable from the type system today.
	type PassageRelations = keyof typeof Passage.relationships;
	expectType<Equal<PassageRelations, 'lines' | 'choices'>>();

	// …and now the related model type survives too. The factories used to
	// declare `related: any`, which degraded this to `HasMany<Model<unknown>>`
	// and discarded the one piece of information `with()` needs.
	// The second parameter carries the related class, which nested `with()`
	// paths walk into.
	type LinesRelation = (typeof Passage.relationships)['lines'];
	expectType<Equal<LinesRelation, HasMany<Line, typeof Line>>>();

	// Which means the loaded shape is recoverable from the registry alone.
	expectType<Equal<ReturnType<LinesRelation['get']>, Promise<Line[]>>>();
}

export type {};
