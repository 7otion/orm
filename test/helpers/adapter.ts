/**
 * Test adapters over `bun:sqlite`, deliberately matching TauriAdapter's
 * observable semantics: insert() returns lastInsertRowid, execute() returns
 * rows affected, and `undefined` bindings become NULL (Tauri serialises bind
 * values as JSON, so undefined arrives as null).
 *
 * Records every statement, so tests can assert on the SQL actually issued.
 */

import { Database } from 'bun:sqlite';

import type { DatabaseAdapter, TransactionalAdapter } from '../../src/adapter';
import type { DatabaseRow, QueryValue } from '../../src/types';

export interface RecordedStatement {
	kind: 'query' | 'execute' | 'insert' | 'transaction';
	sql: string;
	params: unknown[];
}

/** No transaction methods, as an adapter over a connection pool would have. */
export class PlainBunSqliteAdapter implements DatabaseAdapter {
	readonly db: Database;
	readonly log: RecordedStatement[] = [];

	constructor(filename = ':memory:') {
		this.db = new Database(filename);
		this.db.exec('PRAGMA foreign_keys = ON;');
	}

	sqlLog(): string[] {
		return this.log.map(entry => entry.sql);
	}

	clearLog(): void {
		this.log.length = 0;
	}

	private bind(params?: QueryValue[]): unknown[] {
		return (params ?? []).map(value =>
			value === undefined ? null : value,
		);
	}

	async query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]> {
		const bound = this.bind(params);
		this.log.push({ kind: 'query', sql, params: bound });
		return this.db.prepare(sql).all(...(bound as never[])) as DatabaseRow[];
	}

	async execute(sql: string, params?: QueryValue[]): Promise<number> {
		const bound = this.bind(params);
		this.log.push({ kind: 'execute', sql, params: bound });
		const result = this.db.prepare(sql).run(...(bound as never[]));
		return Number(result.changes);
	}

	async insert(sql: string, params?: QueryValue[]): Promise<number> {
		const bound = this.bind(params);
		this.log.push({ kind: 'insert', sql, params: bound });
		const result = this.db.prepare(sql).run(...(bound as never[]));
		return Number(result.lastInsertRowid);
	}

	async close(): Promise<void> {
		this.db.close();
	}
}

export class BunSqliteAdapter
	extends PlainBunSqliteAdapter
	implements TransactionalAdapter
{
	async beginTransaction(): Promise<void> {
		this.run('BEGIN');
	}

	async commit(): Promise<void> {
		this.run('COMMIT');
	}

	async rollback(): Promise<void> {
		this.run('ROLLBACK');
	}

	async inTransaction(): Promise<boolean> {
		return this.db.inTransaction;
	}

	private run(sql: string): void {
		this.log.push({ kind: 'transaction', sql, params: [] });
		this.db.exec(sql);
	}
}
