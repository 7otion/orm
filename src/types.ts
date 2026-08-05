/** A row exactly as an adapter returned it. */
export type DatabaseRow = Record<string, any>;

export type QueryValue = string | number | boolean | null | undefined;

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

export type OrderDirection = 'asc' | 'desc' | 'ASC' | 'DESC' | 'raw';

/** Arrays are for IN / NOT IN. */
export type WhereValue = QueryValue | QueryValue[];

export interface WhereCondition {
	type: 'basic' | 'raw';
	column?: string;
	operator?: WhereOperator;
	value?: WhereValue;
	sql?: string;
	bindings?: QueryValue[];
}

export interface OrderByClause {
	column: string;
	direction: OrderDirection;
}

/** What QueryBuilder produces and SqlDialect compiles. */
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

export interface JoinClause {
	type: 'INNER' | 'LEFT' | 'RIGHT';
	table: string;
	first: string;
	operator: string;
	second: string;
}

/** SQL and its bindings kept separate, so values are always parameterised. */
export interface CompiledQuery {
	sql: string;
	bindings: QueryValue[];
}

export interface TimestampConfig {
	created_at: string;
	updated_at: string;
}

export interface ModelConfig {
	/** Defaults to the pluralised, snake_cased class name. */
	table?: string;
	/** Defaults to 'id'. An array declares a composite key. */
	primaryKey?: string | string[];
	timestamps?: boolean | TimestampConfig;
	/**
	 * Columns that bulk assignment (`create`, `fill`) may set. When present,
	 * everything else is ignored — the safe choice for request bodies.
	 */
	fillable?: string[];
	/** Columns bulk assignment may never set. Ignored when `fillable` is set. */
	guarded?: string[];
}
