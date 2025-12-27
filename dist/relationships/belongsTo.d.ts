/**
 * BelongsTo Relationship
 *
 * Represents a "belongs to" relationship (inverse of HasOne/HasMany).
 */
import { Relationship } from './relationship';
import type { Model } from '../model';
export declare class BelongsTo<T extends Model<T>> extends Relationship<T> {
    constructor(parent: any, related: any, foreignKey?: string, localKey?: string);
    /**
     * Get the related model for a parent instance
     * Queries with: WHERE local_key = parent's foreign key value LIMIT 1
     */
    get(parent: Model<any>): Promise<T | null>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=belongsTo.d.ts.map