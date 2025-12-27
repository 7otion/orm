/**
 * BelongsToMany Relationship
 *
 * Represents a many-to-many relationship through a pivot table.
 */
import { Relationship } from './relationship';
import type { Model, ModelConstructor } from '../model';
export declare class BelongsToMany<T extends Model<T>> extends Relationship<T> {
    private pivotTable;
    private foreignPivotKey;
    private relatedPivotKey;
    private parentKey;
    private relatedKey;
    constructor(parent: ModelConstructor<any> | Model<any>, related: ModelConstructor<T>, pivotTable: string, foreignPivotKey?: string, relatedPivotKey?: string, parentKey?: string, relatedKey?: string);
    /**
     * Get all related models for a parent instance
     * Uses a JOIN to connect through the pivot table
     *
     * Example SQL:
     * SELECT roles.* FROM roles
     * INNER JOIN user_roles ON roles.id = user_roles.role_id
     * WHERE user_roles.user_id = ?
     */
    get(parent: Model<any>): Promise<T[]>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=belongsToMany.d.ts.map