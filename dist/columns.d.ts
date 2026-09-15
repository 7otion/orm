/** Derives a model's column set from its field declarations. */
import type { Model } from './model';
import type { WhereValue } from './types';
/** Identical-type test; unlike `extends`, it observes `readonly`. */
type IfEquals<X, Y, A, B> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;
/**
 * Keys that are not `readonly`. A get-only accessor is readonly, so computed
 * properties drop out; an accessor with a setter stays.
 */
type WritableKeys<T> = {
    [K in keyof T]-?: IfEquals<{
        [Q in K]: T[K];
    }, {
        -readonly [Q in K]: T[K];
    }, K, never>;
}[keyof T];
/**
 * Matched on `Model`'s phantom marker; a structural check against `Model<any>`
 * is circular through `fill`.
 */
type ModelMarker = {
    readonly __model: true;
};
type IsRelationValue<V> = [NonNullable<V>] extends [ModelMarker] ? true : [NonNullable<V>] extends [readonly ModelMarker[]] ? true : false;
/**
 * A model's column names: writable, scalar, not `Model`'s own, not `_`-prefixed.
 * An index signature degrades it to `string`.
 */
export type ColumnKeys<T> = Exclude<{
    [K in WritableKeys<T>]: T[K] extends (...args: any[]) => any ? never : IsRelationValue<T[K]> extends true ? never : K;
}[WritableKeys<T>], keyof Model<any> | `_${string}`> & string;
/** Relations holding many rows; to-one relations have no set to write. */
export type ToManyRelationKeys<T> = Exclude<{
    [K in keyof T]-?: [NonNullable<T[K]>] extends [readonly ModelMarker[]] ? K : never;
}[keyof T], keyof Model<any> | `_${string}`> & string;
/** The model on the far side of a to-many relation. */
export type RelatedModel<T, K extends keyof T> = NonNullable<T[K]> extends readonly (infer M)[] ? M : never;
/** A model's columns, as a plain object type. */
export type Columns<T> = {
    [K in ColumnKeys<T>]: T[K];
};
/** A partial column set, the shape `fill`, `create` and `update` accept. */
export type Patch<T> = Partial<Columns<T>>;
/** A `table.column` reference, checked only at runtime. */
type QualifiedColumn = `${string}.${string}`;
/** A column of `T`, or a qualified reference to another table's column. */
export type ColumnRef<T> = ColumnKeys<T> | QualifiedColumn;
/**
 * The value a comparison against `K` accepts: a known column's declared type,
 * or any bindable value for a qualified reference.
 */
export type ValueFor<T, K> = K extends ColumnKeys<T> ? T[K] : WhereValue;
/**
 * `IN` and `NOT IN` take a list of the column's type, `IS` and `IS NOT` only
 * `null`, every other operator a single value.
 */
export type ValueForOperator<T, K, Op> = Op extends 'IN' | 'NOT IN' ? ValueFor<T, K>[] : Op extends 'IS' | 'IS NOT' ? null : ValueFor<T, K>;
export {};
//# sourceMappingURL=columns.d.ts.map