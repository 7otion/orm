import type { SqlDialect } from '../../dialect';
import type {
	AggregateFunction,
	CompiledQuery,
	OrderByClause,
	QueryStructure,
	QueryValue,
	WhereCondition,
} from '../../types';

export class SQLiteDialect implements SqlDialect {
	/**
	 * SQLite has no boolean type, and a driver handed a raw `true` will not
	 * necessarily store 0/1 — tauri-plugin-sql, for one, binds it as the JSON
	 * text `"true"`, which no `= 1` comparison ever matches. The last step
	 * before the driver, so it also covers raw bindings, which carry no column
	 * name for a cast to key off.
	 */
	private compiled(sql: string, bindings: QueryValue[]): CompiledQuery {
		return {
			sql,
			bindings: bindings.map(value =>
				typeof value === 'boolean' ? (value ? 1 : 0) : value,
			),
		};
	}
	compileSelect(query: QueryStructure): CompiledQuery {
		const bindings: QueryValue[] = [];
		let sql = 'SELECT ';

		if (query.selectRaw) {
			sql += query.selectRaw;
		} else if (query.columns && query.columns.length > 0) {
			sql += query.columns
				.map(column => this.escapeIdentifier(column))
				.join(', ');
		} else {
			sql += '*';
		}

		sql += ` FROM ${this.escapeIdentifier(query.table)}`;

		sql += this.compileJoins(query);

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		if (query.groups && query.groups.length > 0) {
			const groupClauses = query.groups.map(column =>
				this.escapeIdentifier(column),
			);
			sql += ` GROUP BY ${groupClauses.join(', ')}`;
		}

		if (query.havings && query.havings.length > 0) {
			sql += ` HAVING ${this.compileWheres(query.havings, bindings)}`;
		}

		sql += this.compileOrders(query.orders);
		sql += this.compileLimit(query, bindings);

		return this.compiled(sql, bindings);
	}

	private compileJoins(query: QueryStructure): string {
		if (!query.joins || query.joins.length === 0) return '';

		return query.joins
			.map(
				join =>
					` ${join.type} JOIN ${this.escapeIdentifier(join.table)} ON ` +
					`${this.escapeIdentifier(join.first)} ${join.operator} ${this.escapeIdentifier(join.second)}`,
			)
			.join('');
	}

	private compileOrders(orders: OrderByClause[]): string {
		if (orders.length === 0) return '';

		const clauses = orders.map(order =>
			order.direction === 'raw'
				? order.column
				: `${this.escapeIdentifier(order.column)} ${order.direction.toUpperCase()}`,
		);

		return ` ORDER BY ${clauses.join(', ')}`;
	}

	/** SQLite's grammar is LIMIT expr [OFFSET expr]; -1 is its no-limit sentinel. */
	private compileLimit(
		query: QueryStructure,
		bindings: QueryValue[],
	): string {
		let sql = '';

		if (query.limitValue !== undefined || query.offsetValue !== undefined) {
			sql += ' LIMIT ?';
			bindings.push(query.limitValue ?? -1);
		}

		if (query.offsetValue !== undefined) {
			sql += ' OFFSET ?';
			bindings.push(query.offsetValue);
		}

		return sql;
	}

	/**
	 * UPDATE and DELETE take no join, limit or offset of their own, so anything
	 * beyond a plain WHERE is expressed as the set of rows a SELECT would match.
	 * Rowid tables only; a WITHOUT ROWID table has no such column.
	 */
	private rowidFilter(query: QueryStructure, bindings: QueryValue[]): string {
		const table = this.escapeIdentifier(query.table);

		let sql = `SELECT ${table}.rowid FROM ${table}`;
		sql += this.compileJoins(query);

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		sql += this.compileOrders(query.orders);
		sql += this.compileLimit(query, bindings);

		return `rowid IN (${sql})`;
	}

	private needsRowidFilter(query: QueryStructure): boolean {
		return (
			(query.joins?.length ?? 0) > 0 ||
			query.limitValue !== undefined ||
			query.offsetValue !== undefined
		);
	}

	compileInsert(
		table: string,
		data: Record<string, QueryValue>,
	): CompiledQuery {
		const columns = Object.keys(data);
		const values = Object.values(data);

		const columnList = columns
			.map(col => this.escapeIdentifier(col))
			.join(', ');
		const placeholders = columns.map(() => '?').join(', ');

		const sql = `INSERT INTO ${this.escapeIdentifier(table)} (${columnList}) VALUES (${placeholders})`;

		return this.compiled(sql, values);
	}

	/** The historical SQLITE_MAX_VARIABLE_NUMBER, safe on every build. */
	readonly maxBindParameters = 999;

	compileInsertMany(
		table: string,
		rows: Record<string, QueryValue>[],
	): CompiledQuery {
		const columns = Object.keys(rows[0] ?? {});
		const columnList = columns
			.map(col => this.escapeIdentifier(col))
			.join(', ');

		const placeholders = columns.map(() => '?').join(', ');
		const tuples = rows.map(() => `(${placeholders})`).join(', ');

		const bindings = rows.flatMap(row => columns.map(col => row[col]!));

		const sql = `INSERT INTO ${this.escapeIdentifier(table)} (${columnList}) VALUES ${tuples}`;

		return this.compiled(sql, bindings);
	}

	compileUpdateMany(
		table: string,
		rows: Record<string, QueryValue>[],
		keyColumns: string[],
		set: Record<string, QueryValue>,
	): CompiledQuery {
		const bindings: QueryValue[] = [];
		const keys = new Set(keyColumns);

		// `ELSE <column>` leaves a row alone for any column it does not carry.
		const matchRow = keyColumns
			.map(column => `${this.escapeIdentifier(column)} = ?`)
			.join(' AND ');

		const assignments: string[] = [];

		const caseColumns = [
			...new Set(rows.flatMap(row => Object.keys(row))),
		].filter(column => !keys.has(column));

		for (const column of caseColumns) {
			const branches: string[] = [];

			for (const row of rows) {
				if (!(column in row)) continue;
				branches.push(`WHEN ${matchRow} THEN ?`);
				for (const key of keyColumns) bindings.push(row[key]!);
				bindings.push(row[column]!);
			}

			const escaped = this.escapeIdentifier(column);
			assignments.push(
				`${escaped} = CASE ${branches.join(' ')} ELSE ${escaped} END`,
			);
		}

		for (const [column, value] of Object.entries(set)) {
			assignments.push(`${this.escapeIdentifier(column)} = ?`);
			bindings.push(value);
		}

		let sql = `UPDATE ${this.escapeIdentifier(table)} SET ${assignments.join(', ')}`;

		if (keyColumns.length === 1) {
			const column = keyColumns[0]!;
			const placeholders = rows.map(() => '?').join(', ');
			sql += ` WHERE ${this.escapeIdentifier(column)} IN (${placeholders})`;
			for (const row of rows) bindings.push(row[column]!);
		} else {
			sql += ` WHERE ${rows.map(() => `(${matchRow})`).join(' OR ')}`;
			for (const row of rows) {
				for (const key of keyColumns) bindings.push(row[key]!);
			}
		}

		return this.compiled(sql, bindings);
	}

	compileUpdate(
		table: string,
		data: Record<string, QueryValue>,
		primaryKey: string | string[],
		id: QueryValue | QueryValue[],
	): CompiledQuery {
		const columns = Object.keys(data);
		const values = Object.values(data);

		const setClauses = columns
			.map(col => `${this.escapeIdentifier(col)} = ?`)
			.join(', ');

		let whereClause: string;
		let whereBindings: QueryValue[];

		if (Array.isArray(primaryKey)) {
			const keyArray = primaryKey;
			const idArray = Array.isArray(id) ? id : [id];

			if (keyArray.length !== idArray.length) {
				throw new Error(
					`Primary key length mismatch: expected ${keyArray.length} values, got ${idArray.length}`,
				);
			}

			const whereParts = keyArray.map(
				key => `${this.escapeIdentifier(key)} = ?`,
			);
			whereClause = whereParts.join(' AND ');
			whereBindings = idArray;
		} else {
			whereClause = `${this.escapeIdentifier(primaryKey)} = ?`;
			whereBindings = [id as QueryValue];
		}

		const sql = `UPDATE ${this.escapeIdentifier(table)} SET ${setClauses} WHERE ${whereClause}`;
		const bindings = [...values, ...whereBindings];

		return this.compiled(sql, bindings);
	}

	compileDelete(
		table: string,
		primaryKey: string | string[],
		id: QueryValue | QueryValue[],
	): CompiledQuery {
		let whereClause: string;
		let bindings: QueryValue[];

		if (Array.isArray(primaryKey)) {
			const keyArray = primaryKey;
			const idArray = Array.isArray(id) ? id : [id];

			if (keyArray.length !== idArray.length) {
				throw new Error(
					`Primary key length mismatch: expected ${keyArray.length} values, got ${idArray.length}`,
				);
			}

			const whereParts = keyArray.map(
				key => `${this.escapeIdentifier(key)} = ?`,
			);
			whereClause = whereParts.join(' AND ');
			bindings = idArray;
		} else {
			whereClause = `${this.escapeIdentifier(primaryKey)} = ?`;
			bindings = [id as QueryValue];
		}

		const sql = `DELETE FROM ${this.escapeIdentifier(table)} WHERE ${whereClause}`;

		return this.compiled(sql, bindings);
	}

	compileDeleteQuery(query: QueryStructure): CompiledQuery {
		const bindings: QueryValue[] = [];
		let sql = `DELETE FROM ${this.escapeIdentifier(query.table)}`;

		if (this.needsRowidFilter(query)) {
			sql += ` WHERE ${this.rowidFilter(query, bindings)}`;
		} else if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		return this.compiled(sql, bindings);
	}

	compileUpdateQuery(
		query: QueryStructure,
		data: Record<string, QueryValue>,
	): CompiledQuery {
		const columns = Object.keys(data);
		const setClauses = columns
			.map(col => `${this.escapeIdentifier(col)} = ?`)
			.join(', ');
		const bindings: QueryValue[] = [...Object.values(data)];

		let sql = `UPDATE ${this.escapeIdentifier(query.table)} SET ${setClauses}`;

		if (this.needsRowidFilter(query)) {
			sql += ` WHERE ${this.rowidFilter(query, bindings)}`;
		} else if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		return this.compiled(sql, bindings);
	}

	compileCount(query: QueryStructure): CompiledQuery {
		const bindings: QueryValue[] = [];
		let sql = `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(query.table)}`;
		sql += this.compileJoins(query);

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		return this.compiled(sql, bindings);
	}

	compileAggregate(
		query: QueryStructure,
		fn: AggregateFunction,
		column: string,
	): CompiledQuery {
		const bindings: QueryValue[] = [];

		let sql =
			`SELECT ${fn}(${this.escapeIdentifier(column)}) as aggregate ` +
			`FROM ${this.escapeIdentifier(query.table)}`;
		sql += this.compileJoins(query);

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		return this.compiled(sql, bindings);
	}

	/** Joins each condition to the one before it, parenthesising only groups. */
	private compileWheres(
		conditions: WhereCondition[],
		bindings: QueryValue[],
	): string {
		return conditions
			.map((condition, index) => {
				const clause = `${condition.negated ? 'NOT ' : ''}${this.compileCondition(condition, bindings)}`;
				if (index === 0) return clause;
				return `${condition.connector ?? 'AND'} ${clause}`;
			})
			.join(' ');
	}

	/** Bindings are pushed in traversal order, so nesting cannot reorder them. */
	private compileCondition(
		condition: WhereCondition,
		bindings: QueryValue[],
	): string {
		if (condition.type === 'group') {
			return `(${this.compileWheres(condition.conditions ?? [], bindings)})`;
		}

		if (condition.type === 'raw') {
			if (condition.bindings) {
				bindings.push(...condition.bindings);
			}
			return `(${condition.sql})`;
		}

		const { column, operator, value } = condition;

		if (operator === 'IN' || operator === 'NOT IN') {
			const values = Array.isArray(value) ? value : [value];
			const placeholders = values.map(() => '?').join(', ');
			bindings.push(...values);
			return `${this.escapeIdentifier(column!)} ${operator} (${placeholders})`;
		}

		if (operator === 'IS' || operator === 'IS NOT') {
			return `${this.escapeIdentifier(column!)} ${operator} NULL`;
		}

		bindings.push(value as QueryValue);
		return `${this.escapeIdentifier(column!)} ${operator} ?`;
	}

	/** Quotes an identifier so reserved words and dots are safe. */
	private escapeIdentifier(identifier: string): string {
		// A wildcard is not a name; quoting it would make it one.
		if (identifier === '*') return identifier;

		if (identifier.includes('.')) {
			return identifier
				.split('.')
				.map(part => this.escapeIdentifier(part))
				.join('.');
		}

		return `"${identifier.replace(/"/g, '""')}"`;
	}
}
