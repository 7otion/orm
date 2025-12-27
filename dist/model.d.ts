/**
 * Model Base Class - Active Record pattern with automatic relationships
 */
import { QueryBuilder } from './query-builder';
import { HasOne } from './relationships/hasOne';
import { HasMany } from './relationships/hasMany';
import { BelongsTo } from './relationships/belongsTo';
import { BelongsToMany } from './relationships/belongsToMany';
import { MorphTo, type MorphToConfig } from './relationships/morphTo';
import { RecordPersistenceMixin } from './mixins/record-persistence.mixin';
import { ChangeStateMixin } from './mixins/change-state.mixin';
import { RelationshipLoaderMixin } from './mixins/relationship-loader.mixin';
import type { ModelConfig, QueryValue } from './types';
/**
 * Type for Model constructor
 * Used by QueryBuilder and relationships to instantiate models
 */
export interface ModelConstructor<TModel extends Model<TModel>> {
    new (): TModel;
    config: ModelConfig;
    _cachedTableName?: string;
    getTableName(): string;
    query(): QueryBuilder<TModel>;
    find(id: QueryValue): Promise<TModel | null>;
    all(): Promise<TModel[]>;
    create(data: Record<string, any>): Promise<TModel>;
}
/**
 * Base Model class with mixins for persistence, change tracking, and relationships
 *
 * Uses interface merging to include mixin methods in type definitions
 */
export interface Model<T extends Model<T>> extends RecordPersistenceMixin, ChangeStateMixin, RelationshipLoaderMixin {
}
export declare abstract class Model<T extends Model<T>> {
    private static _relationshipsCache;
    /**
     * Define relationships for this model
     * Subclasses should override this method to define their relationships
     *
     * Example:
     * protected static defineRelationships() {
     *   return {
     *     posts: this.hasMany(Post),
     *     profile: this.hasOne(Profile)
     *   };
     * }
     */
    protected static defineRelationships(): Record<string, any>;
    /**
     * Get relationships for this model (with caching)
     */
    static get relationships(): Record<string, any>;
    static config: ModelConfig;
    private _attributes;
    private _original;
    private _exists;
    private _proxy?;
    readonly relationships: {};
    /**
     * Returns Proxy to enable natural property access and relationship getters
     */
    constructor();
    protected getConfig(): ModelConfig;
    private deriveTableName;
    private getTimestampConfig;
    static getTableName(): string;
    static query(): QueryBuilder<any>;
    static find(id: QueryValue): Promise<any>;
    static all(): Promise<any[]>;
    static create(data: Record<string, any>): Promise<any>;
    protected static hasOne<R extends Model<R>>(related: any, foreignKey?: string, localKey?: string): HasOne<R>;
    protected static hasMany<R extends Model<R>>(related: any, foreignKey?: string, localKey?: string): HasMany<R>;
    protected static belongsTo<R extends Model<R>>(related: any, foreignKey?: string, localKey?: string): BelongsTo<R>;
    protected static belongsToMany<R extends Model<R>>(related: any, pivotTable: string, foreignPivotKey?: string, relatedPivotKey?: string, parentKey?: string, relatedKey?: string): BelongsToMany<R>;
    protected static morphTo<R extends Model<R>>(config: MorphToConfig<R>): MorphTo<R>;
}
//# sourceMappingURL=model.d.ts.map