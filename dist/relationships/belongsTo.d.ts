/** Inverse of HasOne / HasMany: the foreign key lives on the owner. */
import { Relationship } from './relationship';
import type { Model } from '../model';
export declare class BelongsTo<T extends Model<T>, TClass = unknown> extends Relationship<T, TClass> {
    constructor(parent: any, related: any, foreignKey?: string, localKey?: string);
    getOwnerFields(): string[];
    get(parent: Model<any>): Promise<T | null>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=belongsTo.d.ts.map