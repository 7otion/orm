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
    /**
     * Selectively clear only the relationships whose owner-side key(s) appear in
     * the provided list of dirty field names.
     */
    protected clearAffectedRelationships(dirtyFields: string[]): string[];
}
//# sourceMappingURL=relationship-loader.mixin.d.ts.map