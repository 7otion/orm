import type { DatabaseAdapter } from '../../adapter';
import type { DatabaseRow, QueryValue } from '../../types';

type TauriDatabase = {
	execute(sql: string, bindValues?: unknown[]): Promise<any>;
	select<T>(sql: string, bindValues?: unknown[]): Promise<T[]>;
};

type TauriDatabaseModule = {
	default: {
		load(path: string): Promise<TauriDatabase>;
	};
};

export interface TauriAdapterConfig {
	database: string;
	debug?: boolean;
	pragmas?: string[];
}

export class TauriAdapter implements DatabaseAdapter {
	private db: TauriDatabase | null = null;
	private inTransactionFlag: boolean = false;
	private debug: boolean = false;
	private config: TauriAdapterConfig;
	private initPromise: Promise<void> | null = null;

	constructor(config: TauriAdapterConfig) {
		this.config = config;
		this.debug = config.debug || false;
	}

	async initialize(): Promise<void> {
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.performInitialization();
		return this.initPromise;
	}

	private async performInitialization(): Promise<void> {
		if (this.db) {
			return;
		}

		let tauriSqlModule: TauriDatabaseModule;

		try {
			// @ts-ignore
			tauriSqlModule = await import('@tauri-apps/plugin-sql');
		} catch (_error) {
			throw new Error(
				'@tauri-apps/plugin-sql is required for TauriAdapter. Install it with: npm install @tauri-apps/plugin-sql',
			);
		}

		this.db = await tauriSqlModule.default.load(this.config.database);

		const defaultPragmas = [
			'PRAGMA journal_mode = WAL;',
			'PRAGMA foreign_keys = ON;',
			'PRAGMA case_sensitive_like = OFF;',
			'PRAGMA busy_timeout = 30000;',
			'PRAGMA synchronous = NORMAL;',
		];

		const pragmas = this.config.pragmas || defaultPragmas;

		for (const pragma of pragmas) {
			await this.db.execute(pragma);
		}
	}

	private ensureInitialized(): TauriDatabase {
		if (!this.db) {
			throw new Error(
				'TauriAdapter not initialized. Call initialize() first.',
			);
		}
		return this.db;
	}

	private logQuery(type: string, sql: string, params?: QueryValue[]): void {
		if (!this.debug) {
			return;
		}

		const formattedSql = this.formatSqlWithParams(sql, params);
		console.log(`🔹 [${type}]:`, formattedSql);
	}

	private formatSqlWithParams(sql: string, params?: QueryValue[]): string {
		if (!params || params.length === 0) {
			return sql;
		}

		let formatted = sql;
		for (const param of params) {
			let value: string;

			if (param === null || param === undefined) {
				value = 'NULL';
			} else if (typeof param === 'string') {
				value = `'${param.replace(/'/g, "''")}'`;
			} else {
				value = String(param);
			}

			formatted = formatted.replace('?', value);
		}

		return formatted;
	}

	async query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]> {
		const db = this.ensureInitialized();
		this.logQuery('SELECT', sql, params);

		const result = await db.select<DatabaseRow>(sql, params);
		return result || [];
	}

	async execute(sql: string, params?: QueryValue[]): Promise<number> {
		const db = this.ensureInitialized();
		this.logQuery('EXECUTE', sql, params);

		const result = await db.execute(sql, params);
		return result.rowsAffected || 0;
	}

	async insert(sql: string, params?: QueryValue[]): Promise<number> {
		const db = this.ensureInitialized();
		this.logQuery('INSERT', sql, params);

		const result = await db.execute(sql, params);
		return result.lastInsertId || 0;
	}

	async beginTransaction(): Promise<void> {
		const db = this.ensureInitialized();

		if (this.inTransactionFlag) {
			return;
		}

		await db.execute('BEGIN TRANSACTION');
		this.inTransactionFlag = true;
	}

	async commit(): Promise<void> {
		const db = this.ensureInitialized();

		if (!this.inTransactionFlag) {
			throw new Error('No transaction in progress');
		}

		await db.execute('COMMIT');
		this.inTransactionFlag = false;
	}

	async rollback(): Promise<void> {
		const db = this.ensureInitialized();

		if (!this.inTransactionFlag) {
			throw new Error('No transaction in progress');
		}

		await db.execute('ROLLBACK');
		this.inTransactionFlag = false;
	}

	inTransaction(): boolean {
		return this.inTransactionFlag;
	}
}
