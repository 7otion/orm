/** One-to-many where the child table serves several owner types. */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model, ModelClassRef } from '../model';
import type { RelatedResolver } from './relationship';
import {
	dynamicWhere,
	getAttribute,
	isRelationLoaded,
	setRelation,
} from '../internal';

export interface MorphManyConfig {
	/** Column on the related table naming the owner type. */
	discriminatorField: string;
	/** Value that column holds for this owner. */
	discriminatorValue: string;
	/** Column on the related table pointing back at the owner. */
	foreignKey: string;
	/** Column on the owner the foreign key refers to. Defaults to its key. */
	localKey?: string;
}

/**
 * The inverse of MorphTo.
 *
 * A plain `hasMany` against a shared child table matches on the foreign key
 * alone, so two owners of different types that happen to share a key value
 * collect each other's rows. This filters on the discriminator as well.
 */
export class MorphMany<
	T extends Model<T>,
	TClass = unknown,
> extends Relationship<T, TClass> {
	private discriminatorField: string;
	private discriminatorValue: string;

	constructor(
		parent: ModelClassRef | Model<any>,
		related: RelatedResolver<T>,
		config: MorphManyConfig,
	) {
		super(parent, related, config.foreignKey, config.localKey);
		this.discriminatorField = config.discriminatorField;
		this.discriminatorValue = config.discriminatorValue;
	}

	getOwnerFields(): string[] {
		return [this.localKey];
	}

	/** Scopes a query to this owner type. */
	private scoped(): QueryBuilder<T> {
		return dynamicWhere(
			new QueryBuilder<T>(this.related, this.related.getTableName()),
		).where(this.discriminatorField, this.discriminatorValue);
	}

	async get(parent: Model<any>): Promise<T[]> {
		return dynamicWhere(this.scoped())
			.where(this.foreignKey, this.getParentKeyValue(parent))
			.get();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		if (models.every(m => isRelationLoaded(m, relationName))) return;

		const localValues = models.map(model =>
			getAttribute(model, this.localKey),
		);

		if (!localValues.some(value => value != null)) {
			for (const model of models) {
				if (!isRelationLoaded(model, relationName)) {
					setRelation(model, relationName, []);
				}
			}
			return;
		}

		const uniqueValues = [...new Set(localValues.filter(v => v != null))];

		const relatedModels = await dynamicWhere(this.scoped())
			.where(this.foreignKey, 'IN', uniqueValues)
			.get();

		const relatedMap = new Map<unknown, T[]>();
		for (const related of relatedModels) {
			const foreignValue = getAttribute(related, this.foreignKey);
			if (!relatedMap.has(foreignValue)) {
				relatedMap.set(foreignValue, []);
			}
			relatedMap.get(foreignValue)!.push(related);
		}

		// Partial-load guard, as in HasMany.
		for (const model of models) {
			if (isRelationLoaded(model, relationName)) continue;
			const localValue = getAttribute(model, this.localKey);
			setRelation(model, relationName, relatedMap.get(localValue) ?? []);
		}
	}

	getDiscriminatorField(): string {
		return this.discriminatorField;
	}

	getDiscriminatorValue(): string {
		return this.discriminatorValue;
	}
}
