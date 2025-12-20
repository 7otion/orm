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
 *
 * Usage:
 * const users = await User.query()
 *   .where('age', '>', 18)
 *   .orderBy('name', 'asc')
 *   .limit(10)
 *   .get();
 */

import type {
	DatabaseRow,
	OrderDirection,
	QueryStructure,
	QueryValue,
	WhereValue,
	WhereCondition,
	WhereOperator,
} from '@/types';
import type { Model, ModelConstructor } from '@/model';
import { ORM } from '@/orm';

export class QueryBuilder<T extends Model<T>> {
	/**
	 * The query structure being built
	 * This is what gets passed to SqlDialect for compilation
	 */
	private query: QueryStructure;

	/**
	 * The Model class this query is for
	 * Used to instantiate results as typed model instances
	 */
	private modelClass: ModelConstructor<T>;

	/**
	 * Relationships to eager load with the query
	 * Maps relationship name to the relationship method
	 */
	private eagerLoad: Map<string, () => any> = new Map();

	/**
	 * Constraint function for relationship queries
	 * Applied when loading relationship data
	 */
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
			column,
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

	limit(limit: number): this {
		this.query.limitValue = limit;
		return this;
	}

	offset(offset: number): this {
		this.query.offsetValue = offset;
		return this;
	}

	/**
	 * Specify relationships to eager load
	 * User.query().with('posts', 'profile').get()
	 */
	/**
	 * Specify relationships to eager load
	 * User.query().with('posts', 'profile').get()
	 */
	with(...relations: string[]): this {
		for (const relation of relations) {
			// Store the relation name - we'll load it after the main query
			this.eagerLoad.set(relation, relation as any);
		}
		return this;
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
		const adapter = orm.getAdapter();

		const compiled = dialect.compileSelect(this.query);
		const rows = await adapter.query(compiled.sql, compiled.bindings);

		// Transform raw rows into model instances
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

		if (typeof modelConstructor.defineRelationships !== 'function') {
			return;
		}

		const relationships = modelConstructor.defineRelationships();

		for (const relationName of this.eagerLoad.keys()) {
			const relationship = relationships[relationName];

			if (!relationship) {
				throw new Error(
					`Relationship '${relationName}' not found in defineRelationships()`,
				);
			}

			if (typeof relationship.eagerLoadFor === 'function') {
				await relationship.eagerLoadFor(models, relationName);
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
