import type { DatabaseRow, ModelConfig, TimestampConfig } from './types';

/** A model's timestamp columns, which the ORM writes and the caller cannot. */
export class Timestamps {
	/** Column names, or `null` when the model disables timestamps. */
	readonly columns: TimestampConfig | null;

	private readonly owned: ReadonlySet<string>;

	constructor(declaration: ModelConfig['timestamps']) {
		if (declaration === undefined || declaration === false) {
			this.columns = null;
		} else if (declaration === true) {
			this.columns = {
				created_at: 'created_at',
				updated_at: 'updated_at',
			};
		} else {
			this.columns = declaration;
		}

		this.owned = this.columns
			? new Set([this.columns.created_at, this.columns.updated_at])
			: new Set();
	}

	get enabled(): boolean {
		return this.columns !== null;
	}

	owns(column: string): boolean {
		return this.owned.has(column);
	}

	/** Caller data with the timestamp columns dropped, silently as `guarded` is. */
	strip(data: DatabaseRow): DatabaseRow {
		if (this.owned.size === 0) return data;

		const out: DatabaseRow = {};
		for (const [key, value] of Object.entries(data)) {
			if (this.owned.has(key)) continue;
			out[key] = value;
		}
		return out;
	}

	/** Truncated to the whole second the column stores, so the in-memory value
	 * matches the persisted one. */
	now(): Date {
		return new Date(Math.floor(Date.now() / 1000) * 1000);
	}
}
