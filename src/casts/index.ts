/** Conversion between a column's stored shape and its logical one. */

import type { DatabaseRow } from '../types';
import BooleanCast from './boolean';
import DateCast from './date';
import JsonCast from './json';

export type CastType = 'boolean' | 'json' | 'date';

export interface ColumnCast<TLogical = any, TStored = any> {
	fromDatabase(value: TStored, column: string): TLogical;
	toDatabase(value: TLogical, column: string): TStored;
	/** Clone for the dirty-tracking snapshot. */
	clone?(value: TLogical): TLogical;
	equals?(a: TLogical, b: TLogical): boolean;
}

export const BUILTIN_CASTS: Record<CastType, ColumnCast> = {
	boolean: BooleanCast,
	json: JsonCast,
	date: DateCast,
};

export class Caster {
	constructor(private readonly casts: Record<string, ColumnCast>) {}

	/** Row as the adapter returned it -> attributes in their logical shape. */
	fromDatabaseRow(row: DatabaseRow): DatabaseRow {
		const out: DatabaseRow = { ...row };
		for (const [column, cast] of Object.entries(this.casts)) {
			if (!(column in out)) continue;
			const value = out[column];
			if (value === null || value === undefined) continue;
			out[column] = cast.fromDatabase(value, column);
		}
		return out;
	}

	/** Attributes -> values a statement can bind. */
	toDatabaseValues(values: DatabaseRow): DatabaseRow {
		const out: DatabaseRow = { ...values };
		for (const [column, cast] of Object.entries(this.casts)) {
			if (!(column in out)) continue;
			const value = out[column];
			if (value === null || value === undefined) continue;
			out[column] = cast.toDatabase(value, column);
		}
		return out;
	}

	/**
	 * A snapshot for `_original`. Object values are cloned, so an in-place edit
	 * of the live attribute does not also mutate what it is compared against.
	 */
	snapshot(attributes: DatabaseRow): DatabaseRow {
		const out: DatabaseRow = { ...attributes };
		for (const [column, cast] of Object.entries(this.casts)) {
			if (!(column in out)) continue;
			const value = out[column];
			if (value === null || typeof value !== 'object') continue;
			out[column] = cast.clone
				? cast.clone(value)
				: structuredClone(value);
		}
		return out;
	}

	/**
	 * Whether a column changed. Object values compare by value, since
	 * `snapshot` gave them a separate instance.
	 */
	changed(column: string, current: unknown, original: unknown): boolean {
		const cast = this.casts[column];
		if (!cast || current === null || typeof current !== 'object') {
			return current !== original;
		}
		return cast.equals
			? !cast.equals(current, original)
			: JSON.stringify(current) !== JSON.stringify(original);
	}
}

export { BooleanCast, DateCast, JsonCast };
