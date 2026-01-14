/**
 * BelongsTo Relationship
 *
 * Represents a "belongs to" relationship (inverse of HasOne/HasMany).
 */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model } from '../model';

export class BelongsTo<T extends Model<T>> extends Relationship<T> {
	constructor(
		parent: any,
		related: any,
		foreignKey?: string,
		localKey?: string,
	) {
		super(parent, related, foreignKey, localKey);

		// For BelongsTo, the foreign key is on the parent model
		// Override the default inference
		if (!foreignKey) {
			const relatedName = this.related.name
				.replace(/Model$/, '')
				.replace(/([A-Z])/g, '_$1')
				.toLowerCase()
				.replace(/^_/, '');
			this.foreignKey = `${relatedName}_id`;
		}

		if (!localKey) {
			const pk = this.related.config?.primaryKey || 'id';
			// Relationships don't support composite primary keys - use first key
			this.localKey = Array.isArray(pk) ? pk[0]! : pk;
		}
	}

	/**
	 * Get the related model for a parent instance
	 * Queries with: WHERE local_key = parent's foreign key value LIMIT 1
	 */
	async get(parent: Model<any>): Promise<T | null> {
		const tableName = (this.related as any).getTableName();

		const query = new QueryBuilder(this.related, tableName);
		const foreignValue = (parent as any)[this.foreignKey];
		query.where(this.localKey, foreignValue);
		return query.first();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		const foreignValues = models.map(
			model => (model as any)[this.foreignKey],
		);

		// Skip if all foreign key values are null/undefined
		const hasNonNullValue = foreignValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
				(model as any)[`_${relationName}`] = null;
			}
			return;
		}

		// Deduplicate IDs
		const uniqueValues = [...new Set(foreignValues.filter(v => v != null))];

		const tableName = (this.related as any).getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.localKey, 'IN', uniqueValues)
			.get();

		// Map related models back to parents
		// For BelongsTo, each parent gets at most one related model
		const relatedMap = new Map();
		for (const related of relatedModels) {
			const localValue = (related as any)[this.localKey];
			relatedMap.set(localValue, related);
		}

		// Attach related models to parents using _relationshipName pattern
		// This allows getWithSuspense() to access loaded data
		for (const model of models) {
			const foreignValue = (model as any)[this.foreignKey];
			const related = relatedMap.get(foreignValue) || null;
			(model as any)[`_${relationName}`] = related;
		}
	}
}
