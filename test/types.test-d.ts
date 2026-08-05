/**
 * Type-level tests.
 *
 * Nothing here runs; it is checked by `bun run typecheck:test`, and a
 * regression shows up as a compile error. A library whose selling point is
 * type safety cannot protect its types with runtime tests alone.
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

type Expect<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

/** Passage's declared relationship registry. */
type PassageRelations = typeof Passage.relationships;

/* ── The static entry points resolve to the concrete subclass ───────────── */

async function _staticSurfaceIsTyped() {
	const found = await Passage.find('intro');
	const everything = await Passage.all();
	const created = await Passage.create({ ref: 'x' });
	const rows = await Passage.query().get();

	// A polymorphic `this` parameter binds T to the subclass, so these no
	// longer erase to `any` — with no change at the call site.
	type _Find = Expect<Equal<typeof found, Passage | null>>;
	type _All = Expect<Equal<typeof everything, Passage[]>>;
	type _Create = Expect<Equal<typeof created, Passage>>;
	type _Get = Expect<Equal<typeof rows, Passage[]>>;

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

async function _staticsBindToTheCallingSubclass() {
	// Each call binds T independently; no leakage between models.
	const passage = await Passage.find('intro');
	const line = await Line.find('intro/a');

	type _Passage = Expect<Equal<typeof passage, Passage | null>>;
	type _Line = Expect<Equal<typeof line, Line | null>>;

	// @ts-expect-error - a Line is not a Passage.
	const wrong: Passage | null = line;
}

/* ── The full read surface, straight off the class ──────────────────────── */

async function _readSurfaceIsTyped() {
	// Direct statics — no facade.
	const repo = Passage;

	const found = await repo.find('intro');
	type _Find = Expect<Equal<typeof found, Passage | null>>;

	const everything = await repo.all();
	type _All = Expect<Equal<typeof everything, Passage[]>>;

	const builder = repo.query();
	// The builder now also carries the model's relation registry, so `with()`
	// is checked here too.
	type _Query = Expect<
		Equal<typeof builder, QueryBuilder<Passage, PassageRelations>>
	>;

	const rows = await repo.query().where('status', 'draft').get();
	type _Get = Expect<Equal<typeof rows, Passage[]>>;

	const single = await repo.query().first();
	type _First = Expect<Equal<typeof single, Passage | null>>;

	const page = await repo.query().paginate(1, 10);
	type _Paginate = Expect<
		Equal<typeof page, { data: Passage[]; total: number }>
	>;

	// The statics carry full type information, so no repository indirection
	// is needed to recover it.
	everything.map(p => p.ref);
	// @ts-expect-error - 'nope' does not exist on Passage.
	everything.map(p => p.nope);
}

/* ── Chaining preserves the builder type ────────────────────────────────── */

function _builderChainingIsTyped() {
	const q = Passage.query();
	type Q = QueryBuilder<Passage, PassageRelations>;

	type _Where = Expect<Equal<ReturnType<typeof q.where>, Q>>;
	type _OrderBy = Expect<Equal<ReturnType<typeof q.orderBy>, Q>>;
	type _Limit = Expect<Equal<ReturnType<typeof q.limit>, Q>>;
	type _With = Expect<Equal<ReturnType<typeof q.with>, Q>>;
}

/* ── with() is checked against the model's relationship literal ─────────── */

function _relationPathsAreChecked() {
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
	type _Paths = Expect<
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
	>;
}

function _untypedModelsStillAcceptAnyString() {
	// Category never declares a `relationships` literal, so its registry is an
	// index signature. Such models keep the old permissive behaviour rather
	// than becoming uncallable.
	Category.query().with('whatever', 'nested.path');
}

/* ── CURRENT: operators and columns are still unchecked strings ─────────── */

function _stringlyTypedSurfaces() {
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

async function _instanceSurfaceIsTyped() {
	const line = (await Line.find('intro/a'))!;

	const saved = await line.save();
	type _Save = Expect<Equal<typeof saved, Line>>;

	const deleted = await line.delete();
	type _Delete = Expect<Equal<typeof deleted, boolean>>;

	type _IsDirty = Expect<Equal<typeof line.isDirty, boolean>>;
	type _GetDirty = Expect<Equal<ReturnType<typeof line.getDirty>, string[]>>;
	type _CreatedAt = Expect<Equal<typeof line.createdAt, Date | null>>;

	// Declared columns and relations keep the types the model author wrote.
	type _Column = Expect<Equal<typeof line.text, string | null>>;
	type _Relation = Expect<Equal<typeof line.routes, Route[]>>;

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

type _ExcludesOrmMembers = Expect<
	'save' extends keyof EditableLineFields ? false : true
>;
type _ExcludesGetters = Expect<
	'summary' extends keyof EditableLineFields ? false : true
>;
type _KeepsPlainColumns = Expect<
	'text' extends keyof EditableLineFields ? true : false
>;
type _KeepsNullableColumns = Expect<
	Equal<EditableLineFields['character_ref'], string | null | undefined>
>;

/* ── The relationship registry: names survive, related types do not ─────── */

function _relationshipRegistry() {
	// Because models declare `static readonly relationships = { ... }` as a
	// typed object literal, it SHADOWS the base class's
	// `Record<string, any>` getter — so the relation names are already
	// recoverable from the type system today.
	type PassageRelations = keyof typeof Passage.relationships;
	type _NamesAreKnown = Expect<Equal<PassageRelations, 'lines' | 'choices'>>;

	// …and now the related model type survives too. The factories used to
	// declare `related: any`, which degraded this to `HasMany<Model<unknown>>`
	// and discarded the one piece of information `with()` needs.
	// The second parameter carries the related *class*, which is what lets
	// nested `with()` paths walk from `lines` into Line's own relations.
	type LinesRelation = (typeof Passage.relationships)['lines'];
	type _RelatedTypeSurvives = Expect<
		Equal<LinesRelation, HasMany<Line, typeof Line>>
	>;

	// Which means the loaded shape is recoverable from the registry alone.
	type _RelatedModel = Expect<
		Equal<ReturnType<LinesRelation['get']>, Promise<Line[]>>
	>;
}

export type {};
