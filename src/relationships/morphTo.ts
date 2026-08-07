/** Polymorphic: the target model is chosen by a discriminator column. */

import type { Model } from '../model';
import type { ModelConstructor } from '../model';
import { dynamicWhere, getAttribute, setRelation } from '../internal';

export interface MorphToConfig<T extends Model<T>> {
	discriminatorField: string;
	foreignKeyField: string;
	morphMap: Record<string, ModelConstructor<any>>;
}

export class MorphTo<T extends Model<T>> {
	constructor(
		// @ts-ignore
		private parent: any,
		// @ts-ignore
		private config: MorphToConfig<T>,
	) {}

	getOwnerFields(): string[] {
		return [this.config.foreignKeyField, this.config.discriminatorField];
	}

	async get(parent?: Model<any>): Promise<T | null> {
		const instance = parent || this.parent;
		const discriminatorValue = instance[this.config.discriminatorField];
		const foreignKeyValue = instance[this.config.foreignKeyField];

		if (!discriminatorValue || foreignKeyValue === null) {
			return null;
		}

		const RelatedModel = this.config.morphMap[discriminatorValue];
		if (!RelatedModel) {
			console.warn(
				`No model mapped for discriminator value: ${discriminatorValue}`,
			);
			return null;
		}

		return RelatedModel.find(foreignKeyValue);
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		const grouped = new Map<string, Model<any>[]>();

		for (const model of models) {
			const discriminatorValue = getAttribute(
				model,
				this.config.discriminatorField,
			);

			if (!discriminatorValue) {
				setRelation(model, relationName, null);
				continue;
			}

			// morphMap is keyed by string; the column need not be one.
			const kind = String(discriminatorValue);
			if (!grouped.has(kind)) {
				grouped.set(kind, []);
			}
			grouped.get(kind)!.push(model);
		}

		for (const [discriminatorValue, groupedModels] of grouped.entries()) {
			const RelatedModel = this.config.morphMap[discriminatorValue];

			if (!RelatedModel) {
				console.warn(
					`No model mapped for discriminator value: ${discriminatorValue}`,
				);
				for (const model of groupedModels) {
					setRelation(model, relationName, null);
				}
				continue;
			}

			const foreignKeys = groupedModels
				.map(model => getAttribute(model, this.config.foreignKeyField))
				.filter(id => id !== null && id !== undefined);

			if (foreignKeys.length === 0) {
				for (const model of groupedModels) {
					setRelation(model, relationName, null);
				}
				continue;
			}

			const uniqueForeignKeys = [...new Set(foreignKeys)];

			let pk = RelatedModel.config.primaryKey || 'id';
			pk = Array.isArray(pk) ? pk[0]! : pk;

			const relatedModels = await dynamicWhere(RelatedModel.query())
				.where(pk, 'IN', uniqueForeignKeys)
				.get();

			const relatedMap = new Map<any, any>();
			for (const related of relatedModels) {
				const id = getAttribute(related, pk);
				relatedMap.set(id, related);
			}

			for (const model of groupedModels) {
				const foreignKey = getAttribute(
					model,
					this.config.foreignKeyField,
				);
				const related = relatedMap.get(foreignKey) || null;
				setRelation(model, relationName, related);
			}
		}
	}
}
