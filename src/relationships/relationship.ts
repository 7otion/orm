/**
 * Base for every relationship kind. Subclasses supply `get()` for one parent
 * and `eagerLoadFor()` for a batch, avoiding N+1 queries.
 */

import { getAttribute } from '../internal';
import type { Model, ModelClassRef, ModelStatic } from '../model';

// A thunk defers resolution, breaking circular imports between model files.
// Thunks require explicit keys: inference reads the class immediately.
export type RelatedResolver<T extends Model<T>> =
	ModelStatic<T> | (() => ModelStatic<T>);

/** Arrow functions have no `.prototype`; class constructors always do. */
function isThunk<T extends Model<T>>(
	related: RelatedResolver<T>,
): related is () => ModelStatic<T> {
	return (related as { prototype?: unknown }).prototype === undefined;
}

export abstract class Relationship<T extends Model<T>, TClass = unknown> {
	/**
	 * Carries the related class type for RelationPath to recurse into.
	 * Never assigned; `declare` emits nothing.
	 */
	declare readonly __relatedClass?: TClass;

	// Never constructed — only read for name/config during key inference.
	protected parentConstructor: ModelClassRef;
	private _related: RelatedResolver<T>;
	private _resolvedRelated: ModelStatic<T> | undefined;
	protected foreignKey: string;
	protected localKey: string;

	// Resolved once at query time, after every module has loaded.
	protected get related(): ModelStatic<T> {
		if (this._resolvedRelated === undefined) {
			const r = this._related;
			this._resolvedRelated = isThunk(r) ? r() : r;
		}
		return this._resolvedRelated;
	}

	constructor(
		parent: ModelClassRef | Model<any>,
		related: RelatedResolver<T>,
		foreignKey?: string,
		localKey?: string,
	) {
		if (typeof parent === 'function') {
			this.parentConstructor = parent;
		} else {
			this.parentConstructor =
				parent.constructor as unknown as ModelClassRef;
		}

		this._related = related;

		const thunked = isThunk(related);

		if (!foreignKey) {
			if (thunked) {
				throw new Error(
					'[orm] Provide an explicit foreignKey when using a thunk for the related model.',
				);
			}
			const parentClassName = this.parentConstructor.name;
			const snakeCase = parentClassName
				.replace(/Model$/, '')
				.replace(/([A-Z])/g, '_$1')
				.toLowerCase()
				.replace(/^_/, '');
			this.foreignKey = `${snakeCase}_id`;
		} else {
			this.foreignKey = foreignKey;
		}

		if (!localKey) {
			if (thunked) {
				throw new Error(
					'[orm] Provide an explicit localKey when using a thunk for the related model.',
				);
			}
			const pk = related.config?.primaryKey || 'id';
			// Relations do not support composite keys; use the first.
			this.localKey = Array.isArray(pk) ? pk[0]! : pk;
		} else {
			this.localKey = localKey;
		}
	}

	protected getParentKeyValue(parent: Model<any>): any {
		return getAttribute(parent, this.localKey);
	}

	/** Lazy path: load for one parent. */
	abstract get(parent: Model<any>): Promise<T | T[] | null>;

	/** Eager path: load for a batch of parents in one query. */
	abstract eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void>;

	/** Owner columns this relation keys off, used to invalidate its cache. */
	abstract getOwnerFields(): string[];

	getRelated(): ModelStatic<T> {
		return this.related;
	}

	getForeignKey(): string {
		return this.foreignKey;
	}

	getLocalKey(): string {
		return this.localKey;
	}
}
