/**
 * Singleton holding the adapter, dialect, transaction state and caches.
 * Initialised once at startup.
 */

import type { DatabaseAdapter } from './adapter';
import type { SqlDialect } from './dialect';
import type { ResultCacheAdapter } from './result-cache';
import type { DatabaseRow } from './types';

export interface ORMConfig {
	adapter: DatabaseAdapter;
	dialect: SqlDialect;
	/** Serialises writes. Required for SQLite, which cannot write concurrently. */
	enableWriteQueue?: boolean;
	/** Enables SELECT result caching when provided. */
	resultCacheAdapter?: ResultCacheAdapter;
	/** Disables result caching without discarding the adapter. */
	disableResultCache?: boolean;
}

export class ORM {
	private static instance: ORM | null = null;

	private adapter: DatabaseAdapter;
	private dialect: SqlDialect;
	private writeQueue: Promise<any> = Promise.resolve();
	private enableWriteQueue: boolean = false;
	public resultCacheAdapter?: ResultCacheAdapter;
	private disableResultCache: boolean = false;

	private connectionId: string = 'default';

	private constructor(config: ORMConfig) {
		this.adapter = config.adapter;
		this.dialect = config.dialect;
		this.enableWriteQueue = config.enableWriteQueue ?? false;
		this.resultCacheAdapter = config.resultCacheAdapter;
		this.disableResultCache = config.disableResultCache ?? false;
	}

	async cachedSelect(
		sql: string,
		params: any[] = [],
		tables: string[] = [],
	): Promise<DatabaseRow[]> {
		if (
			this.disableResultCache ||
			this.adapter.inTransaction() ||
			!this.resultCacheAdapter
		) {
			return this.adapter.query(sql, params);
		}

		// Row-level cache for primary-key lookups, query-level for the rest.
		const selectStarMatch = sql.match(
			/^SELECT \* FROM ([^ ]+) WHERE (.+)$/i,
		);
		if (selectStarMatch) {
			const table = selectStarMatch[1];
			const where = selectStarMatch[2];
			if (!table)
				throw new Error('Unable to determine table name for caching.');
			if (!where)
				throw new Error(
					'Unable to determine WHERE clause for caching.',
				);

			const eqMatch = where.match(/^id\s*=\s*\?/i);
			const inMatch = where.match(/^id\s+IN\s*\((.+)\)/i);
			if (eqMatch && params.length === 1) {
				const row = this.resultCacheAdapter!.getRowById?.(
					table,
					params[0],
				);
				if (row) return [row];
				const result = await this.adapter.query(sql, params);
				if (result[0])
					this.resultCacheAdapter!.setRowById?.(
						table,
						params[0],
						result[0],
					);
				return result;
			} else if (inMatch) {
				const idParams = params;
				const cachedRows: DatabaseRow[] = [];
				const missingIds: any[] = [];
				for (const id of idParams) {
					const row = this.resultCacheAdapter!.getRowById?.(
						table,
						id,
					);
					if (row) cachedRows.push(row);
					else missingIds.push(id);
				}
				let fetchedRows: DatabaseRow[] = [];
				if (missingIds.length > 0) {
					const qMarks = missingIds.map(() => '?').join(', ');
					const fetchSql = `SELECT * FROM ${table} WHERE id IN (${qMarks})`;
					fetchedRows = await this.adapter.query(
						fetchSql,
						missingIds,
					);
					for (const row of fetchedRows) {
						this.resultCacheAdapter!.setRowById?.(
							table,
							row.id,
							row,
						);
					}
				}
				const idToRow = new Map<any, DatabaseRow>();
				for (const r of cachedRows) idToRow.set(r.id, r);
				for (const r of fetchedRows) idToRow.set(r.id, r);
				return idParams
					.map(id => idToRow.get(id))
					.filter(Boolean) as DatabaseRow[];
			}
		}
		const key = this.makeCacheKey(sql, params);
		const cached = this.resultCacheAdapter!.get<DatabaseRow>(key);
		if (cached) return cached;
		const result = await this.adapter.query(sql, params);
		this.resultCacheAdapter!.set<DatabaseRow>(key, result, tables);
		return result;
	}

	invalidateResultCache(tables: string[]): void {
		if (this.resultCacheAdapter) {
			this.resultCacheAdapter.invalidate(tables);
		}
	}

	/**
	 * Normalises whitespace and case so equivalent SQL shares a cache entry,
	 * and stringifies params with sorted keys so key order cannot split it.
	 */
	private makeCacheKey(sql: string, params: any[]): string {
		const normalizedSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
		const stableStringify = (value: any): string => {
			if (Array.isArray(value)) {
				return '[' + value.map(stableStringify).join(',') + ']';
			} else if (value && typeof value === 'object') {
				return (
					'{' +
					Object.keys(value)
						.sort()
						.map(
							k =>
								JSON.stringify(k) +
								':' +
								stableStringify(value[k]),
						)
						.join(',') +
					'}'
				);
			} else {
				return JSON.stringify(value);
			}
		};
		return `${this.connectionId}|${normalizedSql}|${stableStringify(params)}`;
	}

	setResultCacheDisabled(disabled: boolean): void {
		this.disableResultCache = disabled;
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
