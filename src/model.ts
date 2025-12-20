/**
 * Model Base Class - Active Record pattern with automatic relationships
 */

import { QueryBuilder } from '@/query-builder';
import { ORM } from '@/orm';

import type { ModelConfig, QueryValue, TimestampConfig } from '@/types';

/**
 * Type for Model constructor
 * Used by QueryBuilder and relationships to instantiate models
 */
export interface ModelConstructor<T extends Model<T>> {
	new (): T;
	config: ModelConfig;
	defineRelationships?(): Record<string, any>;
	query(): QueryBuilder<T>;
	find(id: QueryValue): Promise<T | null>;
	all(): Promise<T[]>;
	create(data: Record<string, any>): Promise<T>;
}

/**
 * Base Model class
 */
export abstract class Model<T extends Model<T>> {
	static config: ModelConfig = {
		primaryKey: 'id',
		timestamps: false,
	};

	private _attributes: Record<string, any> = {};
	private _original: Record<string, any> = {};
	private _exists: boolean = false;

	/**
	 * Returns Proxy to enable natural property access and relationship getters
	 */
	constructor() {
		return new Proxy(this, {
			get(target: any, prop: string | symbol) {
				// Internal properties and symbols bypass proxy logic
				if (typeof prop === 'symbol' || prop.startsWith('_')) {
					return target[prop];
				}

				// Check prototype for methods and getters
				const descriptor = Object.getOwnPropertyDescriptor(
					Object.getPrototypeOf(target),
					prop,
				);

				// Execute getters (e.g., user.posts getter)
				if (descriptor && descriptor.get) {
					return descriptor.get.call(target);
				}

				// Bind methods to maintain context
				if (descriptor && typeof descriptor.value === 'function') {
					return target[prop].bind(target);
				}

				// Check instance properties (used for eager-loaded relationships via _posts, _profile)
				if (Object.prototype.hasOwnProperty.call(target, prop)) {
					return target[prop];
				}

				// Default: Return from _attributes (data properties like user.name, user.email)
				return target._attributes[prop];
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
		});
	}

	private getConfig(): Required<ModelConfig> {
		const constructor = this.constructor as typeof Model;
		const config = constructor.config;

		// Auto-derive table name from class name if not provided
		let tableName = config.table;
		if (!tableName) {
			tableName = this.deriveTableName(constructor.name);
		}

		// Merge with defaults
		return {
			table: tableName,
			primaryKey: config.primaryKey || 'id',
			timestamps: config.timestamps || false,
		};
	}

	/**
	 * User -> users, Category -> categories, BlogPost -> blog_posts
	 */
	private deriveTableName(className: string): string {
		// Convert PascalCase to snake_case
		const snakeCase = className
			.replace(/([A-Z])/g, '_$1')
			.toLowerCase()
			.replace(/^_/, '');

		// Pluralize (simple rules)
		if (snakeCase.endsWith('y')) {
			return snakeCase.slice(0, -1) + 'ies'; // Category -> categories
		} else if (snakeCase.endsWith('s')) {
			return snakeCase + 'es'; // Class -> classes
		} else {
			return snakeCase + 's'; // User -> users
		}
	}

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

	/**
	 * Insert a new record into the database
	 *
	 * This is called for NEW models that don't exist yet.
	 * Automatically adds timestamps if enabled.
	 * Write operation is queued if ORM is configured with enableWriteQueue (SQLite).
	 *
	 * @returns The inserted model (with ID populated)
	 */
	async insert(): Promise<this> {
		const orm = ORM.getInstance();

		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = this.getConfig();
			const timestampConfig = this.getTimestampConfig();

			// Add timestamps if enabled
			if (timestampConfig) {
				const now = dialect.getCurrentTimestamp();
				this._attributes[timestampConfig.created_at] = now;
				this._attributes[timestampConfig.updated_at] = now;
			}

			// Compile INSERT query
			const compiled = dialect.compileInsert(
				config.table,
				this._attributes,
			);

			// Execute and get inserted ID
			const insertedId = await adapter.insert(
				compiled.sql,
				compiled.bindings,
			);

			// Update model with new ID
			this._attributes[config.primaryKey] = insertedId;

			// Mark as existing and sync original values
			this._exists = true;
			this._original = { ...this._attributes };

			return this;
		});
	}

	/**
	 * Update an existing record in the database
	 *
	 * Only updates fields that have changed (dirty fields).
	 * Automatically updates updated_at timestamp if enabled.
	 * Write operation is queued if ORM is configured with enableWriteQueue (SQLite).
	 *
	 * @returns The updated model
	 */
	async update(): Promise<this> {
		if (!this._exists) {
			throw new Error(
				'Cannot update a model that does not exist. Use insert() instead.',
			);
		}

		const orm = ORM.getInstance();

		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = this.getConfig();
			const timestampConfig = this.getTimestampConfig();

			// Get only dirty fields
			const dirtyFields = this.getDirty();

			if (dirtyFields.length === 0) {
				// Nothing to update
				return this;
			}

			// Build data object with only dirty fields
			const data: Record<string, QueryValue> = {};
			for (const field of dirtyFields) {
				data[field] = this._attributes[field];
			}

			// Update updated_at timestamp if enabled
			if (timestampConfig) {
				const now = dialect.getCurrentTimestamp();
				data[timestampConfig.updated_at] = now;
				this._attributes[timestampConfig.updated_at] = now;
			}

			// Get primary key value
			const id = this._attributes[config.primaryKey];

			// Compile UPDATE query
			const compiled = dialect.compileUpdate(
				config.table,
				data,
				config.primaryKey,
				id,
			);

			// Execute
			await adapter.execute(compiled.sql, compiled.bindings);

			// Sync original values
			this._original = { ...this._attributes };

			// Auto-clear relationships when model updates
			this.clearRelationships();

			return this;
		});
	}

	/**
	 * Delete this record from the database
	 *
	 * Write operation is queued if ORM is configured with enableWriteQueue (SQLite).
	 *
	 * @returns True if deleted successfully
	 */
	async delete(): Promise<boolean> {
		if (!this._exists) {
			throw new Error('Cannot delete a model that does not exist.');
		}

		const orm = ORM.getInstance();

		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();
			const config = this.getConfig();

			// Get primary key value
			const id = this._attributes[config.primaryKey];

			// Compile DELETE query
			const compiled = dialect.compileDelete(
				config.table,
				config.primaryKey,
				id,
			);

			// Execute
			await adapter.execute(compiled.sql, compiled.bindings);

			// Mark as not existing
			this._exists = false;

			return true;
		});
	}

	/**
	 * Check if the model has unsaved changes
	 */
	get isDirty(): boolean {
		return this.getDirty().length > 0;
	}

	getDirty(): string[] {
		const dirty: string[] = [];

		for (const key in this._attributes) {
			if (this._attributes[key] !== this._original[key]) {
				dirty.push(key);
			}
		}

		return dirty;
	}

	/**
	 * Get an object showing what changed
	 *
	 * @returns Object mapping field names to { old, new } values
	 */
	getChanges(): Record<string, { old: any; new: any }> {
		const changes: Record<string, { old: any; new: any }> = {};

		for (const key of this.getDirty()) {
			changes[key] = {
				old: this._original[key],
				new: this._attributes[key],
			};
		}

		return changes;
	}

	/**
	 * Get all attributes as a plain object
	 * Useful for serialization
	 */
	toJSON(): Record<string, any> {
		return { ...this._attributes };
	}

	// ==================== Relationship Property Access ====================

	/**
	 * Helper for React Suspense-compatible relationship getters.
	 */
	protected getWithSuspense<R>(relationshipName: string): R {
		const privateKey = `_${relationshipName}`;

		if ((this as any)[privateKey] !== undefined) {
			return (this as any)[privateKey];
		}

		const loadingKey = `_loading_${relationshipName}`;
		if ((this as any)[loadingKey]) {
			throw (this as any)[loadingKey];
		}

		const promise = this.loadRelationship(relationshipName).then(() => {
			delete (this as any)[loadingKey];
		});

		(this as any)[loadingKey] = promise;
		throw promise;
	}

	private getRelationshipDefinitions(): Record<string, any> {
		const constructor = this.constructor as typeof Model;
		if (typeof (constructor as any).defineRelationships === 'function') {
			return (constructor as any).defineRelationships();
		}
		return {};
	}

	private async loadRelationship(relationshipName: string): Promise<void> {
		const relationships = this.getRelationshipDefinitions();
		const relationship = relationships[relationshipName];

		if (!relationship) {
			throw new Error(
				`Relationship '${relationshipName}' not found in defineRelationships()`,
			);
		}

		if (typeof relationship.get !== 'function') {
			throw new Error(
				`Relationship '${relationshipName}' must have a get() method`,
			);
		}

		const result = await relationship.get();
		(this as any)[`_${relationshipName}`] = result;
	}

	// ==================== Static Query Methods ====================

	/**
	 * Get a QueryBuilder instance for this model
	 *
	 * Example:
	 * const users = await User.query()
	 *   .where('age', '>', 18)
	 *   .orderBy('name')
	 *   .get();
	 */
	static query<T extends Model<T>>(this: new () => T): QueryBuilder<T> {
		const config = (this as any).config;
		return new QueryBuilder(this as any, config.table);
	}

	/**
	 * Find a record by primary key
	 *
	 * @param id - Primary key value
	 * @returns Model instance or null if not found
	 */
	static async find<T extends Model<T>>(
		this: new () => T,
		id: QueryValue,
	): Promise<T | null> {
		const config = (this as any).config;
		const primaryKey = config.primaryKey || 'id';

		return (this as any).query().where(primaryKey, id).first();
	}

	/**
	 * Get all records
	 *
	 * @returns Array of all model instances
	 */
	static async all<T extends Model<T>>(this: new () => T): Promise<T[]> {
		return (this as any).query().get();
	}

	/**
	 * Create and insert a new record in one call
	 *
	 * @param data - Initial data for the model
	 * @returns The created model instance
	 */
	static async create<T extends Model<T>>(
		this: new () => T,
		data: Record<string, any>,
	): Promise<T> {
		const model = new this();

		// Set all properties
		for (const [key, value] of Object.entries(data)) {
			(model as any)[key] = value;
		}

		await model.insert();
		return model;
	}

	clearRelationships(): void {
		const relationships = this.getRelationshipDefinitions();

		for (const relationName in relationships) {
			const privateProp = `_${relationName}`;
			if (privateProp in this) {
				delete (this as any)[privateProp];
			}
		}
	}

	/**
	 * Refresh model data from database
	 */
	async refresh(): Promise<this> {
		if (!this._exists) {
			throw new Error('Cannot refresh a model that does not exist');
		}

		const config = this.getConfig();
		const constructor = this.constructor as typeof Model;
		const id = this._attributes[config.primaryKey];

		const fresh = await (constructor as any).find(id);
		if (!fresh) {
			throw new Error('Model no longer exists in database');
		}

		this._attributes = { ...(fresh as any)._attributes };
		this._original = { ...(fresh as any)._original };
		this.clearRelationships();

		return this;
	}
}
