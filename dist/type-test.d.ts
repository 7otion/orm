/**
 * Type safety test - verifying the solution works
 */
import { Model } from '.';
export declare class CategoryModel extends Model<CategoryModel> {
    id: number;
    content_type_id: number;
    name: string;
    static config: {
        table: string;
        primaryKey: string;
        timestamps: boolean;
    };
}
export declare class ContentTypeModel extends Model<ContentTypeModel> {
    id: number;
    name: string;
    slug: string;
    shape: 'square' | 'rectangular';
    file_type: 'video' | 'image' | 'binary' | 'document' | 'other';
    description: string | null;
    icon: string | null;
    order: number | null;
    created_at: string;
    updated_at: string;
    categories: CategoryModel[];
    static readonly relationships: Record<string, any>;
    static getBySlug(slug: string, eager?: boolean): Promise<ContentTypeModel | null>;
}
export declare function typeTest(): Promise<void>;
//# sourceMappingURL=type-test.d.ts.map