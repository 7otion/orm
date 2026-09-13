import type { DatabaseAdapter } from '../../adapter';
import type { DatabaseRow, QueryValue } from '../../types';
import { StatementLogger } from './statement-logger';

type TauriDatabase = {
	execute(sql: string, bindValues?: unknown[]): Promise<any>;
	select<T>(sql: string, bindValues?: unknown[]): Promise<T[]>;
	close(database?: string): Promise<boolean>;
};

type TauriDatabaseModule = {
	default: {
		load(path: string): Promise<TauriDatabase>;
	};
};

export interface TauriAdapterConfig {
	database: string;
	debug?: boolean;
}

/**
 * No transactions: tauri-plugin-sql pools connections, so BEGIN and COMMIT can
 * reach different ones (tauri-apps/plugins-workspace#886).
 */
export class TauriAdapter implements DatabaseAdapter {
	private db: TauriDatabase | null = null;
	private logger: StatementLogger;
	private config: TauriAdapterConfig;
	private initPromise: Promise<void> | null = null;

	constructor(config: TauriAdapterConfig) {
		this.config = config;
		this.logger = new StatementLogger(config.debug ?? false);
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

		// Stored in the database file, so one pooled connection is enough. A
		// per-connection PRAGMA would reach only the connection that ran it.
		await this.db.execute('PRAGMA journal_mode = WAL;');
	}

	private ensureInitialized(): TauriDatabase {
		if (!this.db) {
			throw new Error(
				'TauriAdapter not initialized. Call initialize() first.',
			);
		}
		return this.db;
	}

	async query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]> {
		const db = this.ensureInitialized();
		this.logger.log('SELECT', sql, params);

		const result = await db.select<DatabaseRow>(sql, params);
		return result || [];
	}

	async execute(sql: string, params?: QueryValue[]): Promise<number> {
		const db = this.ensureInitialized();
		this.logger.log('EXECUTE', sql, params);

		const result = await db.execute(sql, params);
		return result.rowsAffected || 0;
	}

	async insert(sql: string, params?: QueryValue[]): Promise<number> {
		const db = this.ensureInitialized();
		this.logger.log('INSERT', sql, params);

		const result = await db.execute(sql, params);
		return result.lastInsertId || 0;
	}

	async close(): Promise<void> {
		if (this.db) {
			console.log(
				'🔹 Closing Tauri database connection for:',
				this.config.database,
			);
			await this.db.close(this.config.database);
			this.db = null;
			this.initPromise = null;
		}
	}
}
