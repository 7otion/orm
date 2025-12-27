/**
 * Represents a raw database row - just key-value pairs
 * Used as the output from database adapters
 */
export type DatabaseRow = Record<string, any>;

/**
 * Query parameter value types - what can be bound to SQL params
 */
export type QueryValue = string | number | boolean | null | undefined;

/**
 * WHERE clause operators supported by the query builder
 */
export type WhereOperator =
	| '='
	| '!='
	| '>'
	| '>='
	| '<'
	| '<='
	| 'LIKE'
	| 'IN'
	| 'NOT IN'
	| 'IS'
	| 'IS NOT';

/**
 * ORDER BY direction
 */
export type OrderDirection = 'asc' | 'desc' | 'ASC' | 'DESC' | 'raw';

/**
 * Value that can be passed to WHERE clause (includes arrays for IN clauses)
 */
export type WhereValue = QueryValue | QueryValue[];

/**
 * Structure representing a WHERE condition in the query
 * Can be a standard condition or raw SQL
 */
export interface WhereCondition {
	type: 'basic' | 'raw';
	column?: string;
	operator?: WhereOperator;
	value?: WhereValue;
	sql?: string;
	bindings?: QueryValue[];
}

/**
 * Structure representing an ORDER BY clause
 */
export interface OrderByClause {
	column: string;
	direction: OrderDirection;
}

/**
 * The complete query structure built by QueryBuilder
 * This is what gets passed to SqlDialect for compilation
 */
export interface QueryStructure {
	table: string;
	columns?: string[];
	selectRaw?: string;
	wheres: WhereCondition[];
	orders: OrderByClause[];
	limitValue?: number;
	offsetValue?: number;
	joins?: JoinClause[];
}

/**
 * JOIN clause structure (used for eager loading relationships)
 */
export interface JoinClause {
	type: 'INNER' | 'LEFT' | 'RIGHT';
	table: string;
	first: string;
	operator: string;
	second: string;
}

/**
 * Compiled SQL result from SqlDialect
 * Separates SQL string from bound parameters for security
 */
export interface CompiledQuery {
	sql: string;
	bindings: QueryValue[];
}

/**
 * Configuration for timestamp fields
 */
export interface TimestampConfig {
	created_at: string; // Column name for created timestamp
	updated_at: string; // Column name for updated timestamp
}

/**
 * Model configuration - defined statically in each Model class
 */
export interface ModelConfig {
	table?: string; // Default: auto-derived from class name (User -> users)
	primaryKey?: string; // Default: 'id'
	timestamps?: boolean | TimestampConfig; // Default: false
}
