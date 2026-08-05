/** One-to-many. */
import { Relationship } from './relationship';
import type { Model } from '../model';
export declare class HasMany<T extends Model<T>, TClass = unknown> extends Relationship<T, TClass> {
    getOwnerFields(): string[];
    get(parent: Model<any>): Promise<T[]>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=hasMany.d.ts.map