/**
 * Polymorphic Relationship - MorphTo
 *
 * Allows a model to belong to different model types based on a discriminator field.
 * Example: FileModel → VideoModel | ImageModel | DocumentModel based on file_type
 */
import type { Model } from '../model';
import type { ModelConstructor } from '../model';
export interface MorphToConfig<T extends Model<T>> {
    discriminatorField: string;
    foreignKeyField: string;
    morphMap: Record<string, ModelConstructor<any>>;
}
export declare class MorphTo<T extends Model<T>> {
    private parent;
    private config;
    constructor(parent: any, config: MorphToConfig<T>);
    get(parent?: Model<any>): Promise<T | null>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=morphTo.d.ts.map