/**
 * The database connection abstraction. Adapters execute SQL and manage
 * transactions; they never generate SQL or know about models.
 */

import type { DatabaseRow, QueryValue } from './types';

export interface DatabaseAdapter {
	query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]>;

	/** Returns the number of affected rows. */
	execute(sql: string, params?: QueryValue[]): Promise<number>;

	/** Returns the new row's id. */
	insert(sql: string, params?: QueryValue[]): Promise<number>;

	beginTransaction(): Promise<void>;

	commit(): Promise<void>;

	rollback(): Promise<void>;

	/** Used to suppress result caching and to detect nested transactions. */
	inTransaction(): boolean;

	/**
	 * Release the connection. The adapter must be re-initialised before reuse.
	 * Adapters without an explicit connection may no-op.
	 */
	close(): Promise<void>;
}
