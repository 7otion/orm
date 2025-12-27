import { Model } from './model';
export function getRepository(modelClass) {
    const ModelCtor = modelClass;
    const baseRepo = {
        query() {
            return ModelCtor.query();
        },
        async find(id) {
            return await ModelCtor.find(id);
        },
        async all() {
            return await ModelCtor.all();
        },
        async create(data) {
            return await ModelCtor.create(data);
        },
    };
    const staticMethods = {};
    let current = modelClass;
    while (current && current !== Model && current !== Function.prototype) {
        Object.getOwnPropertyNames(current).forEach(key => {
            if (key === 'constructor' ||
                key === 'config' ||
                key === 'length' ||
                key === 'name' ||
                key === 'prototype' ||
                key in baseRepo) {
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
    };
}
//# sourceMappingURL=repository.js.map