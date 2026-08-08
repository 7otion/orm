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
import type { ModelConfig, QueryValue } from './types';
import type { AnyRelations } from './relation-paths';
import type { Patch } from './columns';
import { Caster } from './casts';
import { Timestamps } from './timestamps';
export interface ModelConstructor<TModel extends Model<TModel>> {
    new (): TModel;
    config: ModelConfig;
    _cachedTableName?: string;
    getTableName(): string;
    query(): QueryBuilder<TModel>;
    find(id: QueryValue): Promise<TModel | null>;
    all(): Promise<TModel[]>;
    create(data: Patch<TModel>): Promise<TModel>;
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
    readonly casts: Caster;
    readonly timestamps: Timestamps;
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
    private static _castsCache;
    private static _timestampsCache;
    /** The model's timestamp columns, resolved once per class. */
    static get timestamps(): Timestamps;
    /**
     * The model's casts, resolved once per class. Timestamp columns are folded
     * in as `date`.
     */
    static get casts(): Caster;
    /**
     * @internal Phantom nominal marker. `declare` emits nothing, so no instance
     * ever carries it at runtime.
     *
     * `ColumnKeys` uses this to recognise a relation. The obvious structural
     * test — `V extends Model<any>` — would compare every member including
     * `fill`, whose parameter type is itself derived from `ColumnKeys`; two
     * models that reference each other then make that check circular. Matching
     * one marker property instead terminates immediately.
     */
    readonly __model: true;
    /**
     * Wraps the instance in a Proxy so columns and relations read as plain
     * properties. `_`-prefixed state is declared on ModelState and initialised
     * here; declaring it on both sides would not merge.
     */
    constructor();
    /** @internal Config with defaults applied. Public for the mixins' benefit. */
    getConfig(): ModelConfig;
    private deriveTableName;
    /** @internal Public for the mixins' benefit. */
    getTimestamps(): Timestamps;
    /** @internal Public for the mixins' benefit. */
    getCaster(): Caster;
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
    /**
     * `NoInfer` keeps `data` from acting as a second inference site: `T` must
     * come from `this` alone, or a mapped type over it collapses `T` to
     * `Model<any>` and the column check erases itself.
     */
    static create<T extends Model<T>>(this: ModelStatic<T>, data: NoInfer<Patch<T>>): Promise<T>;
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
     * The parameter type is derived from the class's own field declarations, so
     * relations, computed properties and unknown keys are rejected at compile
     * time without the author maintaining a second list.
     *
     * `fillable`/`guarded` remain the *runtime* guard, for data that arrives
     * untyped — a request body, an import file, `JSON.parse`. Unlike
     * `Object.assign`, this never writes an ORM-internal (`_`-prefixed) key, so
     * such a payload cannot corrupt persistence state. A model declaring neither
     * still accepts every column, so set one before filling from user input.
     */
    fill(data: Patch<T>): this;
    /** Replays whatever was eager-loaded, or only the paths given. */
    refresh(relationships?: string[]): Promise<void>;
}
//# sourceMappingURL=model.d.ts.map