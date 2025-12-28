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
     */
    load(relationshipName: string): Promise<void>;
    private loadRelationship;
    clearRelationships(): void;
}
//# sourceMappingURL=relationship-loader.mixin.d.ts.map