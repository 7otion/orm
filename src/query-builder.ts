/**
 * QueryBuilder
 *
 * Implements the Builder pattern for constructing database queries.
 *
 * Key Design Decisions:
 * - Builds a QueryStructure (data), doesn't generate SQL directly
 * - Fluent API - each method returns 'this' for chaining
 * - Type-safe - returns typed model instances, not raw rows
 * - Supports both lazy loading (for relationships) and eager loading (with())
 *
 * QueryBuilder does NOT:
 * - Generate SQL (that's SqlDialect's job)
 * - Execute queries directly (uses ORM's adapter)
 * - Know about database specifics
 */

import type {
	DatabaseRow,
	OrderDirection,
	QueryStructure,
	QueryValue,
	WhereValue,
	WhereCondition,
	WhereOperator,
} from './types';
import type { Model, ModelConstructor } from './model';
import { ORM } from './orm';

export class QueryBuilder<T extends Model<T>> {
	private query: QueryStructure;
	private modelClass: ModelConstructor<T>;
	private eagerLoad: Map<string, () => any> = new Map();

	private relationshipConstraint?: (query: QueryBuilder<T>) => void;

	constructor(modelClass: ModelConstructor<T>, tableName: string) {
		this.modelClass = modelClass;
		this.query = {
			table: tableName,
			wheres: [],
			orders: [],
		};
	}

	/**
	 * Add a WHERE clause to the query
	 * where('age', '>', 18) or where('status', 'active')
	 */
	where(
		column: string,
		operatorOrValue: WhereOperator | QueryValue,
		value?: WhereValue,
	): this {
		let operator: WhereOperator;
		let actualValue: WhereValue;

		// Handle both signatures: where(col, op, val) and where(col, val)
		if (value === undefined) {
			operator = '=';
			actualValue = operatorOrValue as WhereValue;
		} else {
			operator = operatorOrValue as WhereOperator;
			actualValue = value;
		}

		const condition: WhereCondition = {
			type: 'basic',
			column: String(column),
			operator,
			value: actualValue,
		};

		this.query.wheres.push(condition);
		return this;
	}

	/**
	 * whereRaw('age > ? AND status = ?', [18, 'active'])
	 */
	whereRaw(sql: string, bindings: QueryValue[] = []): this {
		const condition: WhereCondition = {
			type: 'raw',
			sql,
			bindings,
		};

		this.query.wheres.push(condition);
		return this;
	}

	/**
	 * join('INNER', 'posts', 'posts.user_id', '=', 'users.id')
	 */
	join(
		type: 'INNER' | 'LEFT' | 'RIGHT',
		table: string,
		first: string,
		operator: string,
		second: string,
	): this {
		if (!this.query.joins) {
			this.query.joins = [];
		}

		this.query.joins.push({
			type,
			table,
			first,
			operator,
			second,
		});

		return this;
	}

	innerJoin(
		table: string,
		first: string,
		operator: string,
		second: string,
	): this {
		return this.join('INNER', table, first, operator, second);
	}

	leftJoin(
		table: string,
		first: string,
		operator: string,
		second: string,
	): this {
		return this.join('LEFT', table, first, operator, second);
	}

	/**
	 * orderBy('created_at', 'desc')
	 */
	orderBy(column: string, direction: OrderDirection = 'asc'): this {
		this.query.orders.push({ column, direction });
		return this;
	}

	/**
	 * Raw ORDER BY clause for complex sorting
	 *
	 * Example:
	 * - orderByRaw('created_at DESC, name ASC')
	 */
	orderByRaw(sql: string): this {
		this.query.orders.push({
			column: sql,
			direction: 'raw' as OrderDirection,
		});
		return this;
	}

	limit(limit: number): this {
		this.query.limitValue = limit;
		return this;
	}

	offset(offset: number): this {
		this.query.offsetValue = offset;
		return this;
	}

	/**
	 * Specify columns to select (default: all columns)
	 * select('id', 'name') or select(['id', 'name'])
	 */
	select(...columns: (keyof T | string)[]): this {
		this.query.columns = columns.map(String);
		return this;
	}

	/**
	 * Raw SELECT clause for complex expressions or aggregates
	 * selectRaw('COUNT(*) as total, MAX(created_at) as latest')
	 */
	selectRaw(sql: string): this {
		this.query.selectRaw = sql;
		return this;
	}

	/**
	 * Specify relationships to eager load
	 * Supports nested relationships with dot notation
	 *
	 * @example
	 * // Single-level relationships
	 * User.query().with('posts', 'profile').get()
	 *
	 * // Nested relationships
	 * Post.query().with('category.contentType').get()
	 * User.query().with('posts.comments.author').get()
	 */
	with(...relations: string[]): this {
		for (const relation of relations) {
			this.eagerLoad.set(relation, relation as any);
		}
		return this;
	}

	/**
	 * Extract table names from the query for cache tagging
	 */
	private extractTableNames(): string[] {
		const tables = new Set<string>();

		tables.add(this.query.table);
		if (this.query.joins) {
			for (const join of this.query.joins) {
				tables.add(join.table);
			}
		}

		return Array.from(tables);
	}

	setRelationshipConstraint(
		constraint: (query: QueryBuilder<T>) => void,
	): this {
		this.relationshipConstraint = constraint;
		return this;
	}

	async get(): Promise<T[]> {
		// Apply relationship constraint if this is a relationship query
		if (this.relationshipConstraint) {
			this.relationshipConstraint(this);
		}

		const orm = ORM.getInstance();
		const dialect = orm.getDialect();

		const compiled = dialect.compileSelect(this.query);

		const tables = orm.resultCacheAdapter ? this.extractTableNames() : [];
		const rows = await orm.cachedSelect(
			compiled.sql,
			compiled.bindings,
			tables,
		);

		const models = rows.map((row: DatabaseRow) => this.hydrate(row));

		// Eager load relationships if requested
		if (this.eagerLoad.size > 0) {
			await this.loadRelationships(models);
		}

		return models;
	}

	async first(): Promise<T | null> {
		this.limit(1);

		const results = await this.get();
		return results.length > 0 ? results[0]! : null;
	}

	/**
	 * Paginate results
	 * Returns paginated data with total count
	 */
	async paginate(
		page: number = 1,
		limit: number = 20,
	): Promise<{ data: T[]; total: number }> {
		// Apply relationship constraint if this is a relationship query
		if (this.relationshipConstraint) {
			this.relationshipConstraint(this);
		}

		const orm = ORM.getInstance();
		const dialect = orm.getDialect();

		const countQuery = { ...this.query };
		const countCompiled = dialect.compileCount(countQuery);
		const countTables = this.extractTableNames();
		const countResult = await orm.cachedSelect(
			countCompiled.sql,
			countCompiled.bindings,
			countTables,
		);
		const total = countResult[0]?.count || 0;

		const offset = (page - 1) * limit;
		this.limit(limit).offset(offset);

		const compiled = dialect.compileSelect(this.query);
		const dataTables = this.extractTableNames();
		const rows = await orm.cachedSelect(
			compiled.sql,
			compiled.bindings,
			dataTables,
		);

		const models = rows.map((row: DatabaseRow) => this.hydrate(row));

		if (this.eagerLoad.size > 0) {
			await this.loadRelationships(models);
		}

		return { data: models, total };
	}

	private hydrate(row: DatabaseRow): T {
		const model = new this.modelClass();

		// Set internal state directly to avoid marking as dirty
		(model as any)._attributes = { ...row };
		(model as any)._original = { ...row };
		(model as any)._exists = true;

		return model;
	}

	private async loadRelationships(models: T[]): Promise<void> {
		if (models.length === 0) return;

		const firstModel = models[0];
		const modelConstructor = firstModel!.constructor as any;

		// Access the static relationships getter
		const relationships = modelConstructor.relationships;

		if (!relationships || Object.keys(relationships).length === 0) {
			return;
		}

		for (const relationName of this.eagerLoad.keys()) {
			// Check if this is a nested relationship (contains dots)
			if (relationName.includes('.')) {
				await this.loadNestedRelationship(
					models,
					relationName,
					relationships,
				);
			} else {
				// Single-level relationship (existing logic)
				const relationship = relationships[relationName];

				if (!relationship) {
					// Skip unknown relationships - they might be handled by afterEagerLoad
					continue;
				}

				if (typeof relationship.eagerLoadFor === 'function') {
					await relationship.eagerLoadFor(models, relationName);
				}
			}
		}

		// Call hook for custom post-load logic
		if (typeof modelConstructor.afterEagerLoad === 'function') {
			await modelConstructor.afterEagerLoad(models);
		}
	}

	/**
	 * Load nested relationships recursively
	 * Handles relationships like 'category.contentType'
	 */
	private async loadNestedRelationship(
		models: T[],
		nestedRelation: string,
		relationships: Record<string, any>,
	): Promise<void> {
		const relationParts = nestedRelation.split('.');
		const firstLevelRelation = relationParts[0]!;
		const remainingRelations = relationParts.slice(1).join('.');

		// First, load the top-level relationship
		const relationship = relationships?.[firstLevelRelation];

		if (!relationship) {
			throw new Error(
				`Relationship '${firstLevelRelation}' not found in static relationships constant`,
			);
		}

		if (typeof relationship.eagerLoadFor === 'function') {
			await relationship.eagerLoadFor(models, firstLevelRelation);
		}

		// If there are more nested levels, load them recursively
		if (remainingRelations) {
			// Get the related models from the loaded relationship
			const relatedModels = this.getRelatedModelsFromLoadedRelationship(
				models,
				firstLevelRelation,
			);

			// Filter out null/undefined related models
			const validRelatedModels = relatedModels.filter(
				model => model != null,
			);

			if (validRelatedModels.length > 0) {
				// Recursively load the remaining nested relationships
				await this.loadNestedRelationshipOnRelatedModels(
					validRelatedModels,
					remainingRelations,
					relationship.getRelated(),
				);
			}
		}
	}

	/**
	 * Extract related models from a loaded relationship
	 */
	private getRelatedModelsFromLoadedRelationship(
		parentModels: T[],
		relationName: string,
	): any[] {
		const relatedModels: any[] = [];

		for (const parentModel of parentModels) {
			const privateKey = `_${relationName}`;
			const loadedData = (parentModel as any)[privateKey];

			if (loadedData != null) {
				if (Array.isArray(loadedData)) {
					relatedModels.push(...loadedData);
				} else {
					relatedModels.push(loadedData);
				}
			}
		}

		return relatedModels;
	}

	/**
	 * Recursively load nested relationships on related models
	 */
	private async loadNestedRelationshipOnRelatedModels(
		relatedModels: any[],
		remainingRelation: string,
		relatedModelConstructor: any,
	): Promise<void> {
		// Get relationships from the related model class
		const relationships = relatedModelConstructor.relationships;

		if (!relationships || Object.keys(relationships).length === 0) {
			return;
		}

		// Check if this is still nested
		if (remainingRelation.includes('.')) {
			await this.loadNestedRelationship(
				relatedModels,
				remainingRelation,
				relationships,
			);
		} else {
			// Load the final level relationship
			const relationship = relationships[remainingRelation];

			if (!relationship) {
				throw new Error(
					`Relationship '${remainingRelation}' not found in ${relatedModelConstructor.name} relationships`,
				);
			}

			if (typeof relationship.eagerLoadFor === 'function') {
				await relationship.eagerLoadFor(
					relatedModels,
					remainingRelation,
				);
			}
		}
	}

	/**
	 * Get the query structure (for internal use)
	 * Used by relationship classes to inspect the query
	 */
	getQuery(): QueryStructure {
		return this.query;
	}
}
