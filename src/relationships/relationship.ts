/**
 * Base Relationship Class
 *
 * All relationship types (HasOne, HasMany, BelongsToMany) extend this class.
 *
 * Key Responsibilities:
 * - Provide a QueryBuilder for the related model
 * - Define how to load related records (lazy loading)
 * - Define how to eager load for multiple parent models
 *
 * Relationship Pattern:
 * - Relationships return a QueryBuilder, not results
 * - This allows chaining: user.posts().where('status', 'published').get()
 * - Lazy loading: call get() on the builder
 * - Eager loading: use with() on the parent query
 */

import { QueryBuilder } from '@/query-builder';
import type { Model, ModelConstructor } from '@/model';

export abstract class Relationship<T extends Model<T>> {
	/**
	 * The parent model this relationship is attached to
	 */
	protected parent: Model<any>;

	/**
	 * The related model class
	 */
	protected related: ModelConstructor<T>;

	/**
	 * The foreign key column name
	 */
	protected foreignKey: string;

	/**
	 * The local key column name (usually primary key)
	 */
	protected localKey: string;

	constructor(
		parent: Model<any>,
		related: ModelConstructor<T>,
		foreignKey: string,
		localKey: string,
	) {
		this.parent = parent;
		this.related = related;
		this.foreignKey = foreignKey;
		this.localKey = localKey;
	}

	/**
	 * Get a query builder for the related model with relationship constraints
	 * This is what gets called when you do user.posts()
	 *
	 * @returns QueryBuilder for the related model
	 */
	abstract getQuery(): QueryBuilder<T>;

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
