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
import type { OrderDirection, QueryStructure, QueryValue, WhereValue, WhereOperator } from './types';
import type { Model, ModelConstructor } from './model';
export declare class QueryBuilder<T extends Model<T>> {
    private query;
    private modelClass;
    private eagerLoad;
    private relationshipConstraint?;
    constructor(modelClass: ModelConstructor<T>, tableName: string);
    /**
     * Add a WHERE clause to the query
     * where('age', '>', 18) or where('status', 'active')
     */
    where(column: string, operatorOrValue: WhereOperator | QueryValue, value?: WhereValue): this;
    /**
     * whereRaw('age > ? AND status = ?', [18, 'active'])
     */
    whereRaw(sql: string, bindings?: QueryValue[]): this;
    /**
     * join('INNER', 'posts', 'posts.user_id', '=', 'users.id')
     */
    join(type: 'INNER' | 'LEFT' | 'RIGHT', table: string, first: string, operator: string, second: string): this;
    innerJoin(table: string, first: string, operator: string, second: string): this;
    leftJoin(table: string, first: string, operator: string, second: string): this;
    /**
     * orderBy('created_at', 'desc')
     */
    orderBy(column: string, direction?: OrderDirection): this;
    /**
     * Raw ORDER BY clause for complex sorting
     *
     * Example:
     * - orderByRaw('created_at DESC, name ASC')
     */
    orderByRaw(sql: string): this;
    limit(limit: number): this;
    offset(offset: number): this;
    /**
     * Specify columns to select (default: all columns)
     * select('id', 'name') or select(['id', 'name'])
     */
    select(...columns: (keyof T | string)[]): this;
    /**
     * Raw SELECT clause for complex expressions or aggregates
     * selectRaw('COUNT(*) as total, MAX(created_at) as latest')
     */
    selectRaw(sql: string): this;
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
    with(...relations: string[]): this;
    /**
     * Extract table names from the query for cache tagging
     */
    private extractTableNames;
    setRelationshipConstraint(constraint: (query: QueryBuilder<T>) => void): this;
    get(): Promise<T[]>;
    first(): Promise<T | null>;
    /**
     * Paginate results
     * Returns paginated data with total count
     */
    paginate(page?: number, limit?: number): Promise<{
        data: T[];
        total: number;
    }>;
    private hydrate;
    private loadRelationships;
    /**
     * Load nested relationships recursively
     * Handles relationships like 'category.contentType'
     */
    private loadNestedRelationship;
    /**
     * Extract related models from a loaded relationship
     */
    private getRelatedModelsFromLoadedRelationship;
    /**
     * Recursively load nested relationships on related models
     */
    private loadNestedRelationshipOnRelatedModels;
    /**
     * Get the query structure (for internal use)
     * Used by relationship classes to inspect the query
     */
    getQuery(): QueryStructure;
}
//# sourceMappingURL=query-builder.d.ts.map