/**
 * Derives a model's column set from the class declaration itself.
 *
 * A model already states its columns as field declarations:
 *
 * ```ts
 * class Line extends Model<Line> {
 *   ref!: string;
 *   text!: string | null;
 *   routes!: Route[];          // relation, not a column
 *   get summary(): string { … } // computed, not a column
 * }
 * ```
 *
 * Everything bulk assignment needs is already there, so nothing here asks the
 * author to repeat it in a second list. `fillable`/`guarded` stay as *runtime*
 * guards for untrusted input, where types have already been erased.
 */
import type { Model } from './model';
import type { WhereValue } from './types';
/**
 * Identical-type test, sensitive to modifiers.
 *
 * Two conditional types are mutually assignable only when their checked types
 * are identical, which — unlike `extends` — makes `readonly` observable.
 */
type IfEquals<X, Y, A, B> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;
/**
 * Keys that are assignable, i.e. not `readonly`.
 *
 * This is what separates a column from a computed property: TypeScript models
 * a get-only accessor as `readonly`, so `get summary()` is dropped while a
 * plain `text!: string | null` is kept. An accessor *with* a setter stays,
 * which is correct — it is writable.
 */
type WritableKeys<T> = {
    [K in keyof T]-?: IfEquals<{
        [Q in K]: T[K];
    }, {
        -readonly [Q in K]: T[K];
    }, K, never>;
}[keyof T];
/**
 * Relations are model-typed; columns are scalars.
 *
 * Matched on `Model`'s phantom marker rather than on `Model<any>` itself: a
 * full structural comparison would include `fill`, whose parameter type comes
 * from `ColumnKeys`, and any two models that reference each other would make
 * that circular.
 */
type ModelMarker = {
    readonly __model: true;
};
type IsRelationValue<V> = [NonNullable<V>] extends [ModelMarker] ? true : [NonNullable<V>] extends [readonly ModelMarker[]] ? true : false;
/**
 * The column names of a model.
 *
 * Excluded: computed properties (`readonly`), relations (model-typed), methods,
 * every member `Model` itself contributes, and ORM-internal `_` keys.
 *
 * A model with an index signature degrades to `string`, so loosely typed models
 * keep working rather than becoming unwritable — the same concession
 * `RelationPath` makes.
 */
export type ColumnKeys<T> = Exclude<{
    [K in WritableKeys<T>]: T[K] extends (...args: any[]) => any ? never : IsRelationValue<T[K]> extends true ? never : K;
}[WritableKeys<T>], keyof Model<any> | `_${string}`> & string;
/** A model's columns, as a plain object type. */
export type Columns<T> = {
    [K in ColumnKeys<T>]: T[K];
};
/**
 * A partial column set — the shape `fill`, `create` and `update` accept.
 *
 * Every column is optional: the database supplies defaults, autoincrement keys
 * and timestamps, so requiring them would reject correct calls.
 */
export type Patch<T> = Partial<Columns<T>>;
/**
 * A `table.column` reference.
 *
 * Joins compare against tables the model type knows nothing about, so these
 * cannot be checked statically. They stay identifier-validated at runtime.
 */
type QualifiedColumn = `${string}.${string}`;
/** A column of `T`, or a qualified reference to another table's column. */
export type ColumnRef<T> = ColumnKeys<T> | QualifiedColumn;
/**
 * The value a comparison against `K` accepts.
 *
 * A known column narrows to its declared type, so `where('sort', 'abc')` is an
 * error; a qualified reference falls back to any bindable value.
 */
export type ValueFor<T, K> = K extends ColumnKeys<T> ? T[K] : WhereValue;
/**
 * The value a comparison against `K` accepts under a given operator.
 *
 * The operator changes the shape, not just the type: `IN` takes a list of what
 * the column holds, `IS`/`IS NOT` only ever compare against null, and every
 * other operator takes a single value of the column's own type.
 */
export type ValueForOperator<T, K, Op> = Op extends 'IN' | 'NOT IN' ? ValueFor<T, K>[] : Op extends 'IS' | 'IS NOT' ? null : ValueFor<T, K>;
export {};
//# sourceMappingURL=columns.d.ts.map