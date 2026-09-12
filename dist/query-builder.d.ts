/** Builds a QueryStructure for a SqlDialect to compile. Generates no SQL. */
import type { DatabaseRow, OrderDirection, QueryStructure, QueryValue, WhereOperator } from './types';
import type { Model, ModelStatic } from './model';
import type { AnyRelations, RelationPath } from './relation-paths';
import type { ColumnRef, Patch, ValueFor, ValueForOperator } from './columns';
export declare class QueryBuilder<T extends Model<T>, TRelations = AnyRelations, Grouped extends boolean = false> {
    /** @internal Phantom marker, giving `Grouped` a member position. */
    readonly __grouped: Grouped;
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
    /** A callback nests its conditions in one parenthesised group. */
    where(group: (query: QueryBuilder<T, TRelations>) => void): this;
    orWhere<K extends ColumnRef<T>>(column: K, value: ValueFor<T, K>): this;
    orWhere<K extends ColumnRef<T>, Op extends WhereOperator>(column: K, operator: Op, value: ValueForOperator<T, K, Op>): this;
    orWhere(group: (query: QueryBuilder<T, TRelations>) => void): this;
    whereNot<K extends ColumnRef<T>>(column: K, value: ValueFor<T, K>): this;
    whereNot<K extends ColumnRef<T>, Op extends WhereOperator>(column: K, operator: Op, value: ValueForOperator<T, K, Op>): this;
    /** A callback negates the whole group: `NOT (a AND b)`. */
    whereNot(group: (query: QueryBuilder<T, TRelations>) => void): this;
    orWhereNot<K extends ColumnRef<T>>(column: K, value: ValueFor<T, K>): this;
    orWhereNot<K extends ColumnRef<T>, Op extends WhereOperator>(column: K, operator: Op, value: ValueForOperator<T, K, Op>): this;
    orWhereNot(group: (query: QueryBuilder<T, TRelations>) => void): this;
    /** The one dispatch every where-variant goes through. */
    private addWhere;
    whereRaw(sql: string, bindings?: QueryValue[]): this;
    orWhereRaw(sql: string, bindings?: QueryValue[]): this;
    whereIn<K extends ColumnRef<T>>(column: K, values: ValueFor<T, K>[]): this;
    orWhereIn<K extends ColumnRef<T>>(column: K, values: ValueFor<T, K>[]): this;
    /** Collects a callback's conditions into one group, dropping it if empty. */
    private pushGroup;
    private basicCondition;
    private inCondition;
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
    /** Grouped rows are not model rows, so only `aggregate()` reads them. */
    groupBy(...columns: ColumnRef<T>[]): QueryBuilder<T, TRelations, true>;
    having<K extends ColumnRef<T>>(column: K, value: ValueFor<T, K>): this;
    having<K extends ColumnRef<T>, Op extends WhereOperator>(column: K, operator: Op, value: ValueForOperator<T, K, Op>): this;
    /** Emitted verbatim, for the aggregates HAVING is usually written against. */
    havingRaw(sql: string, bindings?: QueryValue[]): this;
    /** Rows exactly as the adapter returned them; nothing is hydrated. */
    aggregate<R = DatabaseRow>(): Promise<R[]>;
    /**
     * Eager load relations, including nested dotted paths. Names are checked
     * against the model's `relationships` literal; models without one accept
     * any string.
     */
    with(this: QueryBuilder<T, TRelations, false>, ...relations: RelationPath<TRelations>[]): QueryBuilder<T, TRelations, false>;
    setRelationshipConstraint(constraint: (query: QueryBuilder<T, TRelations>) => void): this;
    get(this: QueryBuilder<T, TRelations, false>): Promise<T[]>;
    first(this: QueryBuilder<T, TRelations, false>): Promise<T | null>;
    paginate(this: QueryBuilder<T, TRelations, false>, page?: number, limit?: number): Promise<{
        data: T[];
        total: number;
    }>;
    /** Deletes matching rows in one queued statement, returning the count. */
    delete(this: QueryBuilder<T, TRelations, false>): Promise<number>;
    /** Updates matching rows in one queued statement, returning the count. */
    update(this: QueryBuilder<T, TRelations, false>, data: Patch<T>): Promise<number>;
    private hydrate;
    private loadRelationships;
    private loadNestedRelationship;
    private getRelatedModelsFromLoadedRelationship;
    private loadNestedRelationshipOnRelatedModels;
    /** @internal Lets relationship classes inspect the pending query. */
    getQuery(): QueryStructure;
}
//# sourceMappingURL=query-builder.d.ts.map