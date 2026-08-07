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
import {
	assertWritableColumn,
	dynamicWhere,
	findDeclaration,
	findRelationship,
	getRelation,
	loadingKey,
	setRelation,
} from './internal';
import type { AnyRelations } from './relation-paths';
import type { Patch } from './columns';

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
		Record<string, any>
	>();

	/** Override in a subclass, or declare a `relationships` literal instead. */
	protected static defineRelationships(): Record<string, any> {
		return {};
	}

	static get relationships(): Record<string, any> {
		// Per class, so a subclass never inherits its parent's map.
		if (!Model._relationshipsCache.has(this)) {
			Model._relationshipsCache.set(this, this.defineRelationships());
		}
		return Model._relationshipsCache.get(this)!;
	}

	static config: ModelConfig = {
		timestamps: true,
	};

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
	declare readonly __model: true;

	// Deliberately no instance-level `relationships` field: every caller goes
	// through `this.constructor.relationships`, the static. An instance-level
	// field would be an own property sitting below the proxy's `set` trap
	// (which walks only the prototype chain), so it would be fillable and
	// would shadow the static under `get`.

	/**
	 * Wraps the instance in a Proxy so columns and relations read as plain
	 * properties. `_`-prefixed state is declared on ModelState and initialised
	 * here; declaring it on both sides would not merge.
	 */
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

				// Shared with `assertWritableColumn`, which reports on a write
				// this trap would refuse. The two must agree on what counts as
				// a declaration, so they resolve it the same way rather than
				// each walking the chain themselves.
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

		let tableName = config.table;
		if (!tableName) {
			tableName = this.deriveTableName(constructor.name);
		}

		return {
			table: tableName,
			primaryKey: config.primaryKey || 'id',
			timestamps: config.timestamps || false,
		};
	}

	private deriveTableName(className: string): string {
		const snakeCase = className
			.replace(/([A-Z])/g, '_$1')
			.toLowerCase()
			.replace(/^_/, '');

		if (snakeCase.endsWith('y')) {
			return snakeCase.slice(0, -1) + 'ies';
		} else if (snakeCase.endsWith('s')) {
			return snakeCase + 'es';
		} else {
			return snakeCase + 's';
		}
	}

	/** @internal Resolved timestamp column names, or null when disabled. */
	getTimestampConfig(): TimestampConfig | null {
		const config = this.getConfig();

		if (!config.timestamps) {
			return null;
		}

		if (typeof config.timestamps === 'boolean') {
			return {
				created_at: 'created_at',
				updated_at: 'updated_at',
			};
		}

		return config.timestamps;
	}

	get createdAt(): Date | null {
		const tsConfig = this.getTimestampConfig();
		if (!tsConfig) return null;
		const val = this._attributes[tsConfig.created_at];
		return val != null ? new Date(Number(val) * 1000) : null;
	}

	get updatedAt(): Date | null {
		const tsConfig = this.getTimestampConfig();
		if (!tsConfig) return null;
		const val = this._attributes[tsConfig.updated_at];
		return val != null ? new Date(Number(val) * 1000) : null;
	}

	static getTableName(): string {
		const ModelClass = this as unknown as ModelConstructor<any>;
		if (ModelClass.config.table) {
			return ModelClass.config.table;
		}

		if (!ModelClass._cachedTableName) {
			const className = this.name || 'Model';
			const snakeCase = className
				.replace(/([A-Z])/g, '_$1')
				.toLowerCase()
				.replace(/^_/, '');

			if (snakeCase.endsWith('y')) {
				ModelClass._cachedTableName = snakeCase.slice(0, -1) + 'ies';
			} else if (snakeCase.endsWith('s')) {
				ModelClass._cachedTableName = snakeCase + 'es';
			} else {
				ModelClass._cachedTableName = snakeCase + 's';
			}
		}

		return ModelClass._cachedTableName;
	}

	static generateSlug(string: string): string {
		return string
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	/**
	 * `this: ModelStatic<T>` binds T to the subclass the static is called on,
	 * so `User.find()` returns `User | null`. Erased at runtime.
	 */
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

	/**
	 * `NoInfer` keeps `data` from acting as a second inference site: `T` must
	 * come from `this` alone, or a mapped type over it collapses `T` to
	 * `Model<any>` and the column check erases itself.
	 */
	static async create<T extends Model<T>>(
		this: ModelStatic<T>,
		data: NoInfer<Patch<T>>,
	): Promise<T> {
		const model = new this();
		model.fill(data);

		await model.save();
		return model;
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
		related: C,
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
	fill(data: Patch<T>): this {
		const { fillable, guarded } = (this.constructor as typeof Model).config;

		for (const [key, value] of Object.entries(
			data as Record<string, unknown>,
		)) {
			if (key.startsWith('_')) continue;
			if (fillable) {
				if (!fillable.includes(key)) continue;
			} else if (guarded?.includes(key)) {
				continue;
			}

			// Typed callers cannot reach this, but untyped ones can, and the
			// proxy's own refusal is an unlabelled TypeError.
			assertWritableColumn(this, key);

			(this as Record<string, unknown>)[key] = value;
		}

		return this;
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
