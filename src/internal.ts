import type { QueryValue } from './types';

/**
 * Shared helpers. Separate module so the mixins can use them without importing
 * `model.ts`, which imports the mixins itself.
 */

/**
 * Own keys only. `relationships[name]` resolves inherited Object.prototype
 * members, which would mistake `toString` for a relation.
 */
export function findRelationship(
	relationships: Record<string, any> | undefined | null,
	name: string,
): any {
	if (!relationships) return undefined;
	return Object.prototype.hasOwnProperty.call(relationships, name)
		? relationships[name]
		: undefined;
}

/* Loaded relations live at `_<name>`, in-flight promises at `_loading_<name>`;
 * the Model proxy passes `_`-prefixed keys through untouched. Reaching them
 * needs a cast, so it happens here once instead of at every call site. */

type RelationHost = Record<string, unknown>;

const host = (model: object): RelationHost => model as RelationHost;

export function relationKey(name: string): string {
	return `_${name}`;
}

export function loadingKey(name: string): string {
	return `_loading_${name}`;
}

export function getRelation(model: object, name: string): unknown {
	return host(model)[relationKey(name)];
}

export function setRelation(model: object, name: string, value: unknown): void {
	host(model)[relationKey(name)] = value;
}

export function isRelationLoaded(model: object, name: string): boolean {
	return host(model)[relationKey(name)] !== undefined;
}

/** Returns whether anything was actually cleared. */
export function clearRelation(model: object, name: string): boolean {
	const key = relationKey(name);
	if (key in host(model)) {
		delete host(model)[key];
		return true;
	}
	return false;
}

export function getAttribute(model: object, column: string): QueryValue {
	return host(model)[column] as QueryValue;
}
