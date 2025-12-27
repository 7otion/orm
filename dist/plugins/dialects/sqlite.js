export class SQLiteDialect {
    /**
     * Compile a SELECT query structure into SQLite SQL
     *
     * Example output:
     * SELECT * FROM users WHERE age > ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
     */
    compileSelect(query) {
        const bindings = [];
        let sql = 'SELECT ';
        // SELECT clause - raw takes precedence, then columns, then *
        if (query.selectRaw) {
            sql += query.selectRaw;
        }
        else if (query.columns && query.columns.length > 0) {
            sql += query.columns.join(', ');
        }
        else {
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
            const whereClauses = [];
            for (const where of query.wheres) {
                if (where.type === 'raw') {
                    // Raw SQL WHERE clause
                    whereClauses.push(`(${where.sql})`);
                    if (where.bindings) {
                        bindings.push(...where.bindings);
                    }
                }
                else {
                    // Standard WHERE clause
                    const { column, operator, value } = where;
                    if (operator === 'IN' || operator === 'NOT IN') {
                        // Handle IN clause: column IN (?, ?, ?)
                        const values = Array.isArray(value) ? value : [value];
                        const placeholders = values.map(() => '?').join(', ');
                        whereClauses.push(`${column} ${operator} (${placeholders})`);
                        bindings.push(...values);
                    }
                    else if (operator === 'IS' || operator === 'IS NOT') {
                        // Handle IS NULL / IS NOT NULL
                        whereClauses.push(`${column} ${operator} NULL`);
                    }
                    else {
                        // Standard comparison: column = ?
                        whereClauses.push(`${column} ${operator} ?`);
                        bindings.push(value);
                    }
                }
            }
            sql += whereClauses.join(' AND ');
        }
        // ORDER BY clause
        if (query.orders.length > 0) {
            sql += ' ORDER BY ';
            const orderClauses = query.orders.map(order => {
                if (order.direction === 'raw') {
                    // Raw ORDER BY - use as-is
                    return order.column;
                }
                // Escape column identifier for reserved keywords
                return `${this.escapeIdentifier(order.column)} ${order.direction.toUpperCase()}`;
            });
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
     * INSERT INTO users ("name", "email", "created_at") VALUES (?, ?, ?)
     */
    compileInsert(table, data) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        // Escape column names to handle reserved keywords
        const columnList = columns
            .map(col => this.escapeIdentifier(col))
            .join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`;
        return { sql, bindings: values };
    }
    /**
     * Compile an UPDATE statement
     *
     * Example output:
     * UPDATE users SET "name" = ?, "email" = ?, "updated_at" = ? WHERE "id" = ?
     */
    compileUpdate(table, data, primaryKey, id) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        // Escape column names in SET clause
        const setClauses = columns
            .map(col => `${this.escapeIdentifier(col)} = ?`)
            .join(', ');
        const sql = `UPDATE ${table} SET ${setClauses} WHERE ${this.escapeIdentifier(primaryKey)} = ?`;
        const bindings = [...values, id];
        return { sql, bindings };
    }
    /**
     * Compile a DELETE statement
     *
     * Example output:
     * DELETE FROM users WHERE "id" = ?
     */
    compileDelete(table, primaryKey, id) {
        const sql = `DELETE FROM ${table} WHERE ${this.escapeIdentifier(primaryKey)} = ?`;
        const bindings = [id];
        return { sql, bindings };
    }
    /**
     * Compile a COUNT query
     *
     * Example output:
     * SELECT COUNT(*) as count FROM users WHERE age > ? AND status = ?
     */
    compileCount(query) {
        const bindings = [];
        let sql = `SELECT COUNT(*) as count FROM ${query.table}`;
        // JOIN clauses
        if (query.joins && query.joins.length > 0) {
            for (const join of query.joins) {
                sql += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
            }
        }
        // WHERE clauses
        if (query.wheres.length > 0) {
            sql += ' WHERE ';
            const whereClauses = [];
            for (const where of query.wheres) {
                if (where.type === 'raw') {
                    whereClauses.push(`(${where.sql})`);
                    if (where.bindings) {
                        bindings.push(...where.bindings);
                    }
                }
                else {
                    const { column, operator, value } = where;
                    if (operator === 'IN' || operator === 'NOT IN') {
                        const values = Array.isArray(value) ? value : [value];
                        const placeholders = values.map(() => '?').join(', ');
                        whereClauses.push(`${column} ${operator} (${placeholders})`);
                        bindings.push(...values);
                    }
                    else if (operator === 'IS' || operator === 'IS NOT') {
                        whereClauses.push(`${column} ${operator} NULL`);
                    }
                    else {
                        whereClauses.push(`${column} ${operator} ?`);
                        bindings.push(value);
                    }
                }
            }
            sql += whereClauses.join(' AND ');
        }
        return { sql, bindings };
    }
    /**
     * Get current timestamp for SQLite
     *
     * Returns ISO datetime string compatible with SQLite
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
    }
    /**
     * Escape an identifier (table/column name) for SQLite
     *
     * Examples:
     * - order → "order"
     * - user.name → "user"."name"
     * - my"table → "my""table" (escapes internal quotes)
     */
    escapeIdentifier(identifier) {
        // If it contains a dot, escape each part separately
        if (identifier.includes('.')) {
            return identifier
                .split('.')
                .map(part => this.escapeIdentifier(part))
                .join('.');
        }
        // Double any internal quotes and wrap in double quotes
        return `"${identifier.replace(/"/g, '""')}"`;
    }
}
//# sourceMappingURL=sqlite.js.map