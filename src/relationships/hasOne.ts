/**
 * HasOne Relationship
 *
 * Represents a one-to-one relationship.
 *
 * Example:
 * class User extends Model {
 *   static defineRelationships() {
 *     return {
 *       profile: new HasOne(this, Profile, 'user_id')
 *     };
 *   }
 *
 *   get profile() {
 *     return this.getWithSuspense<Profile | null>('profile');
 *   }
 * }
 *
 * Usage:
 * const users = await User.query().with('profile').get();
 * users[0].profile  // Eager loaded
 *
 * const user = await User.find(1);
 * user.profile  // Lazy loaded automatically
 */

import { Relationship } from '@/relationships/relationship';
import { QueryBuilder } from '@/query-builder';
import type { Model } from '@/model';

export class HasOne<T extends Model<T>> extends Relationship<T> {
	/**
	 * Get a query builder for the related model
	 * Automatically adds WHERE clause for the foreign key
	 *
	 * Example:
	 * user.profile() returns a QueryBuilder with:
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
	 * Eager load HasOne relationships for multiple models
	 *
	 * Strategy:
	 * 1. Collect all parent IDs
	 * 2. Query related records WHERE foreign_key IN (parent_ids)
	 * 3. Map related records back to parent models
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

		// Map related models back to parents
		// For HasOne, each parent gets at most one related model
		const relatedMap = new Map();
		for (const related of relatedModels) {
			const foreignValue = (related as any)[this.foreignKey];
			relatedMap.set(foreignValue, related);
		}

		// Attach related models to parents using _relationshipName pattern
		// This allows getWithSuspense() to access loaded data
		for (const model of models) {
			const localValue = (model as any)[this.localKey];
			const related = relatedMap.get(localValue) || null;
			(model as any)[`_${relationName}`] = related;
		}
	}

	/**
	 * Get the first (and only) related model
	 * Convenience method for HasOne since it returns a single model
	 */
	async first(): Promise<T | null> {
		return this.getQuery().first();
	}

	/**
	 * Get the related model (same as first() for HasOne)
	 */
	async get(): Promise<T | null> {
		return this.first();
	}
}
