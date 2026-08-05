/**
 * Base Relationship Class
 *
 * All relationship types (HasOne, HasMany, BelongsToMany, MorphTo) extend this class.
 *
 * Key Responsibilities:
 * - Define how to load related records (lazy loading)
 * - Define how to eager load for multiple parent models
 *
 * Relationship Pattern:
 * - Relationships are accessed as properties: user.posts
 * - Lazy loading: triggered by Proxy when property is accessed
 * - Eager loading: use with() on the parent query
 */

import type { Model, ModelConstructor } from '../model';

// A related model can be passed directly or as a thunk (arrow function) to
// break circular module dependencies between model files:
//
//   beats: this.hasMany(() => Beat, 'passage_id', 'id')
//
// Thunks must be arrow functions — they have no .prototype, which is how the
// ORM distinguishes them from model constructors. When using a thunk, explicit
// foreignKey and localKey are required because auto-inference reads the class
// immediately and the class may not be resolved yet at that point.
type RelatedResolver<T extends Model<T>> =
	ModelConstructor<T> | (() => ModelConstructor<T>);

export abstract class Relationship<T extends Model<T>> {
	protected parentConstructor: ModelConstructor<any>;
	private _related: RelatedResolver<T>;
	private _resolvedRelated: ModelConstructor<T> | undefined;
	protected foreignKey: string;
	protected localKey: string;

	// Lazily resolves the related model class. If _related is a thunk
	// (arrow function, prototype === undefined) it is called once and the
	// result cached. This defers resolution to query time, by which point all
	// modules are fully loaded regardless of circular import order.
	protected get related(): ModelConstructor<T> {
		if (this._resolvedRelated === undefined) {
			const r = this._related;
			this._resolvedRelated =
				r.prototype === undefined
					? (r as () => ModelConstructor<T>)()
					: (r as ModelConstructor<T>);
		}
		return this._resolvedRelated;
	}

	constructor(
		parent: ModelConstructor<any> | Model<any>,
		related: RelatedResolver<T>,
		foreignKey?: string,
		localKey?: string,
	) {
		if (typeof parent === 'function') {
			this.parentConstructor = parent;
		} else {
			this.parentConstructor =
				parent.constructor as ModelConstructor<any>;
		}

		this._related = related;

		// Arrow functions (thunks) have no .prototype; model classes always do.
		const isThunk = related.prototype === undefined;

		if (!foreignKey) {
			if (isThunk) {
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
			if (isThunk) {
				throw new Error(
					'[orm] Provide an explicit localKey when using a thunk for the related model.',
				);
			}
			const pk =
				(related as ModelConstructor<T>).config?.primaryKey || 'id';
			// Relationships don't support composite primary keys - use first key
			this.localKey = Array.isArray(pk) ? pk[0]! : pk;
		} else {
			this.localKey = localKey;
		}
	}

	protected getParentKeyValue(parent: Model<any>): any {
		return (parent as any)[this.localKey];
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

	/**
	 * Get the related model class
	 */
	getRelated(): ModelConstructor<T> {
		return this.related;
	}

	getForeignKey(): string {
		return this.foreignKey;
	}

	getLocalKey(): string {
		return this.localKey;
	}
}
