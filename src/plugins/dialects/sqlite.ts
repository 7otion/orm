import type { SqlDialect } from '../../dialect';
import type { CompiledQuery, QueryStructure, QueryValue } from '../../types';

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
			sql += ' WHERE ';
			const whereClauses: string[] = [];

			for (const where of query.wheres) {
				if (where.type === 'raw') {
					whereClauses.push(`(${where.sql})`);
					if (where.bindings) {
						bindings.push(...where.bindings);
					}
				} else {
					const { column, operator, value } = where;

					if (operator === 'IN' || operator === 'NOT IN') {
						const values = Array.isArray(value) ? value : [value];
						const placeholders = values.map(() => '?').join(', ');
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} NULL`,
						);
					} else {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} ?`,
						);
						bindings.push(value as QueryValue);
					}
				}
			}

			sql += whereClauses.join(' AND ');
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
			sql += ' WHERE ';
			const whereClauses: string[] = [];

			for (const where of query.wheres) {
				if (where.type === 'raw') {
					whereClauses.push(`(${where.sql})`);
					if (where.bindings) {
						bindings.push(...where.bindings);
					}
				} else {
					const { column, operator, value } = where;

					if (operator === 'IN' || operator === 'NOT IN') {
						const values = Array.isArray(value) ? value : [value];
						const placeholders = values.map(() => '?').join(', ');
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} NULL`,
						);
					} else {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} ?`,
						);
						bindings.push(value as QueryValue);
					}
				}
			}

			sql += whereClauses.join(' AND ');
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
			sql += ' WHERE ';
			const whereClauses: string[] = [];

			for (const where of query.wheres) {
				if (where.type === 'raw') {
					whereClauses.push(`(${where.sql})`);
					if (where.bindings) {
						bindings.push(...where.bindings);
					}
				} else {
					const { column, operator, value } = where;

					if (operator === 'IN' || operator === 'NOT IN') {
						const values = Array.isArray(value) ? value : [value];
						const placeholders = values.map(() => '?').join(', ');
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} NULL`,
						);
					} else {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} ?`,
						);
						bindings.push(value as QueryValue);
					}
				}
			}

			sql += whereClauses.join(' AND ');
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
			sql += ' WHERE ';
			const whereClauses: string[] = [];

			for (const where of query.wheres) {
				if (where.type === 'raw') {
					whereClauses.push(`(${where.sql})`);
					if (where.bindings) {
						bindings.push(...where.bindings);
					}
				} else {
					const { column, operator, value } = where;

					if (operator === 'IN' || operator === 'NOT IN') {
						const values = Array.isArray(value) ? value : [value];
						const placeholders = values.map(() => '?').join(', ');
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} NULL`,
						);
					} else {
						whereClauses.push(
							`${this.escapeIdentifier(column!)} ${operator} ?`,
						);
						bindings.push(value as QueryValue);
					}
				}
			}

			sql += whereClauses.join(' AND ');
		}

		return this.compiled(sql, bindings);
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
