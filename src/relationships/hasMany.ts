/**
 * HasMany Relationship
 *
 * Represents a one-to-many relationship.
 */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model } from '../model';

export class HasMany<T extends Model<T>> extends Relationship<T> {
	getOwnerFields(): string[] {
		return [this.localKey];
	}

	async get(parent: Model<any>): Promise<T[]> {
		const tableName = this.related.getTableName();

		const query = new QueryBuilder(this.related, tableName);
		const localValue = this.getParentKeyValue(parent);
		query.where(this.foreignKey, localValue);
		return query.get();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		const privateKey = `_${relationName}`;

		if (models.every(m => (m as any)[privateKey] !== undefined)) return;

		const localValues = models.map(model => (model as any)[this.localKey]);

		// Skip if all foreign key values are null/undefined
		const hasNonNullValue = localValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
				if ((model as any)[privateKey] === undefined) {
					(model as any)[privateKey] = [];
				}
			}
			return;
		}

		const uniqueValues = [...new Set(localValues.filter(v => v != null))];

		const tableName = (this.related as any).getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.foreignKey, 'IN', uniqueValues)
			.get();

		const relatedMap = new Map<any, T[]>();
		for (const related of relatedModels) {
			const foreignValue = (related as any)[this.foreignKey];

			if (!relatedMap.has(foreignValue)) {
				relatedMap.set(foreignValue, []);
			}

			relatedMap.get(foreignValue)!.push(related);
		}

		// Attach related models to parents using _relationshipName pattern
		// This allows getWithSuspense() to access loaded data.
		// Skip models that already have this relation set (partial-load guard).
		for (const model of models) {
			if ((model as any)[privateKey] !== undefined) continue;
			const localValue = (model as any)[this.localKey];
			(model as any)[privateKey] = relatedMap.get(localValue) ?? [];
		}
	}
}
