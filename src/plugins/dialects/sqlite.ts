import type { SqlDialect } from '../../dialect';
import type {
	CompiledQuery,
	QueryStructure,
	QueryValue,
	WhereCondition,
} from '../../types';

export class SQLiteDialect implements SqlDialect {
	/**
	 * SQLite has no boolean type, and a driver handed a raw `true` will not
	 * necessarily store 0/1 — tauri-plugin-sql, for one, binds it as the JSON
	 * text `"true"`, which no `= 1` comparison ever matches. Normalising here
	 * catches every value the builder emits, including `where` operands that
	 * never passed through a model's casts.
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
			sql += query.columns.join(', ');
		} else {
			sql += '*';
		}

		sql += ` FROM ${query.table}`;

		if (query.joins && query.joins.length > 0) {
			for (const join of query.joins) {
				sql += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
			}
		}

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		if (query.groups && query.groups.length > 0) {
			const groupClauses = query.groups.map(column =>
				this.escapeIdentifier(column),
			);
			sql += ` GROUP BY ${groupClauses.join(', ')}`;
		}

		if (query.orders.length > 0) {
			sql += ' ORDER BY ';
			const orderClauses = query.orders.map(order => {
				if (order.direction === 'raw') {
					return order.column;
				}
				return `${this.escapeIdentifier(order.column)} ${order.direction.toUpperCase()}`;
			});
			sql += orderClauses.join(', ');
		}

		if (query.limitValue !== undefined) {
			sql += ' LIMIT ?';
			bindings.push(query.limitValue);
		}

		if (query.offsetValue !== undefined) {
			sql += ' OFFSET ?';
			bindings.push(query.offsetValue);
		}

		return this.compiled(sql, bindings);
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

		const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`;

		return this.compiled(sql, values);
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

		const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClause}`;
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

		const sql = `DELETE FROM ${table} WHERE ${whereClause}`;

		return this.compiled(sql, bindings);
	}

	compileDeleteQuery(query: QueryStructure): CompiledQuery {
		const bindings: QueryValue[] = [];
		let sql = `DELETE FROM ${query.table}`;

		if (query.joins && query.joins.length > 0) {
			for (const join of query.joins) {
				sql += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
			}
		}

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		// Accepted but semantically inert for a delete.
		if (query.orders.length > 0) {
			sql += ' ORDER BY ';
			const orderClauses = query.orders.map(order => {
				if (order.direction === 'raw') {
					return order.column;
				}
				return `${this.escapeIdentifier(order.column)} ${order.direction.toUpperCase()}`;
			});
			sql += orderClauses.join(', ');
		}

		if (query.limitValue !== undefined) {
			sql += ' LIMIT ?';
			bindings.push(query.limitValue);
		}

		if (query.offsetValue !== undefined) {
			sql += ' OFFSET ?';
			bindings.push(query.offsetValue);
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

		let sql = `UPDATE ${query.table} SET ${setClauses}`;

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		return this.compiled(sql, bindings);
	}

	compileCount(query: QueryStructure): CompiledQuery {
		const bindings: QueryValue[] = [];
		let sql = `SELECT COUNT(*) as count FROM ${query.table}`;

		if (query.joins && query.joins.length > 0) {
			for (const join of query.joins) {
				sql += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
			}
		}

		if (query.wheres.length > 0) {
			sql += ` WHERE ${this.compileWheres(query.wheres, bindings)}`;
		}

		return this.compiled(sql, bindings);
	}

	/**
	 * Compiles a condition list, joining each to the one before it with its own
	 * connector. `AND` binds tighter than `OR` in SQL, so a flat list is emitted
	 * as written rather than parenthesised — grouping is the caller's to state.
	 */
	private compileWheres(
		conditions: WhereCondition[],
		bindings: QueryValue[],
	): string {
		return conditions
			.map((condition, index) => {
				const clause = this.compileCondition(condition, bindings);
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
		if (identifier.includes('.')) {
			return identifier
				.split('.')
				.map(part => this.escapeIdentifier(part))
				.join('.');
		}

		return `"${identifier.replace(/"/g, '""')}"`;
	}
}
