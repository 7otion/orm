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

		// The key is on the owner here, so inference differs from the base.
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
			this.localKey = Array.isArray(pk) ? pk[0]! : pk;
		}
	}

	getOwnerFields(): string[] {
		return [this.foreignKey];
	}

	async get(parent: Model<any>): Promise<T | null> {
		const tableName = this.related.getTableName();

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

		const uniqueValues = [...new Set(foreignValues.filter(v => v != null))];

		const tableName = this.related.getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.localKey, 'IN', uniqueValues)
			.get();

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
