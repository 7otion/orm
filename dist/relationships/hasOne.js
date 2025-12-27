/**
 * HasOne Relationship
 *
 * Represents a one-to-one relationship.
 */
import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
export class HasOne extends Relationship {
    /**
     * Get the related model for a parent instance
     * Queries with: WHERE foreign_key = parent's local key value LIMIT 1
     */
    async get(parent) {
        const tableName = this.related.getTableName();
        const query = new QueryBuilder(this.related, tableName);
        const localValue = this.getParentKeyValue(parent);
        query.where(this.foreignKey, localValue);
        return query.first();
    }
    async eagerLoadFor(models, relationName) {
        const localValues = models.map(model => model[this.localKey]);
        // Skip if all foreign key values are null/undefined
        const hasNonNullValue = localValues.some(val => val != null);
        if (!hasNonNullValue) {
            for (const model of models) {
                model[`_${relationName}`] = null;
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
        // Map related models back to parents
        // For HasOne, each parent gets at most one related model
        const relatedMap = new Map();
        for (const related of relatedModels) {
            const foreignValue = related[this.foreignKey];
            relatedMap.set(foreignValue, related);
        }
        // Attach related models to parents using _relationshipName pattern
        // This allows getWithSuspense() to access loaded data
        for (const model of models) {
            const localValue = model[this.localKey];
            const related = relatedMap.get(localValue) || null;
            model[`_${relationName}`] = related;
        }
    }
}
//# sourceMappingURL=hasOne.js.map