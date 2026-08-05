/** One-to-one. */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model } from '../model';
import { getAttribute, isRelationLoaded, setRelation } from '../internal';

export class HasOne<T extends Model<T>, TClass = unknown> extends Relationship<
	T,
	TClass
> {
	getOwnerFields(): string[] {
		return [this.localKey];
	}

	async get(parent: Model<any>): Promise<T | null> {
		const tableName = this.related.getTableName();

		const query = new QueryBuilder(this.related, tableName);
		const localValue = this.getParentKeyValue(parent);
		query.where(this.foreignKey, localValue);
		return query.first();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		if (models.every(m => isRelationLoaded(m, relationName))) return;

		const localValues = models.map(model =>
			getAttribute(model, this.localKey),
		);

		const hasNonNullValue = localValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
				if (!isRelationLoaded(model, relationName)) {
					setRelation(model, relationName, null);
				}
			}
			return;
		}

		const uniqueValues = [...new Set(localValues.filter(v => v != null))];

		const tableName = this.related.getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.foreignKey, 'IN', uniqueValues)
			.get();

		const relatedMap = new Map();
		for (const related of relatedModels) {
			const foreignValue = getAttribute(related, this.foreignKey);
			relatedMap.set(foreignValue, related);
		}

		// Partial-load guard, as in HasMany.
		for (const model of models) {
			if (isRelationLoaded(model, relationName)) continue;
			const localValue = getAttribute(model, this.localKey);
			setRelation(
				model,
				relationName,
				relatedMap.get(localValue) ?? null,
			);
		}
	}
}
