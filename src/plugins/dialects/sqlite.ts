/**
 * SQLiteDialect
 *
 * Implements SqlDialect for SQLite databases.
 */

import type { SqlDialect } from '@/dialect';
import type { CompiledQuery, QueryStructure, QueryValue } from '@/types';

export class SQLiteDialect implements SqlDialect {
	/**
	 * Compile a SELECT query structure into SQLite SQL
	 *
	 * Example output:
	 * SELECT * FROM users WHERE age > ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
	 */
	compileSelect(query: QueryStructure): CompiledQuery {
		const bindings: QueryValue[] = [];
		let sql = 'SELECT ';

		// SELECT clause - columns or *
		if (query.columns && query.columns.length > 0) {
			sql += query.columns.join(', ');
		} else {
			sql += '*';
		}

		// FROM clause
		sql += ` FROM ${query.table}`;

		// JOIN clauses (used for eager loading)
		if (query.joins && query.joins.length > 0) {
			for (const join of query.joins) {
				sql += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
			}
		}

		// WHERE clauses
		if (query.wheres.length > 0) {
			sql += ' WHERE ';
			const whereClauses: string[] = [];

			for (const where of query.wheres) {
				if (where.type === 'raw') {
					// Raw SQL WHERE clause
					whereClauses.push(`(${where.sql})`);
					if (where.bindings) {
						bindings.push(...where.bindings);
					}
				} else {
					// Standard WHERE clause
					const { column, operator, value } = where;

					if (operator === 'IN' || operator === 'NOT IN') {
						// Handle IN clause: column IN (?, ?, ?)
						const values = Array.isArray(value) ? value : [value];
						const placeholders = values.map(() => '?').join(', ');
						whereClauses.push(
							`${column} ${operator} (${placeholders})`,
						);
						bindings.push(...values);
					} else if (operator === 'IS' || operator === 'IS NOT') {
						// Handle IS NULL / IS NOT NULL
						whereClauses.push(`${column} ${operator} NULL`);
					} else {
						// Standard comparison: column = ?
						whereClauses.push(`${column} ${operator} ?`);
						bindings.push(value as QueryValue);
					}
				}
			}

			sql += whereClauses.join(' AND ');
		}

		// ORDER BY clause
		if (query.orders.length > 0) {
			sql += ' ORDER BY ';
			const orderClauses = query.orders.map(
				order => `${order.column} ${order.direction.toUpperCase()}`,
			);
			sql += orderClauses.join(', ');
		}

		// LIMIT clause
		if (query.limitValue !== undefined) {
			sql += ' LIMIT ?';
			bindings.push(query.limitValue);
		}

		// OFFSET clause
		if (query.offsetValue !== undefined) {
			sql += ' OFFSET ?';
			bindings.push(query.offsetValue);
		}

		return { sql, bindings };
	}

	/**
	 * Compile an INSERT statement
	 *
	 * Example output:
	 * INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)
	 */
	compileInsert(
		table: string,
		data: Record<string, QueryValue>,
	): CompiledQuery {
		const columns = Object.keys(data);
		const values = Object.values(data);

		const columnList = columns.join(', ');
		const placeholders = columns.map(() => '?').join(', ');

		const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`;

		return { sql, bindings: values };
	}

	/**
	 * Compile an UPDATE statement
	 *
	 * Example output:
	 * UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?
	 */
	compileUpdate(
		table: string,
		data: Record<string, QueryValue>,
		primaryKey: string,
		id: QueryValue,
	): CompiledQuery {
		const columns = Object.keys(data);
		const values = Object.values(data);

		const setClauses = columns.map(col => `${col} = ?`).join(', ');

		const sql = `UPDATE ${table} SET ${setClauses} WHERE ${primaryKey} = ?`;
		const bindings = [...values, id];

		return { sql, bindings };
	}

	/**
	 * Compile a DELETE statement
	 *
	 * Example output:
	 * DELETE FROM users WHERE id = ?
	 */
	compileDelete(
		table: string,
		primaryKey: string,
		id: QueryValue,
	): CompiledQuery {
		const sql = `DELETE FROM ${table} WHERE ${primaryKey} = ?`;
		const bindings = [id];

		return { sql, bindings };
	}

	/**
	 * Get current timestamp for SQLite
	 *
	 * Returns SQL expression (not a value) so it can be used in queries
	 */
	getCurrentTimestamp(): string {
		return "datetime('now')";
	}
}
