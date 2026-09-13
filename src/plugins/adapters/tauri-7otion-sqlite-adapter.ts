import type { TransactionalAdapter } from '../../adapter';
import type { DatabaseRow, QueryValue } from '../../types';
import { StatementLogger } from './statement-logger';

type PluginDatabase = {
	select(sql: string, params?: unknown[]): Promise<DatabaseRow[]>;
	execute(
		sql: string,
		params?: unknown[],
	): Promise<{ rowsAffected: number; lastInsertId: number }>;
	inTransaction(): Promise<boolean>;
	close(): Promise<void>;
};

type PluginLoadOptions = Pick<
	Tauri7otionSqliteAdapterConfig,
	'key' | 'pragmas'
>;

type PluginModule = {
	Database: {
		load(
			path: string,
			options?: PluginLoadOptions,
		): Promise<PluginDatabase>;
	};
};

export interface Tauri7otionSqliteAdapterConfig {
	database: string;
	/** SQLCipher key; the plugin warns that one passed from JavaScript is not safe. */
	key?: string;
	pragmas?: Record<string, string | number | boolean>;
	debug?: boolean;
}

/** Over tauri-plugin-7otion-sqlite, whose single connection per database file runs transactions. */
export class Tauri7otionSqliteAdapter implements TransactionalAdapter {
	private db: PluginDatabase | null = null;
	private logger: StatementLogger;
	private initPromise: Promise<void> | null = null;

	constructor(private readonly config: Tauri7otionSqliteAdapterConfig) {
		this.logger = new StatementLogger(config.debug ?? false);
	}

	async initialize(): Promise<void> {
		this.initPromise ??= this.performInitialization();
		return this.initPromise;
	}

	private async performInitialization(): Promise<void> {
		let plugin: PluginModule;

		try {
			// @ts-ignore
			plugin = await import('@7otion/tauri-plugin-sqlite-api');
		} catch (_error) {
			throw new Error(
				'@7otion/tauri-plugin-sqlite-api is required for Tauri7otionSqliteAdapter. Install it with: ' +
					'bun add github:7otion/tauri-plugin-7otion-sqlite',
			);
		}

		const { key, pragmas } = this.config;
		// No options attaches to a database the app already opened, whatever its config.
		const options =
			key === undefined && pragmas === undefined
				? undefined
				: { key, pragmas };

		this.db = await plugin.Database.load(this.config.database, options);
	}

	private ensureInitialized(): PluginDatabase {
		if (!this.db) {
			throw new Error(
				'Tauri7otionSqliteAdapter not initialized. Call initialize() first.',
			);
		}
		return this.db;
	}

	async query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]> {
		const db = this.ensureInitialized();
		this.logger.log('SELECT', sql, params);

		return db.select(sql, params);
	}

	async execute(sql: string, params?: QueryValue[]): Promise<number> {
		const db = this.ensureInitialized();
		this.logger.log('EXECUTE', sql, params);

		return (await db.execute(sql, params)).rowsAffected;
	}

	async insert(sql: string, params?: QueryValue[]): Promise<number> {
		const db = this.ensureInitialized();
		this.logger.log('INSERT', sql, params);

		return (await db.execute(sql, params)).lastInsertId;
	}

	async beginTransaction(): Promise<void> {
		await this.execute('BEGIN');
	}

	async commit(): Promise<void> {
		await this.execute('COMMIT');
	}

	async rollback(): Promise<void> {
		await this.execute('ROLLBACK');
	}

	async inTransaction(): Promise<boolean> {
		return this.ensureInitialized().inTransaction();
	}

	async close(): Promise<void> {
		if (this.db) {
			await this.db.close();
			this.db = null;
			this.initPromise = null;
		}
	}
}
