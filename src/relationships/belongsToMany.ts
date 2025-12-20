/**
 * BelongsToMany Relationship
 *
 * Represents a many-to-many relationship through a pivot table.
 *
 * Example:
 * class User extends Model {
 *   static defineRelationships() {
 *     return {
 *       roles: new BelongsToMany(this, Role, 'user_roles', 'user_id', 'role_id')
 *     };
 *   }
 *
 *   get roles() {
 *     return this.getWithSuspense<Role[]>('roles');
 *   }
 * }
 *
 * Database structure:
 * users: id, name
 * roles: id, name
 * user_roles: user_id, role_id (pivot table)
 *
 * Usage:
 * const users = await User.query().with('roles').get();
 * users[0].roles  // Eager loaded
 *
 * const user = await User.find(1);
 * user.roles  // Lazy loaded automatically
 */

import { Relationship } from '@/relationships/relationship';
import { QueryBuilder } from '@/query-builder';
import type { Model, ModelConstructor } from '@/model';
import { ORM } from '@/orm';

export class BelongsToMany<T extends Model<T>> extends Relationship<T> {
	/**
	 * The pivot table name
	 */
	private pivotTable: string;

	/**
	 * The foreign key in the pivot table for the parent model
	 */
	private foreignPivotKey: string;

	/**
	 * The foreign key in the pivot table for the related model
	 */
	private relatedPivotKey: string;

	/**
	 * The local key on the parent model (usually primary key)
	 */
	private parentKey: string;

	/**
	 * The local key on the related model (usually primary key)
	 */
	private relatedKey: string;

	constructor(
		parent: Model<any>,
		related: ModelConstructor<T>,
		pivotTable: string,
		foreignPivotKey: string,
		relatedPivotKey: string,
		parentKey: string = 'id',
		relatedKey: string = 'id',
	) {
		// Call parent with dummy values - we override the behavior
		super(parent, related, foreignPivotKey, parentKey);

		this.pivotTable = pivotTable;
		this.foreignPivotKey = foreignPivotKey;
		this.relatedPivotKey = relatedPivotKey;
		this.parentKey = parentKey;
		this.relatedKey = relatedKey;
	}

	/**
	 * Get a query builder for the related models
	 * Uses a JOIN to connect through the pivot table
	 *
	 * Example SQL:
	 * SELECT roles.* FROM roles
	 * INNER JOIN user_roles ON roles.id = user_roles.role_id
	 * WHERE user_roles.user_id = ?
	 */
	getQuery(): QueryBuilder<T> {
		const config = (this.related as any).config;
		const tableName = config.table;
		const parentValue = (this.parent as any)[this.parentKey];

		// Create base query
		const query = new QueryBuilder(this.related, tableName);

		query.innerJoin(
			this.pivotTable,
			`${tableName}.${this.relatedKey}`,
			'=',
			`${this.pivotTable}.${this.relatedPivotKey}`,
		);

		// Filter by parent value in the pivot table
		query.where(`${this.pivotTable}.${this.foreignPivotKey}`, parentValue);

		return query;
	}

	/**
	 * Eager load BelongsToMany relationships for multiple models
	 *
	 * Strategy:
	 * 1. Collect all parent IDs
	 * 2. Query pivot table WHERE foreign_pivot_key IN (parent_ids)
	 * 3. Get all related IDs from pivot table
	 * 4. Query related models WHERE id IN (related_ids)
	 * 5. Map everything back together using the pivot table
	 */
	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		// Collect all parent key values
		const parentValues = models.map(
			model => (model as any)[this.parentKey],
		);

		// Query pivot table
		const orm = ORM.getInstance();
		const dialect = orm.getDialect();
		const adapter = orm.getAdapter();

		// Get pivot records
		const pivotQuery = dialect.compileSelect({
			table: this.pivotTable,
			wheres: [
				{
					type: 'basic',
					column: this.foreignPivotKey,
					operator: 'IN',
					value: parentValues,
				},
			],
			orders: [],
		});

		const pivotRows = await adapter.query(
			pivotQuery.sql,
			pivotQuery.bindings,
		);

		if (pivotRows.length === 0) {
			// No related records - set empty arrays
			for (const model of models) {
				(model as any)[relationName] = [];
			}
			return;
		}

		// Collect related IDs from pivot table
		const relatedIds = [
			...new Set(pivotRows.map((row: any) => row[this.relatedPivotKey])),
		];

		// Query related models
		const config = (this.related as any).config;
		const tableName = config.table;
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.relatedKey, 'IN', relatedIds)
			.get();

		// Create a map of related models by their key
		const relatedMap = new Map<any, T>();
		for (const related of relatedModels) {
			const key = (related as any)[this.relatedKey];
			relatedMap.set(key, related);
		}

		// Group related models by parent using pivot table
		const parentRelatedMap = new Map<any, T[]>();
		for (const pivotRow of pivotRows) {
			const parentValue = pivotRow[this.foreignPivotKey];
			const relatedValue = pivotRow[this.relatedPivotKey];
			const relatedModel = relatedMap.get(relatedValue);

			if (relatedModel) {
				if (!parentRelatedMap.has(parentValue)) {
					parentRelatedMap.set(parentValue, []);
				}
				parentRelatedMap.get(parentValue)!.push(relatedModel);
			}
		}

		// Attach related models to parents using _relationshipName pattern
		// This allows getWithSuspense() to access loaded data
		for (const model of models) {
			const parentValue = (model as any)[this.parentKey];
			const related = parentRelatedMap.get(parentValue) || [];
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
