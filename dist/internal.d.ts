import type { QueryValue } from './types';
/**
 * Identifiers are interpolated into SQL, not bound, so anything that is not a
 * plain name is rejected rather than escaped — an escaped expression would
 * only fail later as an unknown column. Expressions belong in the `*Raw`
 * methods, where the caller is explicitly taking responsibility.
 */
export declare function assertIdentifier(value: string, kind: string): string;
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
//# sourceMappingURL=internal.d.ts.map