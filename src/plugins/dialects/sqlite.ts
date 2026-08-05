import type { SqlDialect } from '../../dialect';
import type { CompiledQuery, QueryStructure, QueryValue } from '../../types';

export class SQLiteDialect implements SqlDialect {
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
							`${column} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(`${column} ${operator} NULL`);
					} else {
						whereClauses.push(`${column} ${operator} ?`);
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

		return { sql, bindings };
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

		return { sql, bindings: values };
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

		return { sql, bindings };
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

		return { sql, bindings };
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
							`${column} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(`${column} ${operator} NULL`);
					} else {
						whereClauses.push(`${column} ${operator} ?`);
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

		return { sql, bindings };
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
							`${column} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(`${column} ${operator} NULL`);
					} else {
						whereClauses.push(`${column} ${operator} ?`);
						bindings.push(value as QueryValue);
					}
				}
			}

			sql += whereClauses.join(' AND ');
		}

		return { sql, bindings };
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
							`${column} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						whereClauses.push(`${column} ${operator} NULL`);
					} else {
						whereClauses.push(`${column} ${operator} ?`);
						bindings.push(value as QueryValue);
					}
				}
			}

			sql += whereClauses.join(' AND ');
		}

		return { sql, bindings };
	}

	/** Unix seconds, matching INTEGER DEFAULT (unixepoch()) columns. */
	getCurrentTimestamp(): number {
		return Math.floor(Date.now() / 1000);
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
