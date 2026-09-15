/** Active Record base class. */
import { QueryBuilder } from './query-builder';
import { HasOne } from './relationships/hasOne';
import { HasMany } from './relationships/hasMany';
import { BelongsTo } from './relationships/belongsTo';
import { BelongsToMany } from './relationships/belongsToMany';
import { MorphTo, type MorphToConfig } from './relationships/morphTo';
import { MorphMany, type MorphManyConfig } from './relationships/morphMany';
import type { LoadableRelation } from './relationships/relationship';
import { RecordPersistenceMixin } from './mixins/record-persistence.mixin';
import { ChangeStateMixin } from './mixins/change-state.mixin';
import { RelationshipLoaderMixin } from './mixins/relationship-loader.mixin';
import type { ModelConfig, QueryValue } from './types';
import type { AnyRelations } from './relation-paths';
import type { Patch, RelatedModel, ToManyRelationKeys } from './columns';
import { Caster } from './casts';
import { ModelEvents, type Listener, type ModelEvent, type ModelHooks } from './events';
import { Timestamps } from './timestamps';
import { RelationWriter } from './relation-writer';
import type { Transaction } from './transaction';
export interface ModelConstructor<TModel extends Model<TModel>> {
    new (): TModel;
    config: ModelConfig;
    getTableName(): string;
    query(): QueryBuilder<TModel>;
    find(id: QueryValue): Promise<TModel | null>;
    all(): Promise<TModel[]>;
    create(data: Patch<TModel>): Promise<TModel>;
}
/**
 * `this` type for Model's statics. No generic member: a second inference site
 * collapses TModel to `Model<any>`.
 */
export interface ModelStatic<TModel extends Model<TModel>> {
    new (): TModel;
    readonly name: string;
    config: ModelConfig;
    readonly casts: Caster;
    readonly timestamps: Timestamps;
    readonly events: ModelEvents<any>;
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
    protected static defineRelationships(): Record<string, LoadableRelation>;
    static get relationships(): Record<string, LoadableRelation>;
    static config: ModelConfig;
    private static _castsCache;
    private static _timestampsCache;
    /** The model's timestamp columns, resolved once per class. */
    static get timestamps(): Timestamps;
    /**
     * The model's casts, resolved once per class. Timestamp columns are folded
     * in as `date`.
     */
    static get casts(): Caster;
    /** Declared by a subclass: housekeeping that runs inside its writes. Read at each write, so it may be assigned late. */
    static hooks?: ModelHooks<any>;
    private static _eventsCache;
    /** The model's listeners, one registry per class. */
    static get events(): ModelEvents<any>;
    /** Runs after a write of this model commits. Returns the unsubscribe. */
    static on<T extends Model<T>>(this: ModelStatic<T>, event: ModelEvent, listener: Listener<T>): () => void;
    /**
     * @internal Phantom marker `ColumnKeys` matches to recognise a relation; a
     * structural check is circular through `fill`. `declare` emits nothing.
     */
    readonly __model: true;
    /** Wraps the instance in a Proxy so columns and relations read as plain properties. */
    constructor();
    /** @internal Config with defaults applied. Public for the mixins' benefit. */
    getConfig(): ModelConfig;
    /** @internal Public for the mixins' benefit. */
    getTimestamps(): Timestamps;
    /** @internal Public for the mixins' benefit. */
    getCaster(): Caster;
    /** @internal Public for the mixins' benefit. */
    getEvents(): ModelEvents<any>;
    private static _tableNameCache;
    /** Interpolated into SQL, not bound, so it is validated like any identifier. */
    static getTableName(): string;
    private static deriveTableName;
    static generateSlug(string: string): string;
    /** `this: ModelStatic<T>` binds T to the calling subclass. */
    static query<T extends Model<T>, R = AnyRelations>(this: ModelStatic<T> & {
        readonly relationships?: R;
    }): QueryBuilder<T, R>;
    static find<T extends Model<T>>(this: ModelStatic<T>, id: QueryValue | QueryValue[]): Promise<T | null>;
    static all<T extends Model<T>>(this: ModelStatic<T>): Promise<T[]>;
    /** `NoInfer`: `T` comes from `this` alone, or the column check collapses to `Model<any>`. */
    static create<T extends Model<T>>(this: ModelStatic<T>, data: NoInfer<Patch<T>>, tx?: Transaction): Promise<T>;
    /** The written models, each carrying its key, in the order given. */
    static createMany<T extends Model<T>>(this: ModelStatic<T>, rows: NoInfer<Patch<T>>[], tx?: Transaction): Promise<T[]>;
    /** Saves every model's pending changes in one statement. */
    static updateMany<T extends Model<T>>(this: ModelStatic<T>, models: T[], tx?: Transaction): Promise<T[]>;
    protected static hasOne<C extends ModelStatic<any>>(related: C | (() => C), foreignKey?: string, localKey?: string): HasOne<InstanceType<C>, C>;
    protected static hasMany<C extends ModelStatic<any>>(related: C | (() => C), foreignKey?: string, localKey?: string): HasMany<InstanceType<C>, C>;
    protected static belongsTo<C extends ModelStatic<any>>(related: C | (() => C), foreignKey?: string, localKey?: string): BelongsTo<InstanceType<C>, C>;
    protected static belongsToMany<C extends ModelStatic<any>>(related: C | (() => C), pivotTable: string, foreignPivotKey?: string, relatedPivotKey?: string, parentKey?: string, relatedKey?: string): BelongsToMany<InstanceType<C>, C>;
    /**
     * Children in a table shared by several owner types, matched on the
     * discriminator as well as the foreign key.
     */
    protected static morphMany<C extends ModelStatic<any>>(related: C | (() => C), config: MorphManyConfig): MorphMany<InstanceType<C>, C>;
    protected static morphTo<R extends Model<R>>(config: MorphToConfig<R>): MorphTo<R>;
    /** Bulk-assigns columns, honouring `fillable`/`guarded`; never writes a `_`-prefixed key. */
    fill(data: Patch<T>): this;
    /** Reconciles the set of rows on the far side of a to-many relation. */
    relation<K extends ToManyRelationKeys<T>>(name: K): RelationWriter<RelatedModel<T, K> & Model<any>>;
    /** Replays whatever was eager-loaded, or only the paths given. */
    refresh(relationships?: string[]): Promise<void>;
}
//# sourceMappingURL=model.d.ts.map