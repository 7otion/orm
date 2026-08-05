/**
 * 7otion ORM - Database-Agnostic TypeScript ORM
 *
 * A modern, type-safe ORM with Active Record pattern, designed to work
 * with any database through pluggable adapters and dialects.
 *
 * @author Burak Kartal
 * @license MIT
 */
export { Model, type ModelConstructor, type ModelStatic, type ModelClassRef, } from './model';
export type { RelationPath, AnyRelations } from './relation-paths';
export { ORM, type ORMConfig } from './orm';
export type { DatabaseAdapter } from './adapter';
export type { SqlDialect } from './dialect';
export { QueryBuilder } from './query-builder';
export { StatementCache } from './statement-cache';
export { Relationship, type RelatedResolver, } from './relationships/relationship';
export { HasOne } from './relationships/hasOne';
export { HasMany } from './relationships/hasMany';
export { BelongsTo } from './relationships/belongsTo';
export { BelongsToMany } from './relationships/belongsToMany';
export { MorphTo, type MorphToConfig } from './relationships/morphTo';
export type { DatabaseRow, QueryValue, WhereValue, WhereOperator, OrderDirection, WhereCondition, OrderByClause, QueryStructure, JoinClause, CompiledQuery, TimestampConfig, ModelConfig, } from './types';
export { SQLiteDialect } from './plugins/dialects/sqlite';
export { TauriAdapter, type TauriAdapterConfig, } from './plugins/adapters/tauri';
export { MemoryResultCache } from './plugins/caching/memory';
export { LocalStorageResultCache } from './plugins/caching/localstorage';
//# sourceMappingURL=index.d.ts.map