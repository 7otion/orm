/**
 * Base Relationship Class
 *
 * All relationship types (HasOne, HasMany, BelongsToMany, MorphTo) extend this class.
 *
 * Key Responsibilities:
 * - Define how to load related records (lazy loading)
 * - Define how to eager load for multiple parent models
 *
 * Relationship Pattern:
 * - Relationships are accessed as properties: user.posts
 * - Lazy loading: triggered by Proxy when property is accessed
 * - Eager loading: use with() on the parent query
 */
import type { Model, ModelConstructor } from '../model';
type RelatedResolver<T extends Model<T>> = ModelConstructor<T> | (() => ModelConstructor<T>);
export declare abstract class Relationship<T extends Model<T>> {
    protected parentConstructor: ModelConstructor<any>;
    private _related;
    private _resolvedRelated;
    protected foreignKey: string;
    protected localKey: string;
    protected get related(): ModelConstructor<T>;
    constructor(parent: ModelConstructor<any> | Model<any>, related: RelatedResolver<T>, foreignKey?: string, localKey?: string);
    protected getParentKeyValue(parent: Model<any>): any;
    /**
     * Get related model(s) for a parent instance
     * This is called by loadRelationship() during lazy loading
     *
     * @param parent - The parent model instance
     * @returns The related model(s)
     */
    abstract get(parent: Model<any>): Promise<T | T[] | null>;
    /**
     * Eager load this relationship for multiple parent models
     *
     * This is called internally when using with():
     * User.query().with('posts').get()
     *
     * Instead of N+1 queries, this loads all related records in one query
     *
     * @param models - Parent models to load relationships for
     * @param relationName - Name of the relationship property
     */
    abstract eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
    /**
     * Returns the field name(s) on the owner model that this relationship depends on.
     */
    abstract getOwnerFields(): string[];
    /**
     * Get the related model class
     */
    getRelated(): ModelConstructor<T>;
    /**
     * Get the foreign key
     */
    getForeignKey(): string;
    /**
     * Get the local key
     */
    getLocalKey(): string;
}
export {};
//# sourceMappingURL=relationship.d.ts.map