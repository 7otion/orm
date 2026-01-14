/**
 * Record Persistence Mixin
 *
 * Provides database write operations (save, delete) for Model instances.
 */
import { ORM } from '../orm';
export class RecordPersistenceMixin {
    async save() {
        const self = this;
        this.generateSlugIfNeeded();
        if (!self._exists) {
            return this.insert();
        }
        else {
            return this.update();
        }
    }
    generateSlugIfNeeded() {
        const self = this;
        const ModelClass = self.constructor;
        // Check if model has slug property defined
        const hasSlugProperty = 'slug' in self || 'slug' in ModelClass.prototype;
        if (!hasSlugProperty)
            return;
        // Don't overwrite existing slug
        if (self._attributes.slug)
            return;
        // Find source field (name or title)
        const sourceField = self._attributes.name || self._attributes.title;
        if (!sourceField || typeof sourceField !== 'string')
            return;
        // Generate slug
        self._attributes.slug = ModelClass.generateSlug(sourceField);
    }
    async insert() {
        const orm = ORM.getInstance();
        const self = this;
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
            const compiled = dialect.compileInsert(config.table, self._attributes);
            const insertedId = await adapter.insert(compiled.sql, compiled.bindings);
            // Only set auto-increment ID for single primary key
            if (!Array.isArray(config.primaryKey)) {
                self._attributes[config.primaryKey] = insertedId;
            }
            self._exists = true;
            self._original = { ...self._attributes };
            orm.invalidateResultCache([config.table]);
            return this;
        });
    }
    async update() {
        const self = this;
        if (!self._exists) {
            throw new Error('Cannot update a model that does not exist. Use insert() instead.');
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
            const data = {};
            for (const field of dirtyFields) {
                data[field] = self._attributes[field];
            }
            if (timestampConfig) {
                const now = dialect.getCurrentTimestamp();
                data[timestampConfig.updated_at] = now;
                self._attributes[timestampConfig.updated_at] = now;
            }
            // Get primary key value(s)
            const primaryKey = config.primaryKey;
            let id;
            if (Array.isArray(primaryKey)) {
                // Composite primary key
                id = primaryKey.map(key => self._attributes[key]);
            }
            else {
                // Single primary key
                id = self._attributes[primaryKey];
            }
            const compiled = dialect.compileUpdate(config.table, data, primaryKey, id);
            await adapter.execute(compiled.sql, compiled.bindings);
            self._original = { ...self._attributes };
            self.clearRelationships();
            orm.invalidateResultCache([config.table]);
            return this;
        });
    }
    async delete() {
        const self = this;
        if (!self._exists) {
            throw new Error('Cannot delete a model that does not exist.');
        }
        const orm = ORM.getInstance();
        return orm.queueWrite(async () => {
            const dialect = orm.getDialect();
            const adapter = orm.getAdapter();
            const config = self.getConfig();
            // Get primary key value(s)
            const primaryKey = config.primaryKey;
            let id;
            if (Array.isArray(primaryKey)) {
                // Composite primary key
                id = primaryKey.map(key => self._attributes[key]);
            }
            else {
                // Single primary key
                id = self._attributes[primaryKey];
            }
            const compiled = dialect.compileDelete(config.table, primaryKey, id);
            await adapter.execute(compiled.sql, compiled.bindings);
            self._exists = false;
            orm.invalidateResultCache([config.table]);
            return true;
        });
    }
}
//# sourceMappingURL=record-persistence.mixin.js.map