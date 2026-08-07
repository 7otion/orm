/** Builds a QueryStructure for a SqlDialect to compile. Generates no SQL. */
import type { OrderDirection, QueryStructure, QueryValue, WhereOperator } from './types';
import type { Model, ModelStatic } from './model';
import type { AnyRelations, RelationPath } from './relation-paths';
import type { ColumnRef, Patch, ValueFor, ValueForOperator } from './columns';
export declare class QueryBuilder<T extends Model<T>, TRelations = AnyRelations> {
    private query;
    private modelClass;
    private eagerLoad;
    private relationshipConstraint?;
    constructor(modelClass: ModelStatic<T>, tableName: string);
    /**
     * `where(col, value)` or `where(col, operator, value)`.
     *
     * Split into two overloads rather than one `WhereOperator | QueryValue`
     * parameter: that union absorbs into `string`, which lets any nonsense
     * operator through. Separating them also lets the two-argument form check
     * the value against the column's declared type.
     */
    where<K extends ColumnRef<T>>(column: K, value: ValueFor<T, K>): this;
    where<K extends ColumnRef<T>, Op extends WhereOperator>(column: K, operator: Op, value: ValueForOperator<T, K, Op>): this;
    whereRaw(sql: string, bindings?: QueryValue[]): this;
    whereIn<K extends ColumnRef<T>>(column: K, values: ValueFor<T, K>[]): this;
    join(type: 'INNER' | 'LEFT' | 'RIGHT', table: string, first: string, operator: string, second: string): this;
    innerJoin(table: string, first: string, operator: string, second: string): this;
    leftJoin(table: string, first: string, operator: string, second: string): this;
    /** `'raw'` is reserved for `orderByRaw`, so it is not offered here. */
    orderBy(column: ColumnRef<T>, direction?: Exclude<OrderDirection, 'raw'>): this;
    /** Emitted verbatim, for sorts the builder cannot express. */
    orderByRaw(sql: string): this;
    limit(limit: number): this;
    offset(offset: number): this;
    select(...columns: ColumnRef<T>[]): this;
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
    update(data: Patch<T>): Promise<number>;
    private hydrate;
    private loadRelationships;
    private loadNestedRelationship;
    private getRelatedModelsFromLoadedRelationship;
    private loadNestedRelationshipOnRelatedModels;
    /** @internal Lets relationship classes inspect the pending query. */
    getQuery(): QueryStructure;
}
//# sourceMappingURL=query-builder.d.ts.map