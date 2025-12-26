/**
 * ORM Manager
 *
 * Central singleton that manages:
 * - Database adapter (how we connect to the database)
 * - SQL dialect (how we generate SQL)
 * - Transaction state
 *
 * This is initialized once at app startup:
 * ORM.initialize({
 *   adapter: new MyAdapter(db),
 *   dialect: new SQLiteDialect()
 * });
 */

import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';

export interface ORMConfig {
	adapter: DatabaseAdapter;
	dialect: SqlDialect;
	/**
	 * Enable write queue to prevent concurrent write operations.
	 * Required for databases that don't support concurrent writes (e.g., SQLite).
	 * Default: false
	 */
	enableWriteQueue?: boolean;
}

export class ORM {
	private static instance: ORM | null = null;

	private adapter: DatabaseAdapter;
	private dialect: SqlDialect;
	private writeQueue: Promise<any> = Promise.resolve();
	private enableWriteQueue: boolean = false;

	private constructor(config: ORMConfig) {
		this.adapter = config.adapter;
		this.dialect = config.dialect;
		this.enableWriteQueue = config.enableWriteQueue ?? false;
	}

	static initialize(config: ORMConfig): void {
		if (ORM.instance) {
			throw new Error('ORM is already initialized.');
		}
		ORM.instance = new ORM(config);
	}

	static getInstance(): ORM {
		if (!ORM.instance) {
			throw new Error(
				'ORM not initialized. Call ORM.initialize() first.',
			);
		}
		return ORM.instance;
	}

	getAdapter(): DatabaseAdapter {
		return this.adapter;
	}

	getDialect(): SqlDialect {
		return this.dialect;
	}

	/**
	 * Execute a callback within a database transaction
	 *
	 * Supports SQLite, MySQL, and PostgreSQL transaction semantics:
	 * - Nested transactions are handled automatically (only outermost transaction commits/rolls back)
	 * - Context-aware: All queries within callback execute in the same transaction
	 * - If callback succeeds → transaction commits
	 * - If callback throws → transaction rolls back
	 *
	 * Example:
	 * await ORM.transaction(async () => {
	 *   const user = await User.create({ name: 'John' });
	 *   const post = await Post.create({ user_id: user.id, title: 'Hello' });
	 * });
	 *
	 * @param callback - Function to execute in transaction context
	 * @returns The callback's return value
	 */
	async transaction<T>(callback: () => Promise<T>): Promise<T> {
		const wasInTransaction = this.adapter.inTransaction();

		// Only begin/commit if not already in a transaction
		// This handles nested transactions correctly
		if (!wasInTransaction) {
			await this.adapter.beginTransaction();
		}

		try {
			const result = await callback();

			if (!wasInTransaction) {
				await this.adapter.commit();
			}

			return result;
		} catch (error) {
			if (!wasInTransaction) {
				await this.adapter.rollback();
			}
			throw error;
		}
	}

	/**
	 * Queue a write operation (INSERT, UPDATE, DELETE) to prevent concurrent writes.
	 * Only used when enableWriteQueue is true (for databases like SQLite).
	 * Read operations are not queued.
	 *
	 * @param operation - Async write operation to queue
	 * @returns Result of the write operation
	 */
	async queueWrite<T>(operation: () => Promise<T>): Promise<T> {
		if (!this.enableWriteQueue) {
			// No queueing - execute immediately
			return operation();
		}

		// Wait for previous write to complete, then execute this one
		const result = this.writeQueue.then(() => operation());
		this.writeQueue = result.catch(() => {}); // Don't propagate errors in queue chain
		return result;
	}
}
