/** Active Record base class. */
import { QueryBuilder } from './query-builder';
import { HasOne } from './relationships/hasOne';
import { HasMany } from './relationships/hasMany';
import { BelongsTo } from './relationships/belongsTo';
import { BelongsToMany } from './relationships/belongsToMany';
import { MorphTo, type MorphToConfig } from './relationships/morphTo';
import { MorphMany, type MorphManyConfig } from './relationships/morphMany';
import { RecordPersistenceMixin } from './mixins/record-persistence.mixin';
import { ChangeStateMixin } from './mixins/change-state.mixin';
import { RelationshipLoaderMixin } from './mixins/relationship-loader.mixin';
import type { ModelConfig, QueryValue, TimestampConfig } from './types';
import type { AnyRelations } from './relation-paths';
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
 * `this` type for Model's statics.
 *
 * TModel must stay inferable only from `new (): TModel`. A generic member here
 * adds a second inference site and collapses TModel to `Model<any>`.
 */
export interface ModelStatic<TModel extends Model<TModel>> {
    new (): TModel;
    readonly name: string;
    config: ModelConfig;
    getTableName(): string;
}
/**
 * A model class that is read but never constructed. No construct signature, so
 * abstract `Model` satisfies it.
 */
export interface ModelClassRef {
    readonly name: string;
    config: ModelConfig;
    getTableName(): string;
}
/** Interface merging pulls the mixin methods into Model's type. */
export interface Model<T extends Model<T>> extends RecordPersistenceMixin, ChangeStateMixin, RelationshipLoaderMixin {
}
export declare abstract class Model<T extends Model<T>> {
    private static _relationshipsCache;
    /** Override in a subclass, or declare a `relationships` literal instead. */
    protected static defineRelationships(): Record<string, any>;
    static get relationships(): Record<string, any>;
    static config: ModelConfig;
    readonly relationships: {};
    /**
     * Wraps the instance in a Proxy so columns and relations read as plain
     * properties. `_`-prefixed state is declared on ModelState and initialised
     * here; declaring it on both sides would not merge.
     */
    constructor();
    /** @internal Config with defaults applied. Public for the mixins' benefit. */
    getConfig(): ModelConfig;
    private deriveTableName;
    /** @internal Resolved timestamp column names, or null when disabled. */
    getTimestampConfig(): TimestampConfig | null;
    get createdAt(): Date | null;
    get updatedAt(): Date | null;
    static getTableName(): string;
    static generateSlug(string: string): string;
    /**
     * `this: ModelStatic<T>` binds T to the subclass the static is called on,
     * so `User.find()` returns `User | null`. Erased at runtime.
     */
    static query<T extends Model<T>, R = AnyRelations>(this: ModelStatic<T> & {
        readonly relationships?: R;
    }): QueryBuilder<T, R>;
    static find<T extends Model<T>>(this: ModelStatic<T>, id: QueryValue | QueryValue[]): Promise<T | null>;
    static all<T extends Model<T>>(this: ModelStatic<T>): Promise<T[]>;
    static create<T extends Model<T>>(this: ModelStatic<T>, data: Record<string, any>): Promise<T>;
    protected static hasOne<C extends ModelStatic<any>>(related: C | (() => C), foreignKey?: string, localKey?: string): HasOne<InstanceType<C>, C>;
    protected static hasMany<C extends ModelStatic<any>>(related: C | (() => C), foreignKey?: string, localKey?: string): HasMany<InstanceType<C>, C>;
    protected static belongsTo<C extends ModelStatic<any>>(related: C | (() => C), foreignKey?: string, localKey?: string): BelongsTo<InstanceType<C>, C>;
    protected static belongsToMany<C extends ModelStatic<any>>(related: C, pivotTable: string, foreignPivotKey?: string, relatedPivotKey?: string, parentKey?: string, relatedKey?: string): BelongsToMany<InstanceType<C>, C>;
    /**
     * Children in a table shared by several owner types, matched on the
     * discriminator as well as the foreign key.
     */
    protected static morphMany<C extends ModelStatic<any>>(related: C | (() => C), config: MorphManyConfig): MorphMany<InstanceType<C>, C>;
    protected static morphTo<R extends Model<R>>(config: MorphToConfig<R>): MorphTo<R>;
    /**
     * Bulk-assign columns, honouring `fillable`/`guarded`.
     *
     * Unlike `Object.assign`, this never writes an ORM-internal (`_`-prefixed)
     * key, so an untrusted request body cannot corrupt persistence state. A
     * model declaring neither `fillable` nor `guarded` still accepts every
     * column, so set one before filling from user input.
     */
    fill(data: Record<string, unknown>): this;
    /** Replays whatever was eager-loaded, or only the paths given. */
    refresh(relationships?: string[]): Promise<void>;
}
//# sourceMappingURL=model.d.ts.map