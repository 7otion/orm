/**
 * Singleton holding the adapter, dialect and transaction state.
 * Initialised once at startup.
 */

import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';

export interface ORMConfig {
	adapter: DatabaseAdapter;
	dialect: SqlDialect;
	/** Serialises writes. Required for SQLite, which cannot write concurrently. */
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
		if (!ORM.instance) {
			ORM.instance = new ORM(config);
		}
	}

	static async reInitialize(config: ORMConfig): Promise<void> {
		if (ORM.instance) {
			await ORM.instance.close();
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

	async close(): Promise<void> {
		await this.adapter.close();
	}

	getDialect(): SqlDialect {
		return this.dialect;
	}

	/**
	 * Runs the callback in a transaction, committing on success and rolling
	 * back on throw. Nesting is handled: only the outermost call commits.
	 */
	async transaction<T>(callback: () => Promise<T>): Promise<T> {
		const wasInTransaction = this.adapter.inTransaction();

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
	 * Serialises a write behind any already in flight, when the write queue is
	 * enabled. Reads are never queued.
	 */
	async queueWrite<T>(operation: () => Promise<T>): Promise<T> {
		if (!this.enableWriteQueue) {
			return operation();
		}

		const result = this.writeQueue.then(() => operation());
		this.writeQueue = result.catch(() => {}); // Don't propagate errors in queue chain
		return result;
	}
}
