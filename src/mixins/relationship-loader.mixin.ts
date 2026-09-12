/** Loads and invalidates relations on Model instances. */

import {
	clearRelation,
	findRelationship,
	getRelation,
	isRelationLoaded,
	loadingKey,
	setRelation,
} from '../internal';

import type { LoadableRelation } from '../relationships/relationship';
import { ModelState } from './model-state.mixin';

export class RelationshipLoaderMixin extends ModelState {
	/**
	 * In-flight load promises, so concurrent `load()` calls for one relation
	 * share a single query.
	 */
	private pending(): Record<string, Promise<void> | undefined> {
		return this as unknown as Record<string, Promise<void> | undefined>;
	}

	/** Throws a promise on a miss, as Suspense requires. */
	protected getWithSuspense<R>(relationshipName: string): R {
		const pending = this.pending();

		if (isRelationLoaded(this, relationshipName)) {
			return getRelation(this, relationshipName) as R;
		}

		const key = loadingKey(relationshipName);
		if (pending[key]) {
			throw pending[key];
		}

		// `finally`, so a failed load is retried rather than rethrown forever.
		const promise = this.loadRelationship(relationshipName).finally(() => {
			delete pending[key];
		});

		pending[key] = promise;
		// A thrown promise no one awaits must not surface as an unhandled rejection.
		promise.catch(() => {});

		console.warn(
			`Relationship '${relationshipName}' is being loaded asynchronously. This may cause a delay in rendering. Consider preloading this relationship or using the load() method outside of React components.`,
		);
		throw promise;
	}

	/** Await a relation without Suspense. */
	async load(relationshipName: string): Promise<void> {
		const pending = this.pending();

		if (isRelationLoaded(this, relationshipName)) {
			return;
		}

		const key = loadingKey(relationshipName);

		if (pending[key]) {
			await pending[key];
			return;
		}

		const promise = this.loadRelationship(relationshipName);
		pending[key] = promise;

		try {
			await promise;
		} finally {
			delete pending[key];
		}
	}

	private async loadRelationship(relationshipName: string): Promise<void> {
		const ModelClass = this.constructor as unknown as {
			relationships: Record<string, unknown>;
		} & Record<string, unknown>;

		const relationship = findRelationship(
			ModelClass.relationships,
			relationshipName,
		) as LoadableRelation | undefined;

		if (relationship) {
			if (typeof relationship.get !== 'function') {
				throw new Error(
					`Relationship '${relationshipName}' must have a get() method`,
				);
			}

			const instance = this._proxy ?? this;
			setRelation(
				this,
				relationshipName,
				await relationship.get(instance),
			);
		} else {
			const loaderMethodName = `load${relationshipName.charAt(0).toUpperCase()}${relationshipName.slice(1)}`;
			const loaderMethod = ModelClass[loaderMethodName];

			if (typeof loaderMethod === 'function') {
				await loaderMethod([this]);
			} else {
				throw new Error(
					`Relationship '${relationshipName}' not found in static relationships constant and no custom loader '${loaderMethodName}' available`,
				);
			}
		}
	}

	/** Clears only relations whose owner keys are among the dirty fields. */
	clearAffectedRelationships(dirtyFields: string[]): string[] {
		const relationships = (
			this.constructor as unknown as {
				relationships: Record<string, unknown>;
			}
		).relationships;

		const cleared: string[] = [];

		for (const relationName in relationships) {
			const relationship = findRelationship(
				relationships,
				relationName,
			) as LoadableRelation | undefined;
			if (!relationship) continue;

			const ownerFields = relationship.getOwnerFields();

			const isAffected = ownerFields.some(f => dirtyFields.includes(f));
			if (!isAffected) continue;

			if (clearRelation(this, relationName)) {
				cleared.push(relationName);
			}
		}

		return cleared;
	}
}
