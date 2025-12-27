/**
 * 7otion ORM - Database-Agnostic TypeScript ORM
 *
 * A modern, type-safe ORM with Active Record pattern, designed to work
 * with any database through pluggable adapters and dialects.
 *
 * @author Burak Kartal
 * @license MIT
 */
export { Model } from './model';
export { ORM } from './orm';
export { QueryBuilder } from './query-builder';
export { getRepository } from './repository';
export { StatementCache } from './statement-cache';
export { Relationship } from './relationships/relationship';
export { SQLiteDialect } from './plugins/dialects/sqlite';
export { TauriAdapter, } from './plugins/adapters/tauri';
export { MemoryResultCache } from './plugins/caching/memory';
export { LocalStorageResultCache } from './plugins/caching/localstorage';
//# sourceMappingURL=index.js.map