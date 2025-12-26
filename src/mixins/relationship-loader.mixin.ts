/**
 * Relationship Loader Mixin
 *
 * Provides relationship loading and management for Model instances.
 */

export class RelationshipLoaderMixin {
	/**
	 * Helper for React Suspense-compatible relationship getters.
	 */
	protected getWithSuspense<R>(relationshipName: string): R {
		const self = this as any;
		const privateKey = `_${relationshipName}`;

		if (self[privateKey] !== undefined) {
			return self[privateKey];
		}

		const loadingKey = `_loading_${relationshipName}`;
		if (self[loadingKey]) {
			throw self[loadingKey];
		}

		const promise = this.loadRelationship(relationshipName).then(() => {
			delete self[loadingKey];
		});

		self[loadingKey] = promise;
		throw promise;
	}

	private async loadRelationship(relationshipName: string): Promise<void> {
		const self = this as any;
		const relationship = self.constructor.relationships[relationshipName];

		if (!relationship) {
			throw new Error(
				`Relationship '${relationshipName}' not found in static relationships constant`,
			);
		}

		if (typeof relationship.get !== 'function') {
			throw new Error(
				`Relationship '${relationshipName}' must have a get() method`,
			);
		}

		const result = await relationship.get(this);
		self[`_${relationshipName}`] = result;
	}

	clearRelationships(): void {
		const self = this as any;

		for (const relationName in self.constructor.relationships) {
			const privateProp = `_${relationName}`;
			if (privateProp in self) {
				delete self[privateProp];
			}
		}
	}
}
