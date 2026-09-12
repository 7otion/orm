/** Reconciles the set of rows on the far side of a to-many relation. */

import { ORM } from './orm';
import { HasMany } from './relationships/hasMany';
import { MorphMany } from './relationships/morphMany';
import {
	KEY_SEPARATOR,
	clearRelation,
	dynamicWhere,
	getAttribute,
} from './internal';
import type { Model, ModelStatic } from './model';
import type { QueryBuilder } from './query-builder';
import type { DatabaseRow } from './types';
import type { Transaction } from './transaction';

/** A member's identity: the columns given, or one bare value for a single column. */
export type RelationMember = DatabaseRow | string | number;

export interface RelationWriteOptions {
	/**
	 * Columns that decide whether two rows are the same member. Defaults to the
	 * related model's key columns, less the foreign key.
	 */
	matchOn?: string[];
}

export interface SyncResult {
	attached: number;
	detached: number;
	updated: number;
	unchanged: number;
}

type ToMany<T extends Model<T>> = HasMany<T> | MorphMany<T>;

/** The statics this writer calls, which `ModelStatic` deliberately omits. */
type WritableClass<T extends Model<T>> = ModelStatic<T> & {
	query(): QueryBuilder<T>;
	createMany(rows: DatabaseRow[], tx?: Transaction): Promise<number>;
	updateMany(models: T[], tx?: Transaction): Promise<T[]>;
};

export class RelationWriter<T extends Model<T>> {
	constructor(
		private readonly parent: Model<any>,
		private readonly name: string,
		private readonly relation: ToMany<T>,
	) {}

	/**
	 * Makes the far side hold exactly these rows: missing ones are created,
	 * absent ones deleted, and matched ones updated where they differ. Rows that
	 * are already right are left alone. One transaction.
	 */
	async sync(
		members: RelationMember[],
		options: RelationWriteOptions = {},
		tx?: Transaction,
	): Promise<SyncResult> {
		const match = this.matchColumns(options.matchOn);
		const incoming = members.map(member => this.toRow(member, match));

		// The diff is taken inside the unit, so writes queued ahead of it are seen.
		const result = await ORM.getInstance().transaction(
			async handle => {
				const existing = await this.load();
				const byKey = new Map(
					existing.map(model => [this.keyOf(model, match), model]),
				);

				const create: DatabaseRow[] = [];
				const update: T[] = [];
				const seen = new Set<string>();
				let unchanged = 0;

				for (const row of incoming) {
					const key = this.identity(row, match);
					seen.add(key);

					const current = byKey.get(key);
					if (!current) {
						create.push(this.own(row));
						continue;
					}

					const changed = this.applyTo(current, row, match);
					if (changed) update.push(current);
					else unchanged++;
				}

				const remove = existing.filter(
					model => !seen.has(this.keyOf(model, match)),
				);

				if (remove.length > 0) {
					await this.matching(
						remove.map(model => this.rowOf(model, match)),
						match,
					).delete(handle);
				}
				if (create.length > 0) {
					await this.related().createMany(create, handle);
				}
				if (update.length > 0) {
					await this.related().updateMany(update, handle);
				}

				return {
					attached: create.length,
					detached: remove.length,
					updated: update.length,
					unchanged,
				};
			},
			tx,
			`${this.parent.constructor.name}.relation('${this.name}').sync()`,
		);

		this.invalidate();

		return result;
	}

	/* ── internals ──────────────────────────────────────────────────────── */

	private related(): WritableClass<T> {
		return this.relation.getRelated() as unknown as WritableClass<T>;
	}

	/** The columns tying a row to this parent: the foreign key, plus a morph's type. */
	private own(row: DatabaseRow): DatabaseRow {
		const owned: DatabaseRow = {
			...row,
			[this.relation.getForeignKey()]: this.parentKey(),
		};

		if (this.relation instanceof MorphMany) {
			owned[this.relation.getDiscriminatorField()] =
				this.relation.getDiscriminatorValue();
		}

		return owned;
	}

	private parentKey(): unknown {
		const value = getAttribute(this.parent, this.relation.getLocalKey());
		if (value === undefined || value === null) {
			throw new Error(
				`[orm] Cannot write '${this.name}': ${this.parent.constructor.name}.` +
					`${this.relation.getLocalKey()} has no value, so nothing can point at it.`,
			);
		}
		return value;
	}

	private matchColumns(explicit?: string[]): string[] {
		if (explicit && explicit.length > 0) return explicit;

		const key = this.related().config.primaryKey ?? 'id';
		const keys = Array.isArray(key) ? key : [key];
		const derived = keys.filter(
			column => column !== this.relation.getForeignKey(),
		);

		if (derived.length === 0) {
			throw new Error(
				`[orm] Cannot tell members of '${this.name}' apart: its key is the ` +
					`foreign key alone. Pass matchOn with the columns that identify one.`,
			);
		}

		return derived;
	}

	/** A bare value is the single match column; anything else is already a row. */
	private toRow(member: RelationMember, match: string[]): DatabaseRow {
		if (typeof member === 'object' && member !== null) {
			for (const column of match) {
				if (member[column] !== undefined) continue;
				throw new Error(
					`[orm] A '${this.name}' member is missing '${column}', which identifies it. ` +
						`Pass matchOn to identify members by other columns.`,
				);
			}
			return member;
		}

		if (match.length !== 1) {
			throw new Error(
				`[orm] '${this.name}' identifies a member by ${match.join(', ')}, ` +
					`so members must be objects, not bare values.`,
			);
		}

		return { [match[0]!]: member };
	}

	private identity(row: DatabaseRow, match: string[]): string {
		return match.map(column => String(row[column])).join(KEY_SEPARATOR);
	}

	private keyOf(model: T, match: string[]): string {
		return match
			.map(column => String(getAttribute(model, column)))
			.join(KEY_SEPARATOR);
	}

	private rowOf(model: T, match: string[]): DatabaseRow {
		const row: DatabaseRow = {};
		for (const column of match) row[column] = getAttribute(model, column);
		return row;
	}

	/** Copies a row's non-identity columns onto a model; reports whether any moved. */
	private applyTo(model: T, row: DatabaseRow, match: string[]): boolean {
		const identity = new Set([...match, this.relation.getForeignKey()]);
		const target = model as unknown as DatabaseRow;
		let changed = false;

		for (const [column, value] of Object.entries(row)) {
			if (identity.has(column)) continue;
			if (target[column] === value) continue;
			target[column] = value;
			changed = true;
		}

		return changed;
	}

	private load(): Promise<T[]> {
		return this.scoped().get();
	}

	/** This parent's rows, narrowed to the members given. */
	private matching(
		rows: DatabaseRow[] | undefined,
		match: string[],
	): QueryBuilder<T> {
		const query = this.scoped();

		if (rows) {
			if (match.length === 1) {
				const column = match[0]!;
				dynamicWhere(query).where(
					column,
					'IN',
					rows.map(row => row[column]),
				);
			} else {
				query.where(group => {
					for (const row of rows) {
						group.orWhere(member => {
							for (const column of match) {
								dynamicWhere(member).where(column, row[column]);
							}
						});
					}
				});
			}
		}

		return query;
	}

	/** Every row belonging to this parent, and no other. */
	private scoped() {
		const query = this.related().query();

		dynamicWhere(query).where(
			this.relation.getForeignKey(),
			this.parentKey(),
		);

		if (this.relation instanceof MorphMany) {
			dynamicWhere(query).where(
				this.relation.getDiscriminatorField(),
				this.relation.getDiscriminatorValue(),
			);
		}

		return query;
	}

	/** The loaded relation is now stale, so the next read reloads it. */
	private invalidate(): void {
		clearRelation(this.parent, this.name);
	}
}

/** Narrows a relation to one whose far side is a writable set. */
export function toManyRelation<T extends Model<T>>(
	relation: unknown,
	name: string,
): ToMany<T> {
	if (relation instanceof HasMany || relation instanceof MorphMany) {
		return relation as ToMany<T>;
	}

	throw new Error(
		`[orm] '${name}' is not a to-many relation, so it has no set to sync. ` +
			`sync() is for hasMany and morphMany.`,
	);
}
