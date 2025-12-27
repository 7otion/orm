/**
 * HasMany Relationship
 *
 * Represents a one-to-many relationship.
 */
import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
export class HasMany extends Relationship {
    /**
     * Get all related models for a parent instance
     * Queries with: WHERE foreign_key = parent's local key value
     */
    async get(parent) {
        const tableName = this.related.getTableName();
        const query = new QueryBuilder(this.related, tableName);
        const localValue = this.getParentKeyValue(parent);
        query.where(this.foreignKey, localValue);
        return query.get();
    }
    async eagerLoadFor(models, relationName) {
        const localValues = models.map(model => model[this.localKey]);
        // Skip if all foreign key values are null/undefined
        const hasNonNullValue = localValues.some(val => val != null);
        if (!hasNonNullValue) {
            for (const model of models) {
                model[`_${relationName}`] = [];
            }
            return;
        }
        // Deduplicate IDs
        const uniqueValues = [...new Set(localValues.filter(v => v != null))];
        const tableName = this.related.getTableName();
        const query = new QueryBuilder(this.related, tableName);
        const relatedModels = await query
            .where(this.foreignKey, 'IN', uniqueValues)
            .get();
        const relatedMap = new Map();
        for (const related of relatedModels) {
            const foreignValue = related[this.foreignKey];
            if (!relatedMap.has(foreignValue)) {
                relatedMap.set(foreignValue, []);
            }
            relatedMap.get(foreignValue).push(related);
        }
        // Attach related models to parents using _relationshipName pattern
        // This allows getWithSuspense() to access loaded data
        for (const model of models) {
            const localValue = model[this.localKey];
            const related = relatedMap.get(localValue) || [];
            model[`_${relationName}`] = related;
        }
    }
}
//# sourceMappingURL=hasMany.js.map