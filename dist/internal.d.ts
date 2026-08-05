/**
 * Shared helpers. Separate module so the mixins can use them without importing
 * `model.ts`, which imports the mixins itself.
 */
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
export declare function getAttribute(model: object, column: string): any;
//# sourceMappingURL=internal.d.ts.map