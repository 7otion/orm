/**
 * Compiles QueryStructure objects into database-specific SQL. Dialects never
 * execute SQL and know nothing about models or connections.
 */

import type {
	AggregateFunction,
	CompiledQuery,
	QueryStructure,
	QueryValue,
} from './types';

export interface SqlDialect {
	compileSelect(query: QueryStructure): CompiledQuery;

	compileInsert(
		table: string,
		data: Record<string, QueryValue>,
	): CompiledQuery;

	/** Every row must carry the same columns; the caller chunks to the limit. */
	compileInsertMany(
		table: string,
		rows: Record<string, QueryValue>[],
	): CompiledQuery;

	/**
	 * Each row supplies its own values, matched on `keyColumns`. `set` holds
	 * columns taking one value across every row.
	 */
	compileUpdateMany(
		table: string,
		rows: Record<string, QueryValue>[],
		keyColumns: string[],
		set: Record<string, QueryValue>,
	): CompiledQuery;

	/** Bound parameters one statement may carry. Unset means no limit. */
	readonly maxBindParameters?: number;

	compileUpdate(
		table: string,
		data: Record<string, QueryValue>,
		primaryKey: string | string[],
		id: QueryValue | QueryValue[],
	): CompiledQuery;

	/** Single-row delete by primary key, used by `model.delete()`. */
	compileDelete(
		table: string,
		primaryKey: string | string[],
		id: QueryValue | QueryValue[],
	): CompiledQuery;

	/**
	 * For `QueryBuilder.delete()`. Must support everything compileSelect does.
	 * Only needed if consumers use the builder's `.delete()`.
	 */
	compileDeleteQuery(query: QueryStructure): CompiledQuery;

	/**
	 * For `QueryBuilder.update()`. Unlike compileDeleteQuery it need not handle
	 * joins, which SQLite's UPDATE does not support.
	 */
	compileUpdateQuery(
		query: QueryStructure,
		data: Record<string, QueryValue>,
	): CompiledQuery;

	compileCount(query: QueryStructure): CompiledQuery;

	/**
	 * One aggregate over one column, returned as `aggregate`. Optional: a
	 * dialect without it reports so when `sum`/`avg`/`min`/`max` is called.
	 * Limit, offset and order do not apply, as they do not for `compileCount`.
	 */
	compileAggregate?(
		query: QueryStructure,
		fn: AggregateFunction,
		column: string,
	): CompiledQuery;
}
