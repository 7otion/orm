/** Active Record base class. */

import { BulkWriter } from './bulk-writer';
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
import {
	assertIdentifier,
	assertWritableColumn,
	snakeCase,
	dynamicWhere,
	findDeclaration,
	findRelationship,
	getRelation,
	loadingKey,
	setRelation,
} from './internal';
import type { AnyRelations } from './relation-paths';
import type { Patch, RelatedModel, ToManyRelationKeys } from './columns';
import { BUILTIN_CASTS, Caster, type ColumnCast, DateCast } from './casts';
import {
	ModelEvents,
	type Listener,
	type ModelEvent,
	type ModelHooks,
} from './events';
import { Timestamps } from './timestamps';
import { RelationWriter, toManyRelation } from './relation-writer';
import { ListenerError, type Transaction } from './transaction';
import { instanceChanges } from './instance-changes';

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
export interface Model<T extends Model<T>>
	extends RecordPersistenceMixin, ChangeStateMixin, RelationshipLoaderMixin {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class Model<T extends Model<T>> {
	private static _relationshipsCache = new WeakMap<
		typeof Model,
		Record<string, LoadableRelation>
	>();

	/** Override in a subclass, or declare a `relationships` literal instead. */
	protected static defineRelationships(): Record<string, LoadableRelation> {
		return {};
	}

	static get relationships(): Record<string, LoadableRelation> {
		// Per class, so a subclass never inherits its parent's map.
		if (!Model._relationshipsCache.has(this)) {
			Model._relationshipsCache.set(this, this.defineRelationships());
		}
		return Model._relationshipsCache.get(this)!;
	}

	static config: ModelConfig = {
		timestamps: true,
	};

	private static _castsCache = new WeakMap<typeof Model, Caster>();
	private static _timestampsCache = new WeakMap<typeof Model, Timestamps>();

	/** The model's timestamp columns, resolved once per class. */
	static get timestamps(): Timestamps {
		if (!Model._timestampsCache.has(this)) {
			Model._timestampsCache.set(
				this,
				new Timestamps(this.config.timestamps),
			);
		}
		return Model._timestampsCache.get(this)!;
	}

	/**
	 * The model's casts, resolved once per class. Timestamp columns are folded
	 * in as `date`.
	 */
	static get casts(): Caster {
		if (!Model._castsCache.has(this)) {
			const casts: Record<string, ColumnCast> = {};
			for (const [column, spec] of Object.entries(
				this.config.casts ?? {},
			)) {
				casts[column] =
					typeof spec === 'string' ? BUILTIN_CASTS[spec] : spec;
			}

			const columns = this.timestamps.columns;
			if (columns) {
				casts[columns.created_at] ??= DateCast;
				casts[columns.updated_at] ??= DateCast;
			}

			Model._castsCache.set(this, new Caster(casts));
		}
		return Model._castsCache.get(this)!;
	}

	/** Declared by a subclass: housekeeping that runs inside its writes. Read at each write, so it may be assigned late. */
	static hooks?: ModelHooks<any>;

	private static _eventsCache = new WeakMap<typeof Model, ModelEvents<any>>();

	/** The model's listeners, one registry per class. */
	static get events(): ModelEvents<any> {
		if (!Model._eventsCache.has(this)) {
			Model._eventsCache.set(this, new ModelEvents(this));
		}
		return Model._eventsCache.get(this)!;
	}

	private static _reachableCache = new WeakMap<typeof Model, Set<object>>();

	/** Whether a change to `instance` can show through this model: it is one, or reachable through relations. */
	static affectedBy(instance: object): boolean {
		if (instance instanceof this) return true;
		for (const related of this.reachable()) {
			if (instance instanceof (related as abstract new () => object)) {
				return true;
			}
		}
		return false;
	}

	/** Every class reachable through relations, transitively. Resolved once per class. */
	private static reachable(): Set<object> {
		let reachable = Model._reachableCache.get(this);
		if (reachable) return reachable;

		reachable = new Set();
		const pending: ModelClassRef[] = [this];
		while (pending.length > 0) {
			const current = pending.pop() as typeof Model;
			for (const relation of Object.values(current.relationships)) {
				const targets =
					typeof relation.getRelated === 'function'
						? [relation.getRelated()]
						: (relation.getMorphTargets?.() ?? []);
				for (const target of targets) {
					if (target === this || reachable.has(target)) continue;
					reachable.add(target);
					pending.push(target);
				}
			}
		}

		Model._reachableCache.set(this, reachable);
		return reachable;
	}

	/** Runs after a write of this model commits. Returns the unsubscribe. */
	static on<T extends Model<T>>(
		this: ModelStatic<T>,
		event: ModelEvent,
		listener: Listener<T>,
	): () => void {
		return (this.events as ModelEvents<T>).on(event, listener);
	}

	/**
	 * @internal Phantom marker `ColumnKeys` matches to recognise a relation; a
	 * structural check is circular through `fill`. `declare` emits nothing.
	 */
	declare readonly __model: true;

	// No instance-level `relationships`: an own property would be fillable and shadow the static.

	/** Wraps the instance in a Proxy so columns and relations read as plain properties. */
	constructor() {
		this._attributes = {};
		this._original = {};
		this._exists = false;

		const proxy = new Proxy(this, {
			get(target: any, prop: string | symbol) {
				if (typeof prop === 'symbol' || prop.startsWith('_')) {
					return target[prop];
				}

				// Unbound, so statics stay reachable.
				if (prop === 'constructor') {
					return Object.getPrototypeOf(target).constructor;
				}

				let proto = Object.getPrototypeOf(target);
				while (proto) {
					const descriptor = Object.getOwnPropertyDescriptor(
						proto,
						prop,
					);

					if (descriptor) {
						// Bound to the proxy, so `this` reads columns.
						if (descriptor.get) {
							return descriptor.get.call(proxy);
						}

						if (typeof descriptor.value === 'function') {
							return descriptor.value.bind(proxy);
						}
					}

					proto = Object.getPrototypeOf(proto);
				}

				// Before instance properties, so `id!: number` cannot shadow it.
				if (prop in target._attributes) {
					return target._attributes[prop];
				}

				if (Object.prototype.hasOwnProperty.call(target, prop)) {
					const instanceValue = target[prop];
					// undefined means an unassigned `field!: T`.
					if (instanceValue !== undefined) {
						return instanceValue;
					}
				}

				const ctor = Object.getPrototypeOf(target)
					.constructor as typeof Model;
				if (findRelationship(ctor.relationships, prop)) {
					return target.getWithSuspense(prop);
				}

				return undefined;
			},

			set(target: any, prop: string | symbol, value: any) {
				if (typeof prop === 'symbol' || prop.startsWith('_')) {
					target[prop] = value;
					return true;
				}

				// Resolved as `assertWritableColumn` resolves it, so the two agree.
				const descriptor = findDeclaration(target, prop);

				if (descriptor) {
					if (descriptor.set) {
						descriptor.set.call(proxy, value);
						return true;
					}

					// Read-only; falling through would shadow it with a column.
					if (descriptor.get) {
						return false;
					}

					if (typeof descriptor.value === 'function') {
						return false;
					}
				}

				// Relations go to their backing field, not _attributes, which
				// save() would treat as a column.
				const ctor = Object.getPrototypeOf(target)
					.constructor as typeof Model;
				if (findRelationship(ctor.relationships, prop)) {
					target[`_${prop}`] = value;
					return true;
				}

				if (ctor.timestamps.owns(prop)) {
					throw new Error(
						`[orm] ${ctor.name}.${prop} is a timestamp, which the ` +
							`ORM maintains: it is set on insert and refreshed on ` +
							`every update. It cannot be assigned.`,
					);
				}

				target._attributes[prop] = value;
				return true;
			},

			/** Only columns enumerate, so spread and JSON skip relations. */
			ownKeys(target: any) {
				const attributeKeys = Object.keys(target._attributes);
				return attributeKeys;
			},

			getOwnPropertyDescriptor(target: any, prop: string | symbol) {
				if (typeof prop === 'string' && prop in target._attributes) {
					return {
						enumerable: true,
						configurable: true,
						writable: true,
						value: target._attributes[prop],
					};
				}

				return undefined;
			},
		});

		this._proxy = proxy;

		return proxy;
	}

	/** @internal Config with defaults applied. Public for the mixins' benefit. */
	getConfig(): ModelConfig {
		const constructor = this.constructor as typeof Model;
		const config = constructor.config;

		return {
			table: constructor.getTableName(),
			primaryKey: config.primaryKey || 'id',
			timestamps: config.timestamps || false,
		};
	}

	/** @internal Public for the mixins' benefit. */
	getTimestamps(): Timestamps {
		return (this.constructor as typeof Model).timestamps;
	}

	/** @internal Public for the mixins' benefit. */
	getCaster(): Caster {
		return (this.constructor as typeof Model).casts;
	}

	/** @internal Public for the mixins' benefit. */
	getEvents(): ModelEvents<any> {
		return (this.constructor as typeof Model).events;
	}

	private static _tableNameCache = new WeakMap<typeof Model, string>();

	/** Interpolated into SQL, not bound, so it is validated like any identifier. */
	static getTableName(): string {
		// Per class, so a subclass never inherits its parent's derived name.
		let tableName = Model._tableNameCache.get(this);
		if (tableName === undefined) {
			tableName = assertIdentifier(
				this.config.table ?? this.deriveTableName(),
				'table',
			);
			Model._tableNameCache.set(this, tableName);
		}
		return tableName;
	}

	private static deriveTableName(): string {
		// A `Model` suffix is kept here, unlike in foreign-key inference.
		const name = snakeCase(this.name || 'Model');

		if (name.endsWith('y')) return name.slice(0, -1) + 'ies';
		if (name.endsWith('s')) return name + 'es';
		return name + 's';
	}

	static generateSlug(string: string): string {
		return string
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	/** `this: ModelStatic<T>` binds T to the calling subclass. */
	static query<T extends Model<T>, R = AnyRelations>(
		this: ModelStatic<T> & { readonly relationships?: R },
	): QueryBuilder<T, R> {
		return new QueryBuilder<T, R>(this, this.getTableName());
	}

	static async find<T extends Model<T>>(
		this: ModelStatic<T>,
		id: QueryValue | QueryValue[],
	): Promise<T | null> {
		const primaryKey = this.config.primaryKey || 'id';
		const newQuery = (): QueryBuilder<T> =>
			new QueryBuilder<T>(this, this.getTableName());

		if (Array.isArray(primaryKey)) {
			const idArray = Array.isArray(id) ? id : [id];

			if (primaryKey.length !== idArray.length) {
				throw new Error(
					`Primary key length mismatch: expected ${primaryKey.length} values, got ${idArray.length}`,
				);
			}

			let query = newQuery();
			for (let i = 0; i < primaryKey.length; i++) {
				const key = primaryKey[i];
				const value = idArray[i];
				if (key === undefined || value === undefined) {
					throw new Error(
						'Unexpected undefined in composite primary key',
					);
				}
				query = dynamicWhere(query).where(key, value);
			}
			return query.first();
		}

		return dynamicWhere(newQuery())
			.where(primaryKey, id as QueryValue)
			.first();
	}

	static async all<T extends Model<T>>(this: ModelStatic<T>): Promise<T[]> {
		return new QueryBuilder<T>(this, this.getTableName()).get();
	}

	/** `NoInfer`: `T` comes from `this` alone, or the column check collapses to `Model<any>`. */
	static async create<T extends Model<T>>(
		this: ModelStatic<T>,
		data: NoInfer<Patch<T>>,
		tx?: Transaction,
	): Promise<T> {
		const model = new this();
		model.fill(data);

		await model.save(tx);
		return model;
	}

	/** The written models, each carrying its key, in the order given. */
	static async createMany<T extends Model<T>>(
		this: ModelStatic<T>,
		rows: NoInfer<Patch<T>>[],
		tx?: Transaction,
	): Promise<T[]> {
		return new BulkWriter(this).insert(rows, tx);
	}

	/** Saves every model's pending changes in one statement. */
	static async updateMany<T extends Model<T>>(
		this: ModelStatic<T>,
		models: T[],
		tx?: Transaction,
	): Promise<T[]> {
		return new BulkWriter(this).update(models, tx);
	}

	protected static hasOne<C extends ModelStatic<any>>(
		related: C | (() => C),
		foreignKey?: string,
		localKey?: string,
	): HasOne<InstanceType<C>, C> {
		return new HasOne(this, related, foreignKey, localKey);
	}

	protected static hasMany<C extends ModelStatic<any>>(
		related: C | (() => C),
		foreignKey?: string,
		localKey?: string,
	): HasMany<InstanceType<C>, C> {
		return new HasMany(this, related, foreignKey, localKey);
	}

	protected static belongsTo<C extends ModelStatic<any>>(
		related: C | (() => C),
		foreignKey?: string,
		localKey?: string,
	): BelongsTo<InstanceType<C>, C> {
		return new BelongsTo(this, related, foreignKey, localKey);
	}

	protected static belongsToMany<C extends ModelStatic<any>>(
		related: C | (() => C),
		pivotTable: string,
		foreignPivotKey?: string,
		relatedPivotKey?: string,
		parentKey?: string,
		relatedKey?: string,
	): BelongsToMany<InstanceType<C>, C> {
		return new BelongsToMany(
			this,
			related,
			pivotTable,
			foreignPivotKey,
			relatedPivotKey,
			parentKey,
			relatedKey,
		);
	}

	/**
	 * Children in a table shared by several owner types, matched on the
	 * discriminator as well as the foreign key.
	 */
	protected static morphMany<C extends ModelStatic<any>>(
		related: C | (() => C),
		config: MorphManyConfig,
	): MorphMany<InstanceType<C>, C> {
		return new MorphMany(this, related as never, config);
	}

	protected static morphTo<R extends Model<R>>(
		config: MorphToConfig<R>,
	): MorphTo<R> {
		return new MorphTo(this, config);
	}

	/** Bulk-assigns columns, honouring `fillable`/`guarded`; never writes a `_`-prefixed key. */
	fill(data: Patch<T>): this {
		const ModelClass = this.constructor as typeof Model;
		const { fillable, guarded } = ModelClass.config;
		const timestamps = ModelClass.timestamps;

		for (const [key, value] of Object.entries(
			data as Record<string, unknown>,
		)) {
			if (key.startsWith('_')) continue;
			if (value === undefined) continue;
			// The ORM stamps these itself; a supplied one is always stale.
			if (timestamps.owns(key)) continue;
			if (fillable) {
				if (!fillable.includes(key)) continue;
			} else if (guarded?.includes(key)) {
				continue;
			}

			// The proxy's own refusal is an unlabelled TypeError.
			assertWritableColumn(this, key);

			(this as Record<string, unknown>)[key] = value;
		}

		return this;
	}

	/** Reconciles the set of rows on the far side of a to-many relation. */
	relation<K extends ToManyRelationKeys<T>>(
		name: K,
	): RelationWriter<RelatedModel<T, K> & Model<any>> {
		const ModelClass = this.constructor as typeof Model;
		const relation = findRelationship(ModelClass.relationships, name);

		if (!relation) {
			throw new Error(
				`[orm] ${ModelClass.name} declares no relation named '${name}'.`,
			);
		}

		return new RelationWriter(this, name, toManyRelation(relation, name));
	}

	/** Replays whatever was eager-loaded, or only the paths given. */
	async refresh(relationships?: string[]): Promise<void> {
		const config = this.getConfig();
		const primaryKey = config.primaryKey || 'id';

		const ModelClass = this.constructor as unknown as {
			query(): QueryBuilder<Model<any>>;
		};

		let query = ModelClass.query();

		// Only undefined/null mean "no key"; `0` and `''` are valid keys.
		if (Array.isArray(primaryKey)) {
			for (const key of primaryKey) {
				const value = this._attributes[key];
				if (value === undefined || value === null) {
					throw new Error(
						`Cannot refresh model without primary key value for ${key}`,
					);
				}
				query = dynamicWhere(query).where(key, value);
			}
		} else {
			const primaryKeyValue = this._attributes[primaryKey];
			if (primaryKeyValue === undefined || primaryKeyValue === null) {
				throw new Error(
					'Cannot refresh model without a primary key value',
				);
			}
			query = dynamicWhere(query).where(primaryKey, primaryKeyValue);
		}

		const paths: string[] = relationships ?? [
			...(this._loadedPaths ?? new Set<string>()),
		];

		if (paths.length > 0) {
			query = query.with(...paths);
		}

		const fresh = await query.first();

		if (!fresh) {
			const keyStr = Array.isArray(primaryKey)
				? primaryKey.map(k => `${k}=${this._attributes[k]}`).join(', ')
				: `${primaryKey}=${this._attributes[primaryKey]}`;
			throw new Error(`Model with ${keyStr} no longer exists`);
		}

		this._attributes = { ...fresh._attributes };
		this._original = { ...fresh._original };
		this._exists = fresh._exists;

		// Drop stale in-flight promises, so no access awaits a superseded load.
		const pending = this as unknown as Record<string, unknown>;
		const topLevel = new Set(paths.map(p => p.split('.')[0]!));
		for (const rel of topLevel) {
			const freshValue = getRelation(fresh, rel);
			if (freshValue !== undefined) {
				setRelation(this, rel, freshValue);
				delete pending[loadingKey(rel)];
			}
		}

		if (relationships !== undefined) {
			this._loadedPaths = new Set(relationships);
		}

		// A read that changed an instance; no unit, so reported at once.
		const failures = await instanceChanges.report([this]);
		if (failures.length > 0) throw new ListenerError(undefined, failures);
	}
}

function applyMixins(derivedCtor: any, constructors: any[]) {
	constructors.forEach(baseCtor => {
		Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
			if (name !== 'constructor') {
				const descriptor = Object.getOwnPropertyDescriptor(
					baseCtor.prototype,
					name,
				);
				if (descriptor) {
					Object.defineProperty(
						derivedCtor.prototype,
						name,
						descriptor,
					);
				}
			}
		});
	});
}

applyMixins(Model, [
	RecordPersistenceMixin,
	ChangeStateMixin,
	RelationshipLoaderMixin,
]);
