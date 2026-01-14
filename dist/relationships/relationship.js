/**
 * Base Relationship Class
 *
 * All relationship types (HasOne, HasMany, BelongsToMany, MorphTo) extend this class.
 *
 * Key Responsibilities:
 * - Define how to load related records (lazy loading)
 * - Define how to eager load for multiple parent models
 *
 * Relationship Pattern:
 * - Relationships are accessed as properties: user.posts
 * - Lazy loading: triggered by Proxy when property is accessed
 * - Eager loading: use with() on the parent query
 */
export class Relationship {
    constructor(parent, related, foreignKey, localKey) {
        if (typeof parent === 'function') {
            this.parentConstructor = parent;
        }
        else {
            this.parentConstructor =
                parent.constructor;
        }
        this.related = related;
        if (!foreignKey) {
            const parentClassName = this.parentConstructor.name;
            const snakeCase = parentClassName
                .replace(/Model$/, '')
                .replace(/([A-Z])/g, '_$1')
                .toLowerCase()
                .replace(/^_/, '');
            this.foreignKey = `${snakeCase}_id`;
        }
        else {
            this.foreignKey = foreignKey;
        }
        if (!localKey) {
            const pk = this.parentConstructor.config?.primaryKey || 'id';
            // Relationships don't support composite primary keys - use first key
            this.localKey = Array.isArray(pk) ? pk[0] : pk;
        }
        else {
            this.localKey = localKey;
        }
    }
    getParentKeyValue(parent) {
        return parent[this.localKey];
    }
    /**
     * Get the related model class
     */
    getRelated() {
        return this.related;
    }
    /**
     * Get the foreign key
     */
    getForeignKey() {
        return this.foreignKey;
    }
    /**
     * Get the local key
     */
    getLocalKey() {
        return this.localKey;
    }
}
//# sourceMappingURL=relationship.js.map