import type { QueryBuilder } from './query-builder';
import type { QueryValue } from './types';
import { Model } from './model';
type ModelConstructor<TModel extends Model<any>> = new () => TModel;
type StaticMethods<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K extends 'prototype' | 'constructor' | 'length' | 'name' ? never : T[K] : never;
};
type PickFunctions<T> = Pick<T, {
    [K in keyof T]: T[K] extends never ? never : K;
}[keyof T]>;
export type IRepository<TModel extends Model<any>, TModelClass = any> = {
    query(): QueryBuilder<TModel>;
    find(id: QueryValue | QueryValue[]): Promise<TModel | null>;
    all(): Promise<TModel[]>;
    create(data: Record<string, any>): Promise<TModel>;
} & PickFunctions<StaticMethods<TModelClass>>;
export declare function getRepository<TModelClass extends ModelConstructor<any>>(modelClass: TModelClass): IRepository<InstanceType<TModelClass>, TModelClass>;
export {};
//# sourceMappingURL=repository.d.ts.map