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
import { ORM } from './orm';
export class QueryBuilder {
    constructor(modelClass, tableName) {
        this.eagerLoad = new Map();
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
    where(column, operatorOrValue, value) {
        let operator;
        let actualValue;
        // Handle both signatures: where(col, op, val) and where(col, val)
        if (value === undefined) {
            operator = '=';
            actualValue = operatorOrValue;
        }
        else {
            operator = operatorOrValue;
            actualValue = value;
        }
        const condition = {
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
    whereRaw(sql, bindings = []) {
        const condition = {
            type: 'raw',
            sql,
            bindings,
        };
        this.query.wheres.push(condition);
        return this;
    }
    /**
     * Add a WHERE IN clause to the query
     * whereIn('status', ['active', 'pending'])
     */
    whereIn(column, values) {
        this.query.wheres.push({
            type: 'basic',
            column: String(column),
            operator: 'IN',
            value: values,
        });
        return this;
    }
    /**
     * join('INNER', 'posts', 'posts.user_id', '=', 'users.id')
     */
    join(type, table, first, operator, second) {
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
    innerJoin(table, first, operator, second) {
        return this.join('INNER', table, first, operator, second);
    }
    leftJoin(table, first, operator, second) {
        return this.join('LEFT', table, first, operator, second);
    }
    /**
     * orderBy('created_at', 'desc')
     */
    orderBy(column, direction = 'asc') {
        this.query.orders.push({ column, direction });
        return this;
    }
    /**
     * Raw ORDER BY clause for complex sorting
     *
     * Example:
     * - orderByRaw('created_at DESC, name ASC')
     */
    orderByRaw(sql) {
        this.query.orders.push({
            column: sql,
            direction: 'raw',
        });
        return this;
    }
    limit(limit) {
        this.query.limitValue = limit;
        return this;
    }
    offset(offset) {
        this.query.offsetValue = offset;
        return this;
    }
    /**
     * Specify columns to select (default: all columns)
     * select('id', 'name') or select(['id', 'name'])
     */
    select(...columns) {
        this.query.columns = columns.map(String);
        return this;
    }
    /**
     * Raw SELECT clause for complex expressions or aggregates
     * selectRaw('COUNT(*) as total, MAX(created_at) as latest')
     */
    selectRaw(sql) {
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
    with(...relations) {
        for (const relation of relations) {
            this.eagerLoad.set(relation, relation);
        }
        return this;
    }
    /**
     * Extract table names from the query for cache tagging
     */
    extractTableNames() {
        const tables = new Set();
        tables.add(this.query.table);
        if (this.query.joins) {
            for (const join of this.query.joins) {
                tables.add(join.table);
            }
        }
        return Array.from(tables);
    }
    setRelationshipConstraint(constraint) {
        this.relationshipConstraint = constraint;
        return this;
    }
    async get() {
        // Apply relationship constraint if this is a relationship query
        if (this.relationshipConstraint) {
            this.relationshipConstraint(this);
        }
        const orm = ORM.getInstance();
        const dialect = orm.getDialect();
        const compiled = dialect.compileSelect(this.query);
        const tables = orm.resultCacheAdapter ? this.extractTableNames() : [];
        const rows = await orm.cachedSelect(compiled.sql, compiled.bindings, tables);
        const models = rows.map((row) => this.hydrate(row));
        // Eager load relationships if requested
        if (this.eagerLoad.size > 0) {
            await this.loadRelationships(models);
        }
        return models;
    }
    async first() {
        this.limit(1);
        const results = await this.get();
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Paginate results
     * Returns paginated data with total count
     */
    async paginate(page = 1, limit = 20) {
        // Apply relationship constraint if this is a relationship query
        if (this.relationshipConstraint) {
            this.relationshipConstraint(this);
        }
        const orm = ORM.getInstance();
        const dialect = orm.getDialect();
        const countQuery = { ...this.query };
        const countCompiled = dialect.compileCount(countQuery);
        const countTables = this.extractTableNames();
        const countResult = await orm.cachedSelect(countCompiled.sql, countCompiled.bindings, countTables);
        const total = countResult[0]?.count || 0;
        const offset = (page - 1) * limit;
        this.limit(limit).offset(offset);
        const compiled = dialect.compileSelect(this.query);
        const dataTables = this.extractTableNames();
        const rows = await orm.cachedSelect(compiled.sql, compiled.bindings, dataTables);
        const models = rows.map((row) => this.hydrate(row));
        if (this.eagerLoad.size > 0) {
            await this.loadRelationships(models);
        }
        return { data: models, total };
    }
    hydrate(row) {
        const model = new this.modelClass();
        // Set internal state directly to avoid marking as dirty
        model._attributes = { ...row };
        model._original = { ...row };
        model._exists = true;
        return model;
    }
    async loadRelationships(models) {
        if (models.length === 0)
            return;
        const firstModel = models[0];
        const modelConstructor = firstModel.constructor;
        // Access the static relationships getter
        const relationships = modelConstructor.relationships;
        if (!relationships || Object.keys(relationships).length === 0) {
            return;
        }
        for (const relationName of this.eagerLoad.keys()) {
            // Check if this is a nested relationship (contains dots)
            if (relationName.includes('.')) {
                await this.loadNestedRelationship(models, relationName, relationships);
            }
            else {
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
            await modelConstructor.afterEagerLoad(this.eagerLoad.keys(), models);
        }
    }
    /**
     * Load nested relationships recursively
     * Handles relationships like 'category.contentType'
     */
    async loadNestedRelationship(models, nestedRelation, relationships) {
        const relationParts = nestedRelation.split('.');
        const firstLevelRelation = relationParts[0];
        const remainingRelations = relationParts.slice(1).join('.');
        // First, load the top-level relationship
        const relationship = relationships?.[firstLevelRelation];
        if (!relationship) {
            throw new Error(`Relationship '${firstLevelRelation}' not found in static relationships constant`);
        }
        if (typeof relationship.eagerLoadFor === 'function') {
            await relationship.eagerLoadFor(models, firstLevelRelation);
        }
        // If there are more nested levels, load them recursively
        if (remainingRelations) {
            // Get the related models from the loaded relationship
            const relatedModels = this.getRelatedModelsFromLoadedRelationship(models, firstLevelRelation);
            // Filter out null/undefined related models
            const validRelatedModels = relatedModels.filter(model => model != null);
            if (validRelatedModels.length > 0) {
                // Recursively load the remaining nested relationships
                await this.loadNestedRelationshipOnRelatedModels(validRelatedModels, remainingRelations, relationship.getRelated());
            }
        }
    }
    /**
     * Extract related models from a loaded relationship
     */
    getRelatedModelsFromLoadedRelationship(parentModels, relationName) {
        const relatedModels = [];
        for (const parentModel of parentModels) {
            const privateKey = `_${relationName}`;
            const loadedData = parentModel[privateKey];
            if (loadedData != null) {
                if (Array.isArray(loadedData)) {
                    relatedModels.push(...loadedData);
                }
                else {
                    relatedModels.push(loadedData);
                }
            }
        }
        return relatedModels;
    }
    /**
     * Recursively load nested relationships on related models
     */
    async loadNestedRelationshipOnRelatedModels(relatedModels, remainingRelation, relatedModelConstructor) {
        // Get relationships from the related model class
        const relationships = relatedModelConstructor.relationships;
        if (!relationships || Object.keys(relationships).length === 0) {
            return;
        }
        // Check if this is still nested
        if (remainingRelation.includes('.')) {
            await this.loadNestedRelationship(relatedModels, remainingRelation, relationships);
        }
        else {
            // Load the final level relationship
            const relationship = relationships[remainingRelation];
            if (!relationship) {
                throw new Error(`Relationship '${remainingRelation}' not found in ${relatedModelConstructor.name} relationships`);
            }
            if (typeof relationship.eagerLoadFor === 'function') {
                await relationship.eagerLoadFor(relatedModels, remainingRelation);
            }
        }
    }
    /**
     * Get the query structure (for internal use)
     * Used by relationship classes to inspect the query
     */
    getQuery() {
        return this.query;
    }
}
//# sourceMappingURL=query-builder.js.map