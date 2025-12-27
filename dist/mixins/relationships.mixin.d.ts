/**
 * Relationships Helper Functions
 *
 * Pure functions for creating relationship instances.
 * Used by Model class static methods to define relationships.
 */
import type { Model } from '../model';
import { HasOne } from '../relationships/hasOne';
import { HasMany } from '../relationships/hasMany';
import { BelongsToMany } from '../relationships/belongsToMany';
/**
 * Create a one-to-one relationship
 */
export declare function createHasOne<R extends Model<R>>(parent: any, related: any, foreignKey?: string, localKey?: string): HasOne<R>;
/**
 * Create a one-to-many relationship
 */
export declare function createHasMany<R extends Model<R>>(parent: any, related: any, foreignKey?: string, localKey?: string): HasMany<R>;
/**
 * Create a many-to-many relationship through a pivot table
 */
export declare function createBelongsToMany<R extends Model<R>>(parent: any, related: any, pivotTable: string, foreignPivotKey?: string, relatedPivotKey?: string, parentKey?: string, relatedKey?: string): BelongsToMany<R>;
//# sourceMappingURL=relationships.mixin.d.ts.map