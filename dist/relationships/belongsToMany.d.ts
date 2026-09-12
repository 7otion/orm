/** Many-to-many through a pivot table. */
import { Relationship } from './relationship';
import type { Model, ModelClassRef } from '../model';
import type { RelatedResolver } from './relationship';
export declare class BelongsToMany<T extends Model<T>, TClass = unknown> extends Relationship<T, TClass> {
    private pivotTable;
    private foreignPivotKey;
    private relatedPivotKey;
    private parentKey;
    private relatedKey;
    constructor(parent: ModelClassRef | Model<any>, related: RelatedResolver<T>, pivotTable: string, foreignPivotKey?: string, relatedPivotKey?: string, parentKey?: string, relatedKey?: string);
    getOwnerFields(): string[];
    /** Joins through the pivot table. */
    get(parent: Model<any>): Promise<T[]>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=belongsToMany.d.ts.map