/** Loads and invalidates relations on Model instances. */
import { ModelState } from './model-state.mixin';
export declare class RelationshipLoaderMixin extends ModelState {
    /**
     * In-flight load promises, so concurrent `load()` calls for one relation
     * share a single query.
     */
    private pending;
    /** Throws a promise on a miss, as Suspense requires. */
    protected getWithSuspense<R>(relationshipName: string): R;
    /** Await a relation without Suspense. */
    load(relationshipName: string): Promise<void>;
    private loadRelationship;
    /** Clears only relations whose owner keys are among the dirty fields. */
    clearAffectedRelationships(dirtyFields: string[]): string[];
}
//# sourceMappingURL=relationship-loader.mixin.d.ts.map