/** Writes rows the caller supplies, rather than rows a query matched. */

import { ORM } from './orm';
import { QueryBuilder } from './query-builder';
import { KEY_SEPARATOR, dynamicWhere } from './internal';
import type { Transaction } from './transaction';
import type { DatabaseRow } from './types';
import type { Patch } from './columns';
import type { Model, ModelStatic } from './model';

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

	async insert(rows: Patch<T>[], tx?: Transaction): Promise<number> {
		const chunks = this.insertChunks(rows);
		if (chunks.length === 0) return 0;

		const orm = ORM.getInstance();
		const label = `${this.modelClass.name}.createMany()`;

		return orm.queueUnit(
			async unit => {
				await orm.ensureAtomic(unit, chunks.length, label);

				const dialect = orm.getDialect();
				const adapter = orm.getAdapter();
				const table = this.modelClass.getTableName();

				let written = 0;

				for (const chunk of chunks) {
					const compiled = dialect.compileInsertMany(table, chunk);
					written += await adapter.execute(
						compiled.sql,
						compiled.bindings,
					);
				}

				return written;
			},
			tx,
			label,
		);
	}

	/** How many statements `insert` issues for these rows. */
	insertStatementCount(rows: Patch<T>[]): number {
		return this.insertChunks(rows).length;
	}

	async update(models: T[], tx?: Transaction): Promise<T[]> {
		const plan = this.planUpdate(models);
		if (!plan) return models;

		const { pending, keyColumns, set, now, chunks } = plan;
		const timestamps = this.modelClass.timestamps;
		const caster = this.modelClass.casts;

		const orm = ORM.getInstance();
		const label = `${this.modelClass.name}.updateMany()`;

		const written = await orm.queueUnit(
			async unit => {
				await orm.ensureAtomic(unit, chunks.length, label);

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

				return affected;
			},
			tx,
			label,
		);

		// The write has landed by here, so every row that still existed now
		// holds its new values. Only the ones that vanished are unaccounted for.
		const missing =
			written < pending.length
				? await this.findMissing(pending)
				: new Set<T>();

		for (const { model } of pending) {
			if (missing.has(model)) {
				model._exists = false;
				continue;
			}
			if (now && timestamps.columns) {
				model._attributes[timestamps.columns.updated_at] = now;
			}
			model._original = caster.snapshot(model._attributes);
		}

		if (missing.size > 0) {
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

	/** Rows grouped by the columns they set, then split at the dialect's parameter limit. */
	private insertChunks(rows: Patch<T>[]): DatabaseRow[][] {
		if (rows.length === 0) return [];

		const shapes = BulkWriter.byShape(rows.map(data => this.toRow(data)));

		for (const shape of shapes.values()) {
			if (Object.keys(shape[0]!).length > 0) continue;
			throw new Error(
				`[orm] createMany received ${shape.length} ${this.modelClass.name} row(s) with no columns to write. ` +
					`fill() drops undefined values, so a row whose columns are all undefined arrives empty.`,
			);
		}

		const limit = ORM.getInstance().getDialect().maxBindParameters;
		const chunks: DatabaseRow[][] = [];

		for (const shape of shapes.values()) {
			const columnCount = Object.keys(shape[0]!).length;
			const perStatement = limit
				? Math.max(1, Math.floor(limit / Math.max(columnCount, 1)))
				: shape.length;

			for (let i = 0; i < shape.length; i += perStatement) {
				chunks.push(shape.slice(i, i + perStatement));
			}
		}

		return chunks;
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
			const dirty = model
				.getDirty()
				.filter(column => !timestamps.owns(column));
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
			for (const key of keyColumns) {
				row[key] =
					key in model._original
						? model._original[key]
						: model._attributes[key];
			}
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

		const signature = (values: unknown[]): string =>
			values
				.map(value =>
					value instanceof Date
						? String(value.getTime())
						: String(value),
				)
				.join(KEY_SEPARATOR);

		const present = new Set(
			(await query.get()).map(row =>
				signature(keyColumns.map(column => this.keyOf(row, column))),
			),
		);

		const missing = new Set<T>();
		for (const { model } of pending) {
			const key = signature(
				keyColumns.map(column => this.keyOf(model, column)),
			);
			if (!present.has(key)) missing.add(model);
		}

		return missing;
	}

	private keyColumns(): string[] {
		const key = this.modelClass.config.primaryKey ?? 'id';
		return Array.isArray(key) ? key : [key];
	}

	private toRow(data: Patch<T>): DatabaseRow {
		const model = new this.modelClass();
		model.fill(data);

		const timestamps = this.modelClass.timestamps;
		if (timestamps.columns) {
			const now = timestamps.now();
			model._attributes[timestamps.columns.created_at] = now;
			model._attributes[timestamps.columns.updated_at] = now;
		}

		return this.modelClass.casts.toDatabaseValues(model._attributes);
	}

	/** One statement per shape, so a row omitting a column keeps its default. */
	private static byShape(rows: DatabaseRow[]): Map<string, DatabaseRow[]> {
		const shapes = new Map<string, DatabaseRow[]>();

		for (const row of rows) {
			const signature = Object.keys(row).sort().join(KEY_SEPARATOR);
			const shape = shapes.get(signature);
			if (shape) shape.push(row);
			else shapes.set(signature, [row]);
		}

		return shapes;
	}
}
