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

import type { ModelConfig, QueryValue, TimestampConfig } from './types';

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
export interface Model<T extends Model<T>>
	extends RecordPersistenceMixin, ChangeStateMixin, RelationshipLoaderMixin {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class Model<T extends Model<T>> {
	private static _relationshipsCache = new WeakMap<
		typeof Model,
		Record<string, any>
	>();

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
	protected static defineRelationships(): Record<string, any> {
		return {};
	}

	/**
	 * Get relationships for this model (with caching)
	 */
	static get relationships(): Record<string, any> {
		// Use WeakMap to cache per-class to avoid static property inheritance issues
		if (!Model._relationshipsCache.has(this)) {
			Model._relationshipsCache.set(this, this.defineRelationships());
		}
		return Model._relationshipsCache.get(this)!;
	}

	static config: ModelConfig = {
		primaryKey: 'id',
		timestamps: true,
	};

	// @ts-ignore - Accessed by mixin methods
	private _attributes: Record<string, any> = {};
	// @ts-ignore - Accessed by mixin methods
	private _original: Record<string, any> = {};
	// @ts-ignore - Accessed by mixin methods
	private _exists: boolean = false;
	// @ts-ignore - Store proxy reference for mixin methods
	private _proxy?: any;

	readonly relationships = {};

	/**
	 * Returns Proxy to enable natural property access and relationship getters
	 */
	constructor() {
		const proxy = new Proxy(this, {
			get(target: any, prop: string | symbol) {
				// Internal properties and symbols bypass proxy logic
				if (typeof prop === 'symbol' || prop.startsWith('_')) {
					return target[prop];
				}

				// Special case: return constructor without binding to preserve static properties
				if (prop === 'constructor') {
					return Object.getPrototypeOf(target).constructor;
				}

				// Check prototype chain for methods and getters (including mixed-in methods)
				let proto = Object.getPrototypeOf(target);
				while (proto) {
					const descriptor = Object.getOwnPropertyDescriptor(
						proto,
						prop,
					);

					if (descriptor) {
						// Execute getters with proxy as context so they access properties through proxy
						if (descriptor.get) {
							return descriptor.get.call(proxy);
						}

						// Bind methods to proxy so they access properties through proxy
						if (typeof descriptor.value === 'function') {
							return descriptor.value.bind(proxy);
						}
					}

					// Move up the prototype chain
					proto = Object.getPrototypeOf(proto);
				}

				// Check _attributes first for data properties (id, name, etc.)
				// This prevents TypeScript's `id!: number;` declarations from shadowing actual data
				if (prop in target._attributes) {
					return target._attributes[prop];
				}

				// Check instance properties (used for eager-loaded relationships via _posts, _profile)
				// Skip TypeScript placeholder properties (undefined values from declarations like `id!: number;`)
				if (Object.prototype.hasOwnProperty.call(target, prop)) {
					const instanceValue = target[prop];
					// Only return instance property if it's not undefined
					// (undefined likely means it's a TypeScript placeholder)
					if (instanceValue !== undefined) {
						return instanceValue;
					}
				}

				// Auto-generate relationship getters if not explicitly defined
				// This allows accessing relationships without manually writing getters
				const ctor = Object.getPrototypeOf(target)
					.constructor as typeof Model;
				const relationships = ctor.relationships;
				if (relationships && relationships[prop as string]) {
					return target.getWithSuspense(prop as string);
				}

				// Default: undefined for non-existent properties
				return undefined;
			},

			set(target: any, prop: string | symbol, value: any) {
				// If it's a symbol or internal property, use default behavior
				if (typeof prop === 'symbol' || prop.startsWith('_')) {
					target[prop] = value;
					return true;
				}

				// Check if it's a setter
				const descriptor = Object.getOwnPropertyDescriptor(
					Object.getPrototypeOf(target),
					prop,
				);
				if (descriptor && descriptor.set) {
					descriptor.set.call(target, value);
					return true;
				}

				// Check if it's a method (shouldn't overwrite methods)
				if (descriptor && typeof descriptor.value === 'function') {
					return false;
				}

				// Store in _attributes for data properties
				target._attributes[prop as string] = value;
				return true;
			},

			/**
			 * Controls which properties are visible during enumeration (Object.keys, for...in, spread)
			 */
			ownKeys(target: any) {
				const attributeKeys = Object.keys(target._attributes);
				return attributeKeys;
			},

			/**
			 * Controls property descriptors for enumeration
			 * Makes only _attributes properties enumerable, relationships are invisible
			 */
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

		// Store proxy reference so mixin methods can access it
		this._proxy = proxy;

		return proxy;
	}

	protected getConfig(): ModelConfig {
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

	// @ts-ignore - Accessed by mixin methods
	private getTimestampConfig(): TimestampConfig | null {
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

	static getTableName(): string {
		const ModelClass = this as unknown as ModelConstructor<any>;
		if (ModelClass.config.table) {
			return ModelClass.config.table;
		}

		// Cache the derived table name on the class constructor itself
		if (!ModelClass._cachedTableName) {
			const className = (this as any).name || 'Model';
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

	static query(): QueryBuilder<any> {
		const tableName = this.getTableName();
		return new QueryBuilder(this as any, tableName);
	}

	static async find(id: QueryValue | QueryValue[]): Promise<any> {
		const primaryKey = this.config.primaryKey || 'id';
		
		// Handle composite primary keys
		if (Array.isArray(primaryKey)) {
			const idArray = Array.isArray(id) ? id : [id];
			
			if (primaryKey.length !== idArray.length) {
				throw new Error(
					`Primary key length mismatch: expected ${primaryKey.length} values, got ${idArray.length}`,
				);
			}

			let query = this.query();
			for (let i = 0; i < primaryKey.length; i++) {
				const key = primaryKey[i];
				const value = idArray[i];
				if (key === undefined || value === undefined) {
					throw new Error('Unexpected undefined in composite primary key');
				}
				query = query.where(key, value);
			}
			return query.first();
		}
		
		// Handle single primary key
		return this.query().where(primaryKey as string, id as QueryValue).first();
	}

	static async all(): Promise<any[]> {
		return this.query().get();
	}

	static async create(data: Record<string, any>): Promise<any> {
		const model = new (this as any)();

		for (const [key, value] of Object.entries(data)) {
			(model as any)[key] = value;
		}

		await model.save();
		return model;
	}

	// ==================== Relationship Factory Methods ====================

	protected static hasOne<R extends Model<R>>(
		related: any,
		foreignKey?: string,
		localKey?: string,
	): HasOne<R> {
		return new HasOne(this as any, related, foreignKey, localKey);
	}

	protected static hasMany<R extends Model<R>>(
		related: any,
		foreignKey?: string,
		localKey?: string,
	): HasMany<R> {
		return new HasMany(this as any, related, foreignKey, localKey);
	}

	protected static belongsTo<R extends Model<R>>(
		related: any,
		foreignKey?: string,
		localKey?: string,
	): BelongsTo<R> {
		return new BelongsTo(this as any, related, foreignKey, localKey);
	}

	protected static belongsToMany<R extends Model<R>>(
		related: any,
		pivotTable: string,
		foreignPivotKey?: string,
		relatedPivotKey?: string,
		parentKey?: string,
		relatedKey?: string,
	): BelongsToMany<R> {
		return new BelongsToMany(
			this as any,
			related,
			pivotTable,
			foreignPivotKey,
			relatedPivotKey,
			parentKey,
			relatedKey,
		);
	}

	protected static morphTo<R extends Model<R>>(
		config: MorphToConfig<R>,
	): MorphTo<R> {
		return new MorphTo(this as any, config);
	}

	/**
	 * Refresh the model instance from the database
	 */
	async refresh(): Promise<void> {
		const self = this as any;
		const config = this.getConfig();
		const primaryKey = config.primaryKey || 'id';

		// Build WHERE conditions for composite or single primary key
		let query = (self.constructor as any).query();
		
		if (Array.isArray(primaryKey)) {
			// Composite primary key
			for (const key of primaryKey) {
				const value = self._attributes[key];
				if (value === undefined || value === null) {
					throw new Error(`Cannot refresh model without primary key value for ${key}`);
				}
				query = query.where(key, value);
			}
		} else {
			// Single primary key
			const primaryKeyValue = self._attributes[primaryKey];
			if (!primaryKeyValue) {
				throw new Error('Cannot refresh model without a primary key value');
			}
			query = query.where(primaryKey, primaryKeyValue);
		}

		const loadedRelationships: string[] = [];
		const ctor = Object.getPrototypeOf(self).constructor as typeof Model;
		const relationships = ctor.relationships;

		if (relationships) {
			for (const relationName in relationships) {
				const privateKey = `_${relationName}`;
				if (privateKey in self && self[privateKey] !== undefined) {
					loadedRelationships.push(relationName);
				}
			}
		}

		const fresh = await query.first();

		if (!fresh) {
			const keyStr = Array.isArray(primaryKey) 
				? primaryKey.map(k => `${k}=${self._attributes[k]}`).join(', ')
				: `${primaryKey}=${self._attributes[primaryKey]}`;
			throw new Error(`Model with ${keyStr} no longer exists`);
		}

		self._attributes = { ...(fresh as any)._attributes };
		self._original = { ...(fresh as any)._original };
		self._exists = (fresh as any)._exists;

		for (const relationName of loadedRelationships) {
			const privateKey = `_${relationName}`;
			const loadingKey = `_loading_${relationName}`;

			delete self[privateKey];
			delete self[loadingKey];

			await self.load(relationName);
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
