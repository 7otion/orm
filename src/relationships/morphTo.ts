/**
 * Polymorphic Relationship - MorphTo
 *
 * Allows a model to belong to different model types based on a discriminator field.
 * Example: FileModel → VideoModel | ImageModel | DocumentModel based on file_type
 */

import type { Model } from '../model';
import type { ModelConstructor } from '../model';

export interface MorphToConfig<T extends Model<T>> {
	discriminatorField: string; // e.g., 'file_type'
	foreignKeyField: string; // e.g., 'file_metadata_id'
	morphMap: Record<string, ModelConstructor<any>>; // e.g., { video: VideoModel, image: ImageModel }
}

export class MorphTo<T extends Model<T>> {
	constructor(
		// @ts-ignore
		private parent: any,
		// @ts-ignore
		private config: MorphToConfig<T>,
	) {}

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
		// Group models by discriminator value
		const grouped = new Map<string, Model<any>[]>();

		for (const model of models) {
			const discriminatorValue = (model as any)[
				this.config.discriminatorField
			];

			if (!discriminatorValue) {
				// No discriminator - set null
				(model as any)[`_${relationName}`] = null;
				continue;
			}

			if (!grouped.has(discriminatorValue)) {
				grouped.set(discriminatorValue, []);
			}
			grouped.get(discriminatorValue)!.push(model);
		}

		// For each discriminator type, load all related records
		for (const [discriminatorValue, groupedModels] of grouped.entries()) {
			const RelatedModel = this.config.morphMap[discriminatorValue];

			if (!RelatedModel) {
				console.warn(
					`No model mapped for discriminator value: ${discriminatorValue}`,
				);
				// Set null for models with unknown discriminator
				for (const model of groupedModels) {
					(model as any)[`_${relationName}`] = null;
				}
				continue;
			}

			// Collect all foreign key values for this type
			const foreignKeys = groupedModels
				.map(model => (model as any)[this.config.foreignKeyField])
				.filter(id => id !== null && id !== undefined);

			if (foreignKeys.length === 0) {
				for (const model of groupedModels) {
					(model as any)[`_${relationName}`] = null;
				}
				continue;
			}

			// Deduplicate IDs
			const uniqueForeignKeys = [...new Set(foreignKeys)];

			// Query all related models at once
			const primaryKey = RelatedModel.config.primaryKey || 'id';
			const relatedModels = await RelatedModel.query()
				.where(primaryKey, 'IN', uniqueForeignKeys)
				.get();

			// Create lookup map by primary key
			const relatedMap = new Map<any, any>();
			for (const related of relatedModels) {
				const id = (related as any)[primaryKey];
				relatedMap.set(id, related);
			}

			// Attach related models to parents
			for (const model of groupedModels) {
				const foreignKey = (model as any)[this.config.foreignKeyField];
				const related = relatedMap.get(foreignKey) || null;
				(model as any)[`_${relationName}`] = related;
			}
		}
	}
}
