/**
 * Polymorphic Relationship - MorphTo
 *
 * Allows a model to belong to different model types based on a discriminator field.
 * Example: FileModel → VideoModel | ImageModel | DocumentModel based on file_type
 */
export class MorphTo {
    constructor(
    // @ts-ignore
    parent, 
    // @ts-ignore
    config) {
        this.parent = parent;
        this.config = config;
    }
    async get(parent) {
        const instance = parent || this.parent;
        const discriminatorValue = instance[this.config.discriminatorField];
        const foreignKeyValue = instance[this.config.foreignKeyField];
        if (!discriminatorValue || foreignKeyValue === null) {
            return null;
        }
        const RelatedModel = this.config.morphMap[discriminatorValue];
        if (!RelatedModel) {
            console.warn(`No model mapped for discriminator value: ${discriminatorValue}`);
            return null;
        }
        return RelatedModel.find(foreignKeyValue);
    }
    async eagerLoadFor(models, relationName) {
        // Group models by discriminator value
        const grouped = new Map();
        for (const model of models) {
            const discriminatorValue = model[this.config.discriminatorField];
            if (!discriminatorValue) {
                // No discriminator - set null
                model[`_${relationName}`] = null;
                continue;
            }
            if (!grouped.has(discriminatorValue)) {
                grouped.set(discriminatorValue, []);
            }
            grouped.get(discriminatorValue).push(model);
        }
        // For each discriminator type, load all related records
        for (const [discriminatorValue, groupedModels] of grouped.entries()) {
            const RelatedModel = this.config.morphMap[discriminatorValue];
            if (!RelatedModel) {
                console.warn(`No model mapped for discriminator value: ${discriminatorValue}`);
                // Set null for models with unknown discriminator
                for (const model of groupedModels) {
                    model[`_${relationName}`] = null;
                }
                continue;
            }
            // Collect all foreign key values for this type
            const foreignKeys = groupedModels
                .map(model => model[this.config.foreignKeyField])
                .filter(id => id !== null && id !== undefined);
            if (foreignKeys.length === 0) {
                for (const model of groupedModels) {
                    model[`_${relationName}`] = null;
                }
                continue;
            }
            // Deduplicate IDs
            const uniqueForeignKeys = [...new Set(foreignKeys)];
            // Query all related models at once
            let pk = RelatedModel.config.primaryKey || 'id';
            // Relationships don't support composite primary keys - use first key
            pk = Array.isArray(pk) ? pk[0] : pk;
            const relatedModels = await RelatedModel.query()
                .where(pk, 'IN', uniqueForeignKeys)
                .get();
            // Create lookup map by primary key
            const relatedMap = new Map();
            for (const related of relatedModels) {
                const id = related[pk];
                relatedMap.set(id, related);
            }
            // Attach related models to parents
            for (const model of groupedModels) {
                const foreignKey = model[this.config.foreignKeyField];
                const related = relatedMap.get(foreignKey) || null;
                model[`_${relationName}`] = related;
            }
        }
    }
}
//# sourceMappingURL=morphTo.js.map