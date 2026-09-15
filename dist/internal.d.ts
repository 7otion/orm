import type { ModelConfig, QueryValue } from './types';
/** Shared helpers; imports nothing from `model.ts`, which imports the mixins. */
/** Joins several values into one key; no column value can contain it. */
export declare const KEY_SEPARATOR = "\0";
/** Identifiers are interpolated, not bound, so anything but a plain name is rejected. */
export declare function assertIdentifier(value: string, kind: string): string;
/** `BlogPost` -> `blog_post`. */
export declare function snakeCase(name: string): string;
/** The `<name>_id` a relation infers from a class name, dropping a `Model` suffix. */
export declare function foreignKeyFor(className: string): string;
/** Returned uppercased, so the dialect can compare against one spelling. */
export declare function assertOperator(value: string, kind: string): string;
/** A query builder with the column check dropped; structural, so nothing is imported. */
interface DynamicQuery<Q> {
    where(column: string, operatorOrValue: unknown, value?: unknown): Q;
}
/**
 * Relationships filter on configured key names, which are `string` and cannot
 * meet `ColumnKeys`. The name is still identifier-checked at runtime.
 */
export declare function dynamicWhere<Q>(query: Q): DynamicQuery<Q>;
/**
 * The declaration a write to `prop` would hit, stopping short of
 * `Object.prototype`, which the proxy's `get` does walk.
 */
export declare function findDeclaration(target: object, prop: string): PropertyDescriptor | undefined;
/** Rejects a write the proxy would refuse, with a message naming the model and property. */
export declare function assertWritableColumn(model: object, prop: string): void;
/** Own keys only, so `toString` is not a relation. */
export declare function findRelationship(relationships: Record<string, any> | undefined | null, name: string): any;
export declare function relationKey(name: string): string;
export declare function loadingKey(name: string): string;
export declare function getRelation(model: object, name: string): unknown;
export declare function setRelation(model: object, name: string, value: unknown): void;
export declare function isRelationLoaded(model: object, name: string): boolean;
/** Returns whether anything was actually cleared. */
export declare function clearRelation(model: object, name: string): boolean;
export declare function getAttribute(model: object, column: string): QueryValue;
/** Drops keys whose value is `undefined`. */
export declare function omitUndefined<T extends Record<string, unknown>>(data: T): T;
/** The key columns a config declares, always as a list. */
export declare function primaryKeyColumns(config: ModelConfig): string[];
/** One string for a row's key values. Dates by time, so two instances agree. */
export declare function keySignature(values: unknown[]): string;
export {};
//# sourceMappingURL=internal.d.ts.map