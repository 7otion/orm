/**
 * HasMany Relationship
 *
 * Represents a one-to-many relationship.
 *
 * Example:
 * class User extends Model {
 *   static defineRelationships() {
 *     return {
 *       posts: new HasMany(this, Post, 'user_id')
 *     };
 *   }
 *
 *   get posts() {
 *     return this.getWithSuspense<Post[]>('posts');
 *   }
 * }
 *
 * Usage:
 * const users = await User.query().with('posts').get();
 * users[0].posts  // Eager loaded
 *
 * const user = await User.find(1);
 * user.posts  // Lazy loaded automatically
 */

import { Relationship } from '@/relationships/relationship';
import { QueryBuilder } from '@/query-builder';
import type { Model } from '@/model';

export class HasMany<T extends Model<T>> extends Relationship<T> {
	/**
	 * Get a query builder for the related models
	 * Automatically adds WHERE clause for the foreign key
	 *
	 * Example:
	 * user.posts() returns a QueryBuilder with:
	 * WHERE user_id = <user's id>
	 */
	getQuery(): QueryBuilder<T> {
		// Get table name from related model
		const config = (this.related as any).config;
		const tableName = config.table;

		// Create query builder for related model
		const query = new QueryBuilder(this.related, tableName);

		// Add constraint: WHERE foreign_key = parent's local key value
		const localValue = (this.parent as any)[this.localKey];
		query.where(this.foreignKey, localValue);

		return query;
	}

	/**
	 * Eager load HasMany relationships for multiple models
	 *
	 * Strategy:
	 * 1. Collect all parent IDs
	 * 2. Query related records WHERE foreign_key IN (parent_ids)
	 * 3. Group related records by foreign key
	 * 4. Attach groups to parent models
	 *
	 * This turns N+1 queries into 1 query
	 */
	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		// Collect all parent local key values
		const localValues = models.map(model => (model as any)[this.localKey]);

		// Query related records with IN clause
		const config = (this.related as any).config;
		const tableName = config.table;
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.foreignKey, 'IN', localValues)
			.get();

		// Group related models by foreign key value
		const relatedMap = new Map<any, T[]>();
		for (const related of relatedModels) {
			const foreignValue = (related as any)[this.foreignKey];

			if (!relatedMap.has(foreignValue)) {
				relatedMap.set(foreignValue, []);
			}

			relatedMap.get(foreignValue)!.push(related);
		}

		// Attach related models to parents using _relationshipName pattern
		// This allows getWithSuspense() to access loaded data
		for (const model of models) {
			const localValue = (model as any)[this.localKey];
			const related = relatedMap.get(localValue) || [];
			(model as any)[`_${relationName}`] = related;
		}
	}

	/**
	 * Get all related models
	 */
	async get(): Promise<T[]> {
		return this.getQuery().get();
	}

	/**
	 * Get the first related model
	 */
	async first(): Promise<T | null> {
		return this.getQuery().first();
	}
}
