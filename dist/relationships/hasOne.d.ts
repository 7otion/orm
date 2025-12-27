/**
 * HasOne Relationship
 *
 * Represents a one-to-one relationship.
 */
import { Relationship } from './relationship';
import type { Model } from '../model';
export declare class HasOne<T extends Model<T>> extends Relationship<T> {
    /**
     * Get the related model for a parent instance
     * Queries with: WHERE foreign_key = parent's local key value LIMIT 1
     */
    get(parent: Model<any>): Promise<T | null>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=hasOne.d.ts.map