import type { QueryValue } from '../../types';

/** Logs each statement with its bindings written in, when enabled. */
export class StatementLogger {
	constructor(private readonly enabled: boolean) {}

	log(kind: string, sql: string, params?: QueryValue[]): void {
		if (!this.enabled) {
			return;
		}

		console.log(`🔹 [${kind}]:`, StatementLogger.inline(sql, params));
	}

	private static inline(sql: string, params?: QueryValue[]): string {
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
}
