/** Writes rows the caller supplies, rather than rows a query matched. */
import type { Patch } from './columns';
import type { Model, ModelStatic } from './model';
export declare class BulkWriter<T extends Model<T>> {
    private readonly modelClass;
    constructor(modelClass: ModelStatic<T>);
    insert(rows: Patch<T>[]): Promise<number>;
    update(rows: Patch<T>[], keyBy?: string | string[]): Promise<number>;
    private keyColumns;
    private toRow;
    /** One statement per shape, so a row omitting a column keeps its default. */
    private static byShape;
}
//# sourceMappingURL=bulk-writer.d.ts.map