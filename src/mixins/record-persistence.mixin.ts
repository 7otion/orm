/** save() / delete() for Model instances. */

import { ORM } from '../orm';
import type { QueryValue } from '../types';

import { ModelState } from './model-state.mixin';

export class RecordPersistenceMixin extends ModelState {
	async save(): Promise<this> {
		this.generateSlugIfNeeded();
		if (!this._exists) {
			return this.insert();
		} else {
			return this.update();
		}
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

	protected async insert(): Promise<this> {
		const orm = ORM.getInstance();

		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = this.getConfig();
			const timestampConfig = this.getTimestampConfig();

			if (timestampConfig) {
				const now = dialect.getCurrentTimestamp();
				this._attributes[timestampConfig.created_at] = now;
				this._attributes[timestampConfig.updated_at] = now;
			}

			const compiled = dialect.compileInsert(
				config.table!,
				this._attributes,
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
			this._original = { ...this._attributes };


			return this;
		});
	}

	protected async update(): Promise<this> {
		if (!this._exists) {
			throw new Error(
				'Cannot update a model that does not exist. Use insert() instead.',
			);
		}

		const orm = ORM.getInstance();

		const clearedRelationships = await orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = this.getConfig();
			const timestampConfig = this.getTimestampConfig();

			const dirtyFields = this.getDirty();

			if (dirtyFields.length === 0) {
				return [] as string[];
			}

			const data: Record<string, QueryValue> = {};
			for (const field of dirtyFields) {
				data[field] = this._attributes[field];
			}

			if (timestampConfig) {
				const now = dialect.getCurrentTimestamp();
				data[timestampConfig.updated_at] = now;
				this._attributes[timestampConfig.updated_at] = now;
			}

			// Locate the row by its ORIGINAL key. A reassigned primary key
			// already sits in _attributes, so keying off that would write
			// nothing and report success.
			const primaryKey = config.primaryKey!;
			const keyOf = (key: string): QueryValue =>
				key in this._original
					? this._original[key]
					: this._attributes[key];

			let id: QueryValue | QueryValue[];

			if (Array.isArray(primaryKey)) {
				id = primaryKey.map(keyOf);
			} else {
				id = keyOf(primaryKey);
			}

			const compiled = dialect.compileUpdate(
				config.table!,
				data,
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

			this._original = { ...this._attributes };

			const cleared = this.clearAffectedRelationships(dirtyFields);


			return cleared;
		});

		await Promise.all(clearedRelationships.map(name => this.load(name)));

		return this;
	}

	async delete(): Promise<boolean> {
		if (!this._exists) {
			throw new Error('Cannot delete a model that does not exist.');
		}

		const orm = ORM.getInstance();
		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = this.getConfig();

			const primaryKey = config.primaryKey!;
			let id: QueryValue | QueryValue[];

			if (Array.isArray(primaryKey)) {
				id = primaryKey.map(key => this._attributes[key]);
			} else {
				id = this._attributes[primaryKey];
			}

			const compiled = dialect.compileDelete(
				config.table!,
				primaryKey,
				id,
			);

			await adapter.execute(compiled.sql, compiled.bindings);

			this._exists = false;


			return true;
		});
	}
}
