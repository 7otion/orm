/**
 * Type safety test - verifying the solution works
 */
var _a;
import { Model, getRepository } from '.';
export class CategoryModel extends Model {
}
CategoryModel.config = {
    table: 'categories',
    primaryKey: 'id',
    timestamps: false,
};
export class ContentTypeModel extends Model {
    // ✅ Custom static method using repository internally
    static async getBySlug(slug, eager = true) {
        const repo = getRepository(_a);
        const result = await repo.query().where('slug', slug).first();
        if (result && eager) {
            const withRelations = await repo
                .query()
                .where('slug', slug)
                .first();
            return withRelations;
        }
        return result;
    }
}
_a = ContentTypeModel;
// Define relationships - runtime behavior
ContentTypeModel.relationships = {
    // ✅ Auto-inferred: foreignKey = 'content_type_id', localKey = 'id'
    categories: _a.hasMany(CategoryModel),
};
// Type checks - using repository pattern for clean API
export async function typeTest() {
    // ✅ Repository pattern - clean, no type repetition!
    const repo = getRepository(ContentTypeModel);
    // Base ORM methods
    const model1 = await repo.find(1); // ContentTypeModel | null
    const model2 = await repo.all(); // ContentTypeModel[]
    const model3 = await repo.query().where('slug', 'test').first(); // ContentTypeModel | null
    // ✅ Custom static methods now work through repository too!
    const model4 = await repo.getBySlug('test'); // ContentTypeModel | null
    // ✅ Relationship properties work with TypeScript type safety
    if (model1) {
        console.log('Categories:', model1.categories); // CategoryModel[] - fully typed!
    }
    console.log('All types check!', {
        model1,
        model2,
        model3,
        model4,
    });
}
//# sourceMappingURL=type-test.js.map