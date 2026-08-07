/** One-to-many. */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model } from '../model';
import {
	dynamicWhere,
	getAttribute,
	isRelationLoaded,
	setRelation,
} from '../internal';

export class HasMany<T extends Model<T>, TClass = unknown> extends Relationship<
	T,
	TClass
> {
	getOwnerFields(): string[] {
		return [this.localKey];
	}

	async get(parent: Model<any>): Promise<T[]> {
		const tableName = this.related.getTableName();

		const query = new QueryBuilder(this.related, tableName);
		const localValue = this.getParentKeyValue(parent);
		dynamicWhere(query).where(this.foreignKey, localValue);
		return query.get();
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
					setRelation(model, relationName, []);
				}
			}
			return;
		}

		const uniqueValues = [...new Set(localValues.filter(v => v != null))];

		const tableName = this.related.getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await dynamicWhere(query)
			.where(this.foreignKey, 'IN', uniqueValues)
			.get();

		const relatedMap = new Map<any, T[]>();
		for (const related of relatedModels) {
			const foreignValue = getAttribute(related, this.foreignKey);

			if (!relatedMap.has(foreignValue)) {
				relatedMap.set(foreignValue, []);
			}

			relatedMap.get(foreignValue)!.push(related);
		}

		// Partial-load guard: a relation already loaded by an earlier path in
		// the same with() call must not be overwritten.
		for (const model of models) {
			if (isRelationLoaded(model, relationName)) continue;
			const localValue = getAttribute(model, this.localKey);
			setRelation(model, relationName, relatedMap.get(localValue) ?? []);
		}
	}
}
