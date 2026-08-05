/** One-to-many where the child table serves several owner types. */
import { Relationship } from './relationship';
import type { Model, ModelClassRef } from '../model';
import type { RelatedResolver } from './relationship';
export interface MorphManyConfig {
    /** Column on the related table naming the owner type. */
    discriminatorField: string;
    /** Value that column holds for this owner. */
    discriminatorValue: string;
    /** Column on the related table pointing back at the owner. */
    foreignKey: string;
    /** Column on the owner the foreign key refers to. Defaults to its key. */
    localKey?: string;
}
/**
 * The inverse of MorphTo.
 *
 * A plain `hasMany` against a shared child table matches on the foreign key
 * alone, so two owners of different types that happen to share a key value
 * collect each other's rows. This filters on the discriminator as well.
 */
export declare class MorphMany<T extends Model<T>, TClass = unknown> extends Relationship<T, TClass> {
    private discriminatorField;
    private discriminatorValue;
    constructor(parent: ModelClassRef | Model<any>, related: RelatedResolver<T>, config: MorphManyConfig);
    getOwnerFields(): string[];
    /** Scopes a query to this owner type. */
    private scoped;
    get(parent: Model<any>): Promise<T[]>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
    getDiscriminatorField(): string;
    getDiscriminatorValue(): string;
}
//# sourceMappingURL=morphMany.d.ts.map