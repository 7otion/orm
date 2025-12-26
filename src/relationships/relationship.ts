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

export abstract class Relationship<T extends Model<T>> {
	protected parentConstructor: ModelConstructor<any>;
	protected related: ModelConstructor<T>;
	protected foreignKey: string;
	protected localKey: string;

	constructor(
		parent: ModelConstructor<any> | Model<any>,
		related: any,
		foreignKey?: string,
		localKey?: string,
	) {
		if (typeof parent === 'function') {
			this.parentConstructor = parent;
		} else {
			this.parentConstructor =
				parent.constructor as ModelConstructor<any>;
		}

		this.related = related;

		if (!foreignKey) {
			const parentClassName = this.parentConstructor.name;
			const snakeCase = parentClassName
				.replace(/Model$/, '')
				.replace(/([A-Z])/g, '_$1')
				.toLowerCase()
				.replace(/^_/, '');
			this.foreignKey = `${snakeCase}_id`;
		} else {
			this.foreignKey = foreignKey;
		}

		if (!localKey) {
			this.localKey = this.parentConstructor.config?.primaryKey || 'id';
		} else {
			this.localKey = localKey;
		}
	}

	protected getParentKeyValue(parent: Model<any>): any {
		return (parent as any)[this.localKey];
	}

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
	abstract eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void>;

	/**
	 * Get the related model class
	 */
	getRelated(): ModelConstructor<T> {
		return this.related;
	}

	/**
	 * Get the foreign key
	 */
	getForeignKey(): string {
		return this.foreignKey;
	}

	/**
	 * Get the local key
	 */
	getLocalKey(): string {
		return this.localKey;
	}
}
