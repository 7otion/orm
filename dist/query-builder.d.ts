/** Builds a QueryStructure for a SqlDialect to compile. Generates no SQL. */
import type { OrderDirection, QueryStructure, QueryValue, WhereValue, WhereOperator } from './types';
import type { Model, ModelStatic } from './model';
import type { AnyRelations, RelationPath } from './relation-paths';
export declare class QueryBuilder<T extends Model<T>, TRelations = AnyRelations> {
    private query;
    private modelClass;
    private eagerLoad;
    private relationshipConstraint?;
    constructor(modelClass: ModelStatic<T>, tableName: string);
    /** Accepts `where(col, value)` or `where(col, operator, value)`. */
    where(column: string, operatorOrValue: WhereOperator | QueryValue, value?: WhereValue): this;
    whereRaw(sql: string, bindings?: QueryValue[]): this;
    whereIn(column: keyof T | string, values: QueryValue[]): this;
    join(type: 'INNER' | 'LEFT' | 'RIGHT', table: string, first: string, operator: string, second: string): this;
    innerJoin(table: string, first: string, operator: string, second: string): this;
    leftJoin(table: string, first: string, operator: string, second: string): this;
    orderBy(column: string, direction?: OrderDirection): this;
    /** Emitted verbatim, for sorts the builder cannot express. */
    orderByRaw(sql: string): this;
    limit(limit: number): this;
    offset(offset: number): this;
    select(...columns: (keyof T | string)[]): this;
    /** Emitted verbatim, for aggregates and computed columns. */
    selectRaw(sql: string): this;
    /**
     * Eager load relations, including nested dotted paths. Names are checked
     * against the model's `relationships` literal; models without one accept
     * any string.
     */
    with(...relations: RelationPath<TRelations>[]): this;
    setRelationshipConstraint(constraint: (query: QueryBuilder<T, TRelations>) => void): this;
    get(): Promise<T[]>;
    first(): Promise<T | null>;
    paginate(page?: number, limit?: number): Promise<{
        data: T[];
        total: number;
    }>;
    /** Deletes matching rows in one queued statement, returning the count. */
    delete(): Promise<number>;
    /** Updates matching rows in one queued statement, returning the count. */
    update(data: Record<string, QueryValue>): Promise<number>;
    private hydrate;
    private loadRelationships;
    private loadNestedRelationship;
    private getRelatedModelsFromLoadedRelationship;
    private loadNestedRelationshipOnRelatedModels;
    /** @internal Lets relationship classes inspect the pending query. */
    getQuery(): QueryStructure;
}
//# sourceMappingURL=query-builder.d.ts.map