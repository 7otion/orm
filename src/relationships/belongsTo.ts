/** Inverse of HasOne / HasMany: the foreign key lives on the owner. */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model } from '../model';
import {
	dynamicWhere,
	foreignKeyFor,
	getAttribute,
	isRelationLoaded,
	setRelation,
} from '../internal';

export class BelongsTo<
	T extends Model<T>,
	TClass = unknown,
> extends Relationship<T, TClass> {
	/** The key is on the owner here, so it names the related class, not the parent. */
	protected override defaultForeignKey(): string {
		return foreignKeyFor(this.related.name);
	}

	getOwnerFields(): string[] {
		return [this.foreignKey];
	}

	async get(parent: Model<any>): Promise<T | null> {
		const tableName = this.related.getTableName();

		const query = new QueryBuilder(this.related, tableName);
		const foreignValue = getAttribute(parent, this.foreignKey);
		dynamicWhere(query).where(this.localKey, foreignValue);
		return query.first();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		if (models.every(m => isRelationLoaded(m, relationName))) return;

		const foreignValues = models.map(model =>
			getAttribute(model, this.foreignKey),
		);

		const hasNonNullValue = foreignValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
				if (isRelationLoaded(model, relationName)) continue;
				setRelation(model, relationName, null);
			}
			return;
		}

		const uniqueValues = [...new Set(foreignValues.filter(v => v != null))];

		const tableName = this.related.getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await dynamicWhere(query)
			.where(this.localKey, 'IN', uniqueValues)
			.get();

		const relatedMap = new Map();
		for (const related of relatedModels) {
			const localValue = getAttribute(related, this.localKey);
			relatedMap.set(localValue, related);
		}

		// Partial-load guard, as in HasOne.
		for (const model of models) {
			if (isRelationLoaded(model, relationName)) continue;
			const foreignValue = getAttribute(model, this.foreignKey);
			const related = relatedMap.get(foreignValue) || null;
			setRelation(model, relationName, related);
		}
	}
}
