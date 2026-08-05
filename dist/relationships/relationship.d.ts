/**
 * Base for every relationship kind. Subclasses supply `get()` for one parent
 * and `eagerLoadFor()` for a batch, avoiding N+1 queries.
 */
import type { Model, ModelClassRef, ModelStatic } from '../model';
export type RelatedResolver<T extends Model<T>> = ModelStatic<T> | (() => ModelStatic<T>);
export declare abstract class Relationship<T extends Model<T>, TClass = unknown> {
    /**
     * Carries the related class type for RelationPath to recurse into.
     * Never assigned; `declare` emits nothing.
     */
    readonly __relatedClass?: TClass;
    protected parentConstructor: ModelClassRef;
    private _related;
    private _resolvedRelated;
    protected foreignKey: string;
    protected localKey: string;
    protected get related(): ModelStatic<T>;
    constructor(parent: ModelClassRef | Model<any>, related: RelatedResolver<T>, foreignKey?: string, localKey?: string);
    protected getParentKeyValue(parent: Model<any>): any;
    /** Lazy path: load for one parent. */
    abstract get(parent: Model<any>): Promise<T | T[] | null>;
    /** Eager path: load for a batch of parents in one query. */
    abstract eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
    /** Owner columns this relation keys off, used to invalidate its cache. */
    abstract getOwnerFields(): string[];
    getRelated(): ModelStatic<T>;
    getForeignKey(): string;
    getLocalKey(): string;
}
//# sourceMappingURL=relationship.d.ts.map