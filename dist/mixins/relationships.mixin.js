/**
 * Relationships Helper Functions
 *
 * Pure functions for creating relationship instances.
 * Used by Model class static methods to define relationships.
 */
import { HasOne } from '../relationships/hasOne';
import { HasMany } from '../relationships/hasMany';
import { BelongsToMany } from '../relationships/belongsToMany';
/**
 * Create a one-to-one relationship
 */
export function createHasOne(parent, related, foreignKey, localKey) {
    return new HasOne(parent, related, foreignKey, localKey);
}
/**
 * Create a one-to-many relationship
 */
export function createHasMany(parent, related, foreignKey, localKey) {
    return new HasMany(parent, related, foreignKey, localKey);
}
/**
 * Create a many-to-many relationship through a pivot table
 */
export function createBelongsToMany(parent, related, pivotTable, foreignPivotKey, relatedPivotKey, parentKey, relatedKey) {
    return new BelongsToMany(parent, related, pivotTable, foreignPivotKey, relatedPivotKey, parentKey, relatedKey);
}
//# sourceMappingURL=relationships.mixin.js.map