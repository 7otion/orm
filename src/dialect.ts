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

	/**
	 * Every row carries the same columns; the caller chunks to the limit. With
	 * `returning`, yields one row per insert holding `rowid` and those columns.
	 */
	compileInsertMany(
		table: string,
		rows: Record<string, QueryValue>[],
		returning?: string[],
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

	/** For `QueryBuilder.delete()`; must support everything `compileSelect` does. */
	compileDeleteQuery(query: QueryStructure): CompiledQuery;

	/** For `QueryBuilder.update()`; joins need not be handled. */
	compileUpdateQuery(
		query: QueryStructure,
		data: Record<string, QueryValue>,
	): CompiledQuery;

	compileCount(query: QueryStructure): CompiledQuery;

	/**
	 * One aggregate over one column, returned as `aggregate`; limit, offset and
	 * order do not apply. Optional.
	 */
	compileAggregate?(
		query: QueryStructure,
		fn: AggregateFunction,
		column: string,
	): CompiledQuery;
}
