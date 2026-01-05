/**
 * Relationship Loader Mixin
 *
 * Provides relationship loading and management for Model instances.
 */
export class RelationshipLoaderMixin {
    /**
     * Helper for React Suspense-compatible relationship getters.
     */
    getWithSuspense(relationshipName) {
        const self = this;
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
    /**
     * Explicitly load a relationship asynchronously (non-Suspense)
     * Use this outside of React components or when not using Suspense
     */
    async load(relationshipName) {
        const self = this;
        const privateKey = `_${relationshipName}`;
        // If already loaded, return immediately
        if (self[privateKey] !== undefined) {
            return;
        }
        const loadingKey = `_loading_${relationshipName}`;
        // If already loading, wait for it
        if (self[loadingKey]) {
            await self[loadingKey];
            return;
        }
        // Start loading
        const promise = this.loadRelationship(relationshipName);
        self[loadingKey] = promise;
        try {
            await promise;
            delete self[loadingKey];
        }
        catch (error) {
            delete self[loadingKey];
            throw error;
        }
    }
    async loadRelationship(relationshipName) {
        const self = this;
        const relationship = self.constructor.relationships[relationshipName];
        if (relationship) {
            // Standard relationship loading
            if (typeof relationship.get !== 'function') {
                throw new Error(`Relationship '${relationshipName}' must have a get() method`);
            }
            // Use the proxy if available, otherwise fall back to raw instance
            const instance = self._proxy || this;
            const result = await relationship.get(instance);
            self[`_${relationshipName}`] = result;
        }
        else {
            // Check for custom relationship loader
            const loaderMethodName = `load${relationshipName.charAt(0).toUpperCase()}${relationshipName.slice(1)}`;
            const loaderMethod = self.constructor[loaderMethodName];
            if (typeof loaderMethod === 'function') {
                await loaderMethod([this]);
                // Assume the loader sets the appropriate private property
            }
            else {
                throw new Error(`Relationship '${relationshipName}' not found in static relationships constant and no custom loader '${loaderMethodName}' available`);
            }
        }
    }
    clearRelationships() {
        const self = this;
        for (const relationName in self.constructor.relationships) {
            const privateProp = `_${relationName}`;
            if (privateProp in self) {
                delete self[privateProp];
            }
        }
    }
}
//# sourceMappingURL=relationship-loader.mixin.js.map