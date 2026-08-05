/** Polymorphic: the target model is chosen by a discriminator column. */
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
    getOwnerFields(): string[];
    get(parent?: Model<any>): Promise<T | null>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=morphTo.d.ts.map