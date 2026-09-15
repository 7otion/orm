/** Writes rows the caller supplies, rather than rows a query matched. */

import { ORM } from './orm';
import { QueryBuilder } from './query-builder';
import { INSERT_EVENTS, UPDATE_EVENTS } from './events';
import {
	KEY_SEPARATOR,
	dynamicWhere,
	keySignature,
	primaryKeyColumns,
} from './internal';
import type { Transaction } from './transaction';
import type { DatabaseRow } from './types';
import type { Patch } from './columns';
import type { Model, ModelStatic } from './model';

/** Models sharing one statement, with their rows in the same order. */
type Chunk<T> = { models: T[]; rows: DatabaseRow[] };

type PendingUpdate<T> = { model: T; row: DatabaseRow };

type UpdatePlan<T> = {
	pending: PendingUpdate<T>[];
	keyColumns: string[];
	set: DatabaseRow;
	now: Date | null;
	chunks: PendingUpdate<T>[][];
};

export class BulkWriter<T extends Model<T>> {
	constructor(private readonly modelClass: ModelStatic<T>) {}

	async insert(rows: Patch<T>[], tx?: Transaction): Promise<T[]> {
		if (rows.length === 0) return [];

		const models = rows.map(data => this.build(data));

		const orm = ORM.getInstance();
		const events = this.modelClass.events;
		const label = `${this.modelClass.name}.createMany()`;

		return orm.queueUnit(
			async unit => {
				await events.prepare(INSERT_EVENTS, unit, label);
				await events.fire('saving', models, unit);
				await events.fire('creating', models, unit);

				// Chunked after the hooks, which may have changed a row's shape.
				const chunks = this.insertChunks(models);
				await orm.ensureAtomic(unit, chunks.length, label);

				const changes = events.captureFor(['created', 'saved'], models);

				for (const chunk of chunks) {
					await this.insertChunk(chunk);
				}

				const caster = this.modelClass.casts;
				for (const model of models) {
					model._exists = true;
					model._original = caster.snapshot(model._attributes);
				}

				await events.fire('created', models, unit, changes);
				await events.fire('saved', models, unit, changes);

				return models;
			},
			tx,
			label,
		);
	}

	/** How many statements `insert` issues for these rows. */
	insertStatementCount(rows: Patch<T>[]): number {
		return this.insertChunks(rows.map(data => this.build(data))).length;
	}

	async update(models: T[], tx?: Transaction): Promise<T[]> {
		const pending = models.filter(
			model => this.pendingColumns(model).length > 0,
		);
		if (pending.length === 0) return models;

		const orm = ORM.getInstance();
		const events = this.modelClass.events;
		const timestamps = this.modelClass.timestamps;
		const caster = this.modelClass.casts;
		const label = `${this.modelClass.name}.updateMany()`;

		const missing = await orm.queueUnit(
			async unit => {
				await events.prepare(UPDATE_EVENTS, unit, label);
				await events.fire('saving', pending, unit);
				await events.fire('updating', pending, unit);

				// Planned after the hooks, which may have changed what is pending.
				const plan = this.planUpdate(models);
				if (!plan) return new Set<T>();

				const { keyColumns, set, now, chunks } = plan;
				const written = plan.pending;

				await orm.ensureAtomic(unit, chunks.length, label);

				const changes = events.captureFor(
					['updated', 'saved'],
					written.map(({ model }) => model),
				);

				const dialect = orm.getDialect();
				const adapter = orm.getAdapter();
				const table = this.modelClass.getTableName();

				let affected = 0;

				for (const chunk of chunks) {
					const compiled = dialect.compileUpdateMany(
						table,
						chunk.map(({ row }) => row),
						keyColumns,
						set,
					);
					affected += await adapter.execute(
						compiled.sql,
						compiled.bindings,
					);
				}

				// Only rows that vanished are unaccounted for.
				const missing =
					affected < written.length
						? await this.findMissing(written)
						: new Set<T>();

				for (const { model } of written) {
					if (missing.has(model)) {
						model._exists = false;
						continue;
					}
					if (now && timestamps.columns) {
						model._attributes[timestamps.columns.updated_at] = now;
					}
					model._original = caster.snapshot(model._attributes);
				}

				const landed = written
					.map(({ model }) => model)
					.filter(model => !missing.has(model));

				await events.fire('updated', landed, unit, changes);
				await events.fire('saved', landed, unit, changes);

				return missing;
			},
			tx,
			label,
		);

		if (missing.size > 0) {
			const keyColumns = this.keyColumns();
			const keys = [...missing]
				.map(model =>
					keyColumns
						.map(column => String(this.keyOf(model, column)))
						.join('/'),
				)
				.join(', ');

			throw new Error(
				`[orm] ${missing.size} of ${pending.length} ${this.modelClass.getTableName()} rows no longer exist, ` +
					`so their changes were not written: ${keys}. The rest were.`,
			);
		}

		return models;
	}

	/** How many statements `update` issues for these models' pending changes. */
	updateStatementCount(models: T[]): number {
		return this.planUpdate(models)?.chunks.length ?? 0;
	}

	/** One statement; generated keys come back through RETURNING and are matched by rowid. */
	private async insertChunk({ models, rows }: Chunk<T>): Promise<void> {
		const orm = ORM.getInstance();
		const dialect = orm.getDialect();
		const adapter = orm.getAdapter();
		const table = this.modelClass.getTableName();

		const generated = this.generatedKey(rows[0]!);

		if (!generated) {
			const compiled = dialect.compileInsertMany(table, rows);
			await adapter.execute(compiled.sql, compiled.bindings);
			return;
		}

		const compiled = dialect.compileInsertMany(table, rows, [generated]);

		let returned: DatabaseRow[];
		try {
			returned = await adapter.query(compiled.sql, compiled.bindings);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			if (/rowid/i.test(message)) {
				throw new Error(
					`[orm] ${table} has no rowid, so createMany cannot match generated ` +
						`${generated} values back to its rows. Supply ${generated} in each row.`,
				);
			}
			throw error;
		}

		if (returned.length !== models.length) {
			throw new Error(
				`[orm] Inserting ${models.length} ${table} rows returned ${returned.length} keys.`,
			);
		}

		// Within one statement rowids ascend in insertion order; RETURNING
		// itself promises no order.
		const ordered = [...returned].sort(
			(a, b) => Number(a.rowid) - Number(b.rowid),
		);
		ordered.forEach((row, index) => {
			models[index]!._attributes[generated] = row[generated];
		});
	}

	/** The single key column a row leaves to the database, if any. Composite keys are always supplied. */
	private generatedKey(row: DatabaseRow): string | null {
		const key = this.modelClass.config.primaryKey ?? 'id';
		if (Array.isArray(key)) return null;
		return row[key] === undefined || row[key] === null ? key : null;
	}

	/** Models grouped by the columns they set, then split at the dialect's parameter limit. */
	private insertChunks(models: T[]): Chunk<T>[] {
		const caster = this.modelClass.casts;
		const shapes = new Map<string, Chunk<T>>();

		for (const model of models) {
			const row = caster.toDatabaseValues(model._attributes);
			const columns = Object.keys(row);

			if (columns.length === 0) {
				throw new Error(
					`[orm] createMany received a ${this.modelClass.name} row with no columns to write. ` +
						`fill() drops undefined values, so a row whose columns are all undefined arrives empty.`,
				);
			}

			const signature = columns.sort().join(KEY_SEPARATOR);
			const shape = shapes.get(signature);
			if (shape) {
				shape.models.push(model);
				shape.rows.push(row);
			} else {
				shapes.set(signature, { models: [model], rows: [row] });
			}
		}

		const limit = ORM.getInstance().getDialect().maxBindParameters;
		const chunks: Chunk<T>[] = [];

		for (const shape of shapes.values()) {
			const columnCount = Object.keys(shape.rows[0]!).length;
			const perStatement = limit
				? Math.max(1, Math.floor(limit / Math.max(columnCount, 1)))
				: shape.rows.length;

			for (let i = 0; i < shape.rows.length; i += perStatement) {
				chunks.push({
					models: shape.models.slice(i, i + perStatement),
					rows: shape.rows.slice(i, i + perStatement),
				});
			}
		}

		return chunks;
	}

	private pendingColumns(model: T): string[] {
		const timestamps = this.modelClass.timestamps;
		return model.getDirty().filter(column => !timestamps.owns(column));
	}

	/** `null` when no model has anything pending. */
	private planUpdate(models: T[]): UpdatePlan<T> | null {
		if (models.length === 0) return null;

		const timestamps = this.modelClass.timestamps;
		const caster = this.modelClass.casts;
		const keyColumns = this.keyColumns();
		const now = timestamps.columns ? timestamps.now() : null;

		const pending: PendingUpdate<T>[] = [];

		for (const model of models) {
			const dirty = this.pendingColumns(model);
			if (dirty.length === 0) continue;

			const reassigned = dirty.find(column =>
				keyColumns.includes(column),
			);
			if (reassigned) {
				throw new Error(
					`Cannot reassign "${reassigned}" in bulk; save() that model instead.`,
				);
			}

			// Located by the ORIGINAL key, as a single update is.
			const row: DatabaseRow = {};
			for (const key of keyColumns) row[key] = this.keyOf(model, key);
			for (const column of dirty) row[column] = model._attributes[column];

			pending.push({ model, row: caster.toDatabaseValues(row) });
		}

		if (pending.length === 0) return null;

		const columns = new Set(pending.flatMap(({ row }) => Object.keys(row)));
		for (const key of keyColumns) columns.delete(key);

		const set: DatabaseRow =
			now && timestamps.columns
				? caster.toDatabaseValues({
						[timestamps.columns.updated_at]: now,
					})
				: {};

		const perRow =
			columns.size * (keyColumns.length + 1) + keyColumns.length;
		const limit = ORM.getInstance().getDialect().maxBindParameters;
		const perStatement = limit
			? Math.max(
					1,
					Math.floor(
						(limit - Object.keys(set).length) / Math.max(perRow, 1),
					),
				)
			: pending.length;

		const chunks: PendingUpdate<T>[][] = [];
		for (let i = 0; i < pending.length; i += perStatement) {
			chunks.push(pending.slice(i, i + perStatement));
		}

		return { pending, keyColumns, set, now, chunks };
	}

	/** The value the row is stored under, as `save()` locates it. */
	private keyOf(model: T, column: string): unknown {
		return column in model._original
			? model._original[column]
			: model._attributes[column];
	}

	/** Which models no longer have a row. One query, on the failure path only. */
	private async findMissing(pending: PendingUpdate<T>[]): Promise<Set<T>> {
		const keyColumns = this.keyColumns();
		const query = new QueryBuilder<T>(
			this.modelClass,
			this.modelClass.getTableName(),
		);

		if (keyColumns.length === 1) {
			const column = keyColumns[0]!;
			dynamicWhere(query).where(
				column,
				'IN',
				pending.map(({ model }) => this.keyOf(model, column)),
			);
		} else {
			query.where(group => {
				for (const { model } of pending) {
					group.orWhere(match => {
						for (const column of keyColumns) {
							dynamicWhere(match).where(
								column,
								this.keyOf(model, column),
							);
						}
					});
				}
			});
		}

		const present = new Set(
			(await query.get()).map(row =>
				keySignature(keyColumns.map(column => this.keyOf(row, column))),
			),
		);

		const missing = new Set<T>();
		for (const { model } of pending) {
			const key = keySignature(
				keyColumns.map(column => this.keyOf(model, column)),
			);
			if (!present.has(key)) missing.add(model);
		}

		return missing;
	}

	private keyColumns(): string[] {
		return primaryKeyColumns(this.modelClass.config);
	}

	/** A model filled and stamped as `create()` would, not yet written. */
	private build(data: Patch<T>): T {
		const model = new this.modelClass();
		model.fill(data);

		const timestamps = this.modelClass.timestamps;
		if (timestamps.columns) {
			const now = timestamps.now();
			model._attributes[timestamps.columns.created_at] = now;
			model._attributes[timestamps.columns.updated_at] = now;
		}

		return model;
	}
}
