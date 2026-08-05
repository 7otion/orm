/**
 * Test adapter over `bun:sqlite`, deliberately matching TauriAdapter's
 * observable semantics: insert() returns lastInsertRowid, execute() returns
 * rows affected, and `undefined` bindings become NULL (Tauri serialises bind
 * values as JSON, so undefined arrives as null).
 *
 * Records every statement, so tests can assert on the SQL actually issued.
 */

import { Database } from 'bun:sqlite';

import type { DatabaseAdapter } from '../../src/adapter';
import type { DatabaseRow, QueryValue } from '../../src/types';

export interface RecordedStatement {
	kind: 'query' | 'execute' | 'insert';
	sql: string;
	params: unknown[];
}

export class BunSqliteAdapter implements DatabaseAdapter {
	readonly db: Database;
	readonly log: RecordedStatement[] = [];

	private inTx = false;

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

	async beginTransaction(): Promise<void> {
		if (this.inTx) return;
		this.db.exec('BEGIN');
		this.inTx = true;
	}

	async commit(): Promise<void> {
		if (!this.inTx) throw new Error('No transaction in progress');
		this.db.exec('COMMIT');
		this.inTx = false;
	}

	async rollback(): Promise<void> {
		if (!this.inTx) throw new Error('No transaction in progress');
		this.db.exec('ROLLBACK');
		this.inTx = false;
	}

	inTransaction(): boolean {
		return this.inTx;
	}

	async close(): Promise<void> {
		this.db.close();
	}
}
