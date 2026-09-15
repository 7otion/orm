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
    /** Await a relation without Suspense. A load that ran is reported as an instance change. */
    load(relationshipName: string): Promise<void>;
    /** @internal Loads without reporting; false when it was already loaded. */
    reloadRelation(relationshipName: string): Promise<boolean>;
    private loadRelationship;
    /** Clears only relations whose owner keys are among the dirty fields. */
    clearAffectedRelationships(dirtyFields: string[]): string[];
}
//# sourceMappingURL=relationship-loader.mixin.d.ts.map