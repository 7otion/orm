/**
 * Relationship Loader Mixin
 *
 * Provides relationship loading and management for Model instances.
 */
export declare class RelationshipLoaderMixin {
    /**
     * Helper for React Suspense-compatible relationship getters.
     */
    protected getWithSuspense<R>(relationshipName: string): R;
    /**
     * Explicitly load a relationship asynchronously (non-Suspense)
     * Use this outside of React components or when not using Suspense
     *
     * @param relationshipName - Name of the relationship to load
     * @returns Promise that resolves when the relationship is loaded
     *
     * @example
     * ```typescript
     * const content = await contentRepo.find(contentId);
     * await content.load('category'); // Load relationship
     * console.log(content.category); // Now available
     * ```
     */
    load(relationshipName: string): Promise<void>;
    private loadRelationship;
    clearRelationships(): void;
}
//# sourceMappingURL=relationship-loader.mixin.d.ts.map