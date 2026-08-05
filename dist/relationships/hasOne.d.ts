/** One-to-one. */
import { Relationship } from './relationship';
import type { Model } from '../model';
export declare class HasOne<T extends Model<T>, TClass = unknown> extends Relationship<T, TClass> {
    getOwnerFields(): string[];
    get(parent: Model<any>): Promise<T | null>;
    eagerLoadFor(models: Model<any>[], relationName: string): Promise<void>;
}
//# sourceMappingURL=hasOne.d.ts.map