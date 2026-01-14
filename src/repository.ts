import type { QueryBuilder } from './query-builder';
import type { QueryValue } from './types';
import { Model } from './model';

type ModelConstructor<TModel extends Model<any>> = new () => TModel;
type StaticMethods<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any
		? K extends 'prototype' | 'constructor' | 'length' | 'name'
			? never
			: T[K]
		: never;
};

type PickFunctions<T> = Pick<
	T,
	{
		[K in keyof T]: T[K] extends never ? never : K;
	}[keyof T]
>;

export type IRepository<TModel extends Model<any>, TModelClass = any> = {
	query(): QueryBuilder<TModel>;
	find(id: QueryValue | QueryValue[]): Promise<TModel | null>;
	all(): Promise<TModel[]>;
	create(data: Record<string, any>): Promise<TModel>;
} & PickFunctions<StaticMethods<TModelClass>>;

export function getRepository<TModelClass extends ModelConstructor<any>>(
	modelClass: TModelClass,
): IRepository<InstanceType<TModelClass>, TModelClass> {
	const ModelCtor = modelClass as any;

	const baseRepo = {
		query() {
			return ModelCtor.query();
		},

		async find(id: QueryValue | QueryValue[]) {
			return await ModelCtor.find(id);
		},

		async all() {
			return await ModelCtor.all();
		},

		async create(data: Record<string, any>) {
			return await ModelCtor.create(data);
		},
	};

	const staticMethods: Record<string, any> = {};

	let current: any = modelClass;
	while (current && current !== Model && current !== Function.prototype) {
		Object.getOwnPropertyNames(current).forEach(key => {
			if (
				key === 'constructor' ||
				key === 'config' ||
				key === 'length' ||
				key === 'name' ||
				key === 'prototype' ||
				key in baseRepo
			) {
				return;
			}

			const descriptor = Object.getOwnPropertyDescriptor(current, key);
			if (descriptor && typeof descriptor.value === 'function') {
				staticMethods[key] = descriptor.value.bind(modelClass);
			}
		});

		current = Object.getPrototypeOf(current);
	}

	return {
		...baseRepo,
		...staticMethods,
	} as IRepository<InstanceType<TModelClass>, TModelClass>;
}
