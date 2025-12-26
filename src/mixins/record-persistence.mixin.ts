/**
 * Record Persistence Mixin
 *
 * Provides database write operations (save, delete) for Model instances.
 */

import { ORM } from '../orm';
import type { QueryValue } from '../types';

export class RecordPersistenceMixin {
	async save(): Promise<this> {
		const self = this as any;
		if (!self._exists) {
			return this.insert();
		} else {
			return this.update();
		}
	}

	protected async insert(): Promise<this> {
		const orm = ORM.getInstance();
		const self = this as any;

		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = self.getConfig();
			const timestampConfig = self.getTimestampConfig();

			if (timestampConfig) {
				const now = dialect.getCurrentTimestamp();
				self._attributes[timestampConfig.created_at] = now;
				self._attributes[timestampConfig.updated_at] = now;
			}

			const compiled = dialect.compileInsert(
				config.table,
				self._attributes,
			);

			const insertedId = await adapter.insert(
				compiled.sql,
				compiled.bindings,
			);

			self._attributes[config.primaryKey] = insertedId;
			self._exists = true;
			self._original = { ...self._attributes };

			orm.invalidateResultCache([config.table]);

			return this;
		});
	}

	protected async update(): Promise<this> {
		const self = this as any;
		if (!self._exists) {
			throw new Error(
				'Cannot update a model that does not exist. Use insert() instead.',
			);
		}

		const orm = ORM.getInstance();
		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = self.getConfig();
			const timestampConfig = self.getTimestampConfig();

			const dirtyFields = self.getDirty();

			if (dirtyFields.length === 0) {
				return this;
			}

			const data: Record<string, QueryValue> = {};
			for (const field of dirtyFields) {
				data[field] = self._attributes[field];
			}

			if (timestampConfig) {
				const now = dialect.getCurrentTimestamp();
				data[timestampConfig.updated_at] = now;
				self._attributes[timestampConfig.updated_at] = now;
			}

			const id = self._attributes[config.primaryKey];
			const compiled = dialect.compileUpdate(
				config.table,
				data,
				config.primaryKey,
				id,
			);

			await adapter.execute(compiled.sql, compiled.bindings);

			self._original = { ...self._attributes };
			self.clearRelationships();

			orm.invalidateResultCache([config.table]);

			return this;
		});
	}

	async delete(): Promise<boolean> {
		const self = this as any;
		if (!self._exists) {
			throw new Error('Cannot delete a model that does not exist.');
		}

		const orm = ORM.getInstance();
		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = self.getConfig();

			const id = self._attributes[config.primaryKey];
			const compiled = dialect.compileDelete(
				config.table,
				config.primaryKey,
				id,
			);

			await adapter.execute(compiled.sql, compiled.bindings);

			self._exists = false;

			orm.invalidateResultCache([config.table]);

			return true;
		});
	}
}
