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
    private loadRelationship;
    clearRelationships(): void;
}
//# sourceMappingURL=relationship-loader.mixin.d.ts.map