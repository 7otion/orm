import type { QueryValue } from './types';
/**
 * Identifiers are interpolated into SQL, not bound, so anything that is not a
 * plain name is rejected rather than escaped — an escaped expression would
 * only fail later as an unknown column. Expressions belong in the `*Raw`
 * methods, where the caller is explicitly taking responsibility.
 */
export declare function assertIdentifier(value: string, kind: string): string;
/**
 * A query builder with the column check dropped.
 *
 * Structural, so this module still imports nothing from `query-builder.ts`,
 * which imports this one.
 */
interface DynamicQuery<Q> {
    where(column: string, operatorOrValue: unknown, value?: unknown): Q;
}
/**
 * The one place the column check is deliberately dropped.
 *
 * Relationships filter on names taken from their own configuration — foreign
 * keys, local keys, discriminators — which are `string` at the type level and
 * so cannot be checked against `ColumnKeys`. Confining the cast here keeps
 * `where` the single, fully typed entry point on the public surface: a
 * `@internal`-tagged public method would still be callable by anyone, which
 * would reopen exactly the hole the typing closes.
 *
 * The name is still identifier-validated at runtime by `where` itself.
 */
export declare function dynamicWhere<Q>(query: Q): DynamicQuery<Q>;
/**
 * The declaration a write to `prop` would hit, from anywhere on the prototype
 * chain below `Object.prototype`.
 *
 * Stops where the Model proxy's `set` trap stops, so the two agree on what a
 * write means: a column named `toString` is a column, not a method.
 */
export declare function findDeclaration(target: object, prop: string): PropertyDescriptor | undefined;
/**
 * Rejects a write the proxy would refuse anyway, but with a message that names
 * the model, the property and the reason.
 *
 * Only reachable from untyped data: `fill`'s parameter type already excludes
 * computed properties and methods.
 */
export declare function assertWritableColumn(model: object, prop: string): void;
/**
 * Own keys only. `relationships[name]` resolves inherited Object.prototype
 * members, which would mistake `toString` for a relation.
 */
export declare function findRelationship(relationships: Record<string, any> | undefined | null, name: string): any;
export declare function relationKey(name: string): string;
export declare function loadingKey(name: string): string;
export declare function getRelation(model: object, name: string): unknown;
export declare function setRelation(model: object, name: string, value: unknown): void;
export declare function isRelationLoaded(model: object, name: string): boolean;
/** Returns whether anything was actually cleared. */
export declare function clearRelation(model: object, name: string): boolean;
export declare function getAttribute(model: object, column: string): QueryValue;
/**
 * Drops keys whose value is `undefined`.
 */
export declare function omitUndefined<T extends Record<string, unknown>>(data: T): T;
export {};
//# sourceMappingURL=internal.d.ts.map