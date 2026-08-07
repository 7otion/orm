import type { QueryValue } from './types';

/**
 * Shared helpers. Separate module so the mixins can use them without importing
 * `model.ts`, which imports the mixins itself.
 */

/** A plain or dotted name, optionally ending in `*`. */
const IDENTIFIER =
	/^(?:[A-Za-z_][A-Za-z0-9_$]*|\*)(?:\.(?:[A-Za-z_][A-Za-z0-9_$]*|\*))*$/;

/**
 * Identifiers are interpolated into SQL, not bound, so anything that is not a
 * plain name is rejected rather than escaped — an escaped expression would
 * only fail later as an unknown column. Expressions belong in the `*Raw`
 * methods, where the caller is explicitly taking responsibility.
 */
export function assertIdentifier(value: string, kind: string): string {
	if (!IDENTIFIER.test(value)) {
		throw new Error(
			`[orm] Unsafe ${kind}: ${JSON.stringify(value)}. ` +
				`Expected a column or table name. ` +
				`Use whereRaw()/orderByRaw()/selectRaw() for expressions.`,
		);
	}
	return value;
}

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
export function dynamicWhere<Q>(query: Q): DynamicQuery<Q> {
	return query as DynamicQuery<Q>;
}

/**
 * The declaration a write to `prop` would hit, from anywhere on the prototype
 * chain below `Object.prototype`.
 *
 * Stops where the Model proxy's `set` trap stops, so the two agree on what a
 * write means: a column named `toString` is a column, not a method.
 */
export function findDeclaration(
	target: object,
	prop: string,
): PropertyDescriptor | undefined {
	let proto = Object.getPrototypeOf(target);
	while (proto && proto !== Object.prototype) {
		const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
		if (descriptor) return descriptor;
		proto = Object.getPrototypeOf(proto);
	}
	return undefined;
}

/**
 * Rejects a write the proxy would refuse anyway, but with a message that names
 * the model, the property and the reason.
 *
 * Only reachable from untyped data: `fill`'s parameter type already excludes
 * computed properties and methods.
 */
export function assertWritableColumn(model: object, prop: string): void {
	const descriptor = findDeclaration(model, prop);
	if (!descriptor || descriptor.set) return;

	const model_name = model.constructor?.name ?? 'Model';

	if (descriptor.get) {
		throw new Error(
			`[orm] ${model_name}.${prop} is a computed property, not a column, ` +
				`so it cannot be filled. Assign the columns it derives from, ` +
				`or give it a setter.`,
		);
	}

	if (typeof descriptor.value === 'function') {
		throw new Error(
			`[orm] ${model_name}.${prop} is a method, not a column, so it ` +
				`cannot be filled.`,
		);
	}
}

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
