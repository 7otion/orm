/** Conversion between a column's stored shape and its logical one. */
import type { DatabaseRow } from '../types';
import BooleanCast from './boolean';
import DateCast from './date';
import EmptyToNullCast from './empty-to-null';
import JsonCast from './json';
export type CastType = 'boolean' | 'json' | 'date' | 'emptyToNull';
export interface ColumnCast<TLogical = any, TStored = any> {
    fromDatabase(value: TStored, column: string): TLogical;
    toDatabase(value: TLogical, column: string): TStored;
    /** Clone for the dirty-tracking snapshot. */
    clone?(value: TLogical): TLogical;
    equals?(a: TLogical, b: TLogical): boolean;
}
export declare const BUILTIN_CASTS: Record<CastType, ColumnCast>;
export declare class Caster {
    private readonly casts;
    constructor(casts: Record<string, ColumnCast>);
    /** Row as the adapter returned it -> attributes in their logical shape. */
    fromDatabaseRow(row: DatabaseRow): DatabaseRow;
    /** Attributes -> values a statement can bind. */
    toDatabaseValues(values: DatabaseRow): DatabaseRow;
    /** One value in its stored shape. Uncast columns and nullish values pass through. */
    toStored(column: string, value: unknown): unknown;
    /** A snapshot for `_original`; object values are cloned. */
    snapshot(attributes: DatabaseRow): DatabaseRow;
    /** Whether a column changed; object values compare by value. */
    changed(column: string, current: unknown, original: unknown): boolean;
}
export { BooleanCast, DateCast, EmptyToNullCast, JsonCast };
//# sourceMappingURL=index.d.ts.map