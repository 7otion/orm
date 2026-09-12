/** save() / delete() for Model instances. */

import { ORM } from '../orm';
import type { Transaction } from '../transaction';
import type { DatabaseRow, QueryValue } from '../types';

import { ModelState } from './model-state.mixin';

export class RecordPersistenceMixin extends ModelState {
	/**
	 * The value the row is stored under. A reassigned primary key sits in
	 * `_attributes` while the row still carries the original.
	 */
	private storedKey(key: string): QueryValue {
		return key in this._original
			? this._original[key]
			: this._attributes[key];
	}

	async save(tx?: Transaction): Promise<this> {
		this.generateSlugIfNeeded();
		if (!this._exists) {
			return this.insert(tx);
		} else {
			return this.update(tx);
		}
	}

	/** Names this model in a held-write warning or a missing-handle error. */
	private writeLabel(method: string): string {
		return `${this.constructor?.name ?? 'Model'}.${method}()`;
	}

	protected generateSlugIfNeeded(): void {
		const ModelClass = this.constructor as unknown as {
			prototype: object;
			generateSlug(value: string): string;
		};

		const hasSlugProperty =
			'slug' in this || 'slug' in ModelClass.prototype;
		if (!hasSlugProperty) return;

		if (this._attributes.slug) return;

		const sourceField = this._attributes.name || this._attributes.title;
		if (!sourceField || typeof sourceField !== 'string') return;

		this._attributes.slug = ModelClass.generateSlug(sourceField);
	}

	protected async insert(tx?: Transaction): Promise<this> {
		const orm = ORM.getInstance();

		return orm.queueWrite(
			async () => {
				const dialect = orm.getDialect();
				const adapter = orm.getAdapter();
				const config = this.getConfig();
				const timestamps = this.getTimestamps();

				if (timestamps.columns) {
					const now = timestamps.now();
					this._attributes[timestamps.columns.created_at] = now;
					this._attributes[timestamps.columns.updated_at] = now;
				}

				const compiled = dialect.compileInsert(
					config.table!,
					this.getCaster().toDatabaseValues(this._attributes),
				);

				const insertedId = await adapter.insert(
					compiled.sql,
					compiled.bindings,
				);

				// Only adopt a generated key when none was supplied. Composite
				// keys are always caller-supplied, so they never adopt.
				if (!Array.isArray(config.primaryKey)) {
					const primaryKey = config.primaryKey as string;
					const supplied = this._attributes[primaryKey];
					if (supplied === undefined || supplied === null) {
						this._attributes[primaryKey] = insertedId;
					}
				}
				this._exists = true;
				this._original = this.getCaster().snapshot(this._attributes);

				return this;
			},
			tx,
			this.writeLabel('save'),
		);
	}

	protected async update(tx?: Transaction): Promise<this> {
		if (!this._exists) {
			throw new Error(
				'Cannot update a model that does not exist. Use insert() instead.',
			);
		}

		const orm = ORM.getInstance();

		const clearedRelationships = await orm.queueWrite(
			async () => {
				const dialect = orm.getDialect();
				const adapter = orm.getAdapter();
				const config = this.getConfig();
				const timestamps = this.getTimestamps();

				const dirtyFields = this.getDirty();

				if (dirtyFields.length === 0) {
					return [] as string[];
				}

				// Excluded even when dirty: only a direct `_attributes` write can
				// have made one dirty, and that must not reach the database.
				const data: DatabaseRow = {};
				for (const field of dirtyFields) {
					if (timestamps.owns(field)) continue;
					data[field] = this._attributes[field];
				}

				const now = timestamps.columns ? timestamps.now() : null;
				if (timestamps.columns && now) {
					data[timestamps.columns.updated_at] = now;
				}

				const primaryKey = config.primaryKey!;
				let id: QueryValue | QueryValue[];

				if (Array.isArray(primaryKey)) {
					id = primaryKey.map(key => this.storedKey(key));
				} else {
					id = this.storedKey(primaryKey);
				}

				const compiled = dialect.compileUpdate(
					config.table!,
					this.getCaster().toDatabaseValues(data),
					primaryKey,
					id,
				);

				const affected = await adapter.execute(
					compiled.sql,
					compiled.bindings,
				);

				if (affected === 0) {
					throw new Error(
						`Update affected no rows: no ${config.table} row matches ` +
							`${Array.isArray(primaryKey) ? primaryKey.join('/') : primaryKey} = ` +
							`${Array.isArray(id) ? id.join('/') : String(id)}.`,
					);
				}

				if (timestamps.columns && now) {
					this._attributes[timestamps.columns.updated_at] = now;
					// Set once, at insert; restore whatever the row was loaded with.
					if (timestamps.columns.created_at in this._original) {
						this._attributes[timestamps.columns.created_at] =
							this._original[timestamps.columns.created_at];
					}
				}

				this._original = this.getCaster().snapshot(this._attributes);

				const cleared = this.clearAffectedRelationships(dirtyFields);

				return cleared;
			},
			tx,
			this.writeLabel('save'),
		);

		await Promise.all(clearedRelationships.map(name => this.load(name)));

		return this;
	}

	async delete(tx?: Transaction): Promise<boolean> {
		if (!this._exists) {
			throw new Error('Cannot delete a model that does not exist.');
		}

		const orm = ORM.getInstance();
		return orm.queueWrite(
			async () => {
				const dialect = orm.getDialect();
				const adapter = orm.getAdapter();
				const config = this.getConfig();

				const primaryKey = config.primaryKey!;
				let id: QueryValue | QueryValue[];

				if (Array.isArray(primaryKey)) {
					id = primaryKey.map(key => this.storedKey(key));
				} else {
					id = this.storedKey(primaryKey);
				}

				const compiled = dialect.compileDelete(
					config.table!,
					primaryKey,
					id,
				);

				await adapter.execute(compiled.sql, compiled.bindings);

				this._exists = false;

				return true;
			},
			tx,
			this.writeLabel('delete'),
		);
	}
}
