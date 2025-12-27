/**
 * Model Base Class - Active Record pattern with automatic relationships
 */
import { QueryBuilder } from './query-builder';
import { HasOne } from './relationships/hasOne';
import { HasMany } from './relationships/hasMany';
import { BelongsTo } from './relationships/belongsTo';
import { BelongsToMany } from './relationships/belongsToMany';
import { MorphTo } from './relationships/morphTo';
import { RecordPersistenceMixin } from './mixins/record-persistence.mixin';
import { ChangeStateMixin } from './mixins/change-state.mixin';
import { RelationshipLoaderMixin } from './mixins/relationship-loader.mixin';
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Model {
    /**
     * Define relationships for this model
     * Subclasses should override this method to define their relationships
     *
     * Example:
     * protected static defineRelationships() {
     *   return {
     *     posts: this.hasMany(Post),
     *     profile: this.hasOne(Profile)
     *   };
     * }
     */
    static defineRelationships() {
        return {};
    }
    /**
     * Get relationships for this model (with caching)
     */
    static get relationships() {
        // Use WeakMap to cache per-class to avoid static property inheritance issues
        if (!Model._relationshipsCache.has(this)) {
            Model._relationshipsCache.set(this, this.defineRelationships());
        }
        return Model._relationshipsCache.get(this);
    }
    /**
     * Returns Proxy to enable natural property access and relationship getters
     */
    constructor() {
        // @ts-ignore - Accessed by mixin methods
        this._attributes = {};
        // @ts-ignore - Accessed by mixin methods
        this._original = {};
        // @ts-ignore - Accessed by mixin methods
        this._exists = false;
        this.relationships = {};
        const proxy = new Proxy(this, {
            get(target, prop) {
                // Internal properties and symbols bypass proxy logic
                if (typeof prop === 'symbol' || prop.startsWith('_')) {
                    return target[prop];
                }
                // Special case: return constructor without binding to preserve static properties
                if (prop === 'constructor') {
                    return Object.getPrototypeOf(target).constructor;
                }
                // Check prototype chain for methods and getters (including mixed-in methods)
                let proto = Object.getPrototypeOf(target);
                while (proto) {
                    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
                    if (descriptor) {
                        // Execute getters with proxy as context so they access properties through proxy
                        if (descriptor.get) {
                            return descriptor.get.call(proxy);
                        }
                        // Bind methods to proxy so they access properties through proxy
                        if (typeof descriptor.value === 'function') {
                            return descriptor.value.bind(proxy);
                        }
                    }
                    // Move up the prototype chain
                    proto = Object.getPrototypeOf(proto);
                }
                // Check _attributes first for data properties (id, name, etc.)
                // This prevents TypeScript's `id!: number;` declarations from shadowing actual data
                if (prop in target._attributes) {
                    return target._attributes[prop];
                }
                // Check instance properties (used for eager-loaded relationships via _posts, _profile)
                // Skip TypeScript placeholder properties (undefined values from declarations like `id!: number;`)
                if (Object.prototype.hasOwnProperty.call(target, prop)) {
                    const instanceValue = target[prop];
                    // Only return instance property if it's not undefined
                    // (undefined likely means it's a TypeScript placeholder)
                    if (instanceValue !== undefined) {
                        return instanceValue;
                    }
                }
                // Auto-generate relationship getters if not explicitly defined
                // This allows accessing relationships without manually writing getters
                const ctor = Object.getPrototypeOf(target)
                    .constructor;
                const relationships = ctor.relationships;
                if (relationships && relationships[prop]) {
                    return target.getWithSuspense(prop);
                }
                // Default: undefined for non-existent properties
                return undefined;
            },
            set(target, prop, value) {
                // If it's a symbol or internal property, use default behavior
                if (typeof prop === 'symbol' || prop.startsWith('_')) {
                    target[prop] = value;
                    return true;
                }
                // Check if it's a setter
                const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), prop);
                if (descriptor && descriptor.set) {
                    descriptor.set.call(target, value);
                    return true;
                }
                // Check if it's a method (shouldn't overwrite methods)
                if (descriptor && typeof descriptor.value === 'function') {
                    return false;
                }
                // Store in _attributes for data properties
                target._attributes[prop] = value;
                return true;
            },
        });
        // Store proxy reference so mixin methods can access it
        this._proxy = proxy;
        return proxy;
    }
    getConfig() {
        const constructor = this.constructor;
        const config = constructor.config;
        let tableName = config.table;
        if (!tableName) {
            tableName = this.deriveTableName(constructor.name);
        }
        return {
            table: tableName,
            primaryKey: config.primaryKey || 'id',
            timestamps: config.timestamps || false,
        };
    }
    deriveTableName(className) {
        const snakeCase = className
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');
        if (snakeCase.endsWith('y')) {
            return snakeCase.slice(0, -1) + 'ies';
        }
        else if (snakeCase.endsWith('s')) {
            return snakeCase + 'es';
        }
        else {
            return snakeCase + 's';
        }
    }
    // @ts-ignore - Accessed by mixin methods
    getTimestampConfig() {
        const config = this.getConfig();
        if (!config.timestamps) {
            return null;
        }
        if (typeof config.timestamps === 'boolean') {
            return {
                created_at: 'created_at',
                updated_at: 'updated_at',
            };
        }
        return config.timestamps;
    }
    static getTableName() {
        const ModelClass = this;
        if (ModelClass.config.table) {
            return ModelClass.config.table;
        }
        // Cache the derived table name on the class constructor itself
        if (!ModelClass._cachedTableName) {
            const className = this.name || 'Model';
            const snakeCase = className
                .replace(/([A-Z])/g, '_$1')
                .toLowerCase()
                .replace(/^_/, '');
            if (snakeCase.endsWith('y')) {
                ModelClass._cachedTableName = snakeCase.slice(0, -1) + 'ies';
            }
            else if (snakeCase.endsWith('s')) {
                ModelClass._cachedTableName = snakeCase + 'es';
            }
            else {
                ModelClass._cachedTableName = snakeCase + 's';
            }
        }
        return ModelClass._cachedTableName;
    }
    static query() {
        const tableName = this.getTableName();
        return new QueryBuilder(this, tableName);
    }
    static async find(id) {
        const primaryKey = this.config.primaryKey || 'id';
        return this.query().where(primaryKey, id).first();
    }
    static async all() {
        return this.query().get();
    }
    static async create(data) {
        const model = new this();
        for (const [key, value] of Object.entries(data)) {
            model[key] = value;
        }
        await model.save();
        return model;
    }
    // ==================== Relationship Factory Methods ====================
    static hasOne(related, foreignKey, localKey) {
        return new HasOne(this, related, foreignKey, localKey);
    }
    static hasMany(related, foreignKey, localKey) {
        return new HasMany(this, related, foreignKey, localKey);
    }
    static belongsTo(related, foreignKey, localKey) {
        return new BelongsTo(this, related, foreignKey, localKey);
    }
    static belongsToMany(related, pivotTable, foreignPivotKey, relatedPivotKey, parentKey, relatedKey) {
        return new BelongsToMany(this, related, pivotTable, foreignPivotKey, relatedPivotKey, parentKey, relatedKey);
    }
    static morphTo(config) {
        return new MorphTo(this, config);
    }
}
Model._relationshipsCache = new WeakMap();
Model.config = {
    primaryKey: 'id',
    timestamps: true,
};
function applyMixins(derivedCtor, constructors) {
    constructors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            if (name !== 'constructor') {
                const descriptor = Object.getOwnPropertyDescriptor(baseCtor.prototype, name);
                if (descriptor) {
                    Object.defineProperty(derivedCtor.prototype, name, descriptor);
                }
            }
        });
    });
}
applyMixins(Model, [
    RecordPersistenceMixin,
    ChangeStateMixin,
    RelationshipLoaderMixin,
]);
//# sourceMappingURL=model.js.map