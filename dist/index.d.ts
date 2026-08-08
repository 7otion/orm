/**
 * 7otion ORM - Database-Agnostic TypeScript ORM
 *
 * A modern, type-safe ORM with Active Record pattern, designed to work
 * with any database through pluggable adapters and dialects.
 *
 * @author Burak Kartal
 * @license MIT
 */
export { Model, type ModelConstructor } from './model';
export type { ColumnKeys, Columns, Patch } from './columns';
export type { RelationPath } from './relation-paths';
export { ORM, type ORMConfig } from './orm';
export type { DatabaseAdapter } from './adapter';
export type { SqlDialect } from './dialect';
export { QueryBuilder } from './query-builder';
export type { DatabaseRow, QueryValue, WhereValue, WhereOperator, OrderDirection, WhereCondition, OrderByClause, QueryStructure, JoinClause, CompiledQuery, TimestampConfig, ModelConfig, } from './types';
export { BooleanCast, JsonCast, DateCast, EmptyToNullCast, type CastType, type ColumnCast, } from './casts';
export { SQLiteDialect } from './plugins/dialects/sqlite';
export { TauriAdapter, type TauriAdapterConfig, } from './plugins/adapters/tauri';
//# sourceMappingURL=index.d.ts.map