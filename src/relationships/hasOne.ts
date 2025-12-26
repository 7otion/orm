/**
 * HasOne Relationship
 *
 * Represents a one-to-one relationship.
 */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model } from '../model';

export class HasOne<T extends Model<T>> extends Relationship<T> {
	/**
	 * Get the related model for a parent instance
	 * Queries with: WHERE foreign_key = parent's local key value LIMIT 1
	 */
	async get(parent: Model<any>): Promise<T | null> {
		const tableName = (this.related as any).getTableName();

		const query = new QueryBuilder(this.related, tableName);
		const localValue = this.getParentKeyValue(parent);
		query.where(this.foreignKey, localValue);
		return query.first();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		const localValues = models.map(model => (model as any)[this.localKey]);

		// Skip if all foreign key values are null/undefined
		const hasNonNullValue = localValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
				(model as any)[`_${relationName}`] = null;
			}
			return;
		}

		// Deduplicate IDs
		const uniqueValues = [...new Set(localValues.filter(v => v != null))];

		const tableName = (this.related as any).getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.foreignKey, 'IN', uniqueValues)
			.get();

		// Map related models back to parents
		// For HasOne, each parent gets at most one related model
		const relatedMap = new Map();
		for (const related of relatedModels) {
			const foreignValue = (related as any)[this.foreignKey];
			relatedMap.set(foreignValue, related);
		}

		// Attach related models to parents using _relationshipName pattern
		// This allows getWithSuspense() to access loaded data
		for (const model of models) {
			const localValue = (model as any)[this.localKey];
			const related = relatedMap.get(localValue) || null;
			(model as any)[`_${relationName}`] = related;
		}
	}
}
