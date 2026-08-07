/** Inverse of HasOne / HasMany: the foreign key lives on the owner. */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model } from '../model';
import { dynamicWhere, getAttribute, setRelation } from '../internal';

export class BelongsTo<
	T extends Model<T>,
	TClass = unknown,
> extends Relationship<T, TClass> {
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
		const foreignValue = getAttribute(parent, this.foreignKey);
		dynamicWhere(query).where(this.localKey, foreignValue);
		return query.first();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		const foreignValues = models.map(model =>
			getAttribute(model, this.foreignKey),
		);

		const hasNonNullValue = foreignValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
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

		for (const model of models) {
			const foreignValue = getAttribute(model, this.foreignKey);
			const related = relatedMap.get(foreignValue) || null;
			setRelation(model, relationName, related);
		}
	}
}
