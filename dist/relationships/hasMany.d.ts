/**
 * HasMany Relationship
 *
 * Represents a one-to-many relationship.
 */
import { Relationship } from './relationship';
import type { Model } from '../model';
export declare class HasMany<T extends Model<T>> extends Relationship<T> {
    /**
     * Get all related models for a parent instance
     * Queries with: WHERE foreign_key = parent's local key value
     */
    get(parent: Model<any>): Promise<T[]>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=hasMany.d.ts.map