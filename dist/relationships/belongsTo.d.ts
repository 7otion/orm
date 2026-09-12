/** Inverse of HasOne / HasMany: the foreign key lives on the owner. */
import { Relationship } from './relationship';
import type { Model } from '../model';
export declare class BelongsTo<T extends Model<T>, TClass = unknown> extends Relationship<T, TClass> {
    /** The key is on the owner here, so it names the related class, not the parent. */
    protected defaultForeignKey(): string;
    getOwnerFields(): string[];
    get(parent: Model<any>): Promise<T | null>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=belongsTo.d.ts.map