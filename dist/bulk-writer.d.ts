/** Writes rows the caller supplies, rather than rows a query matched. */
import type { Transaction } from './transaction';
import type { Patch } from './columns';
import type { Model, ModelStatic } from './model';
export declare class BulkWriter<T extends Model<T>> {
    private readonly modelClass;
    constructor(modelClass: ModelStatic<T>);
    insert(rows: Patch<T>[], tx?: Transaction): Promise<number>;
    update(models: T[], tx?: Transaction): Promise<T[]>;
    /** The value the row is stored under, as `save()` locates it. */
    private keyOf;
    /** Which models no longer have a row. One query, on the failure path only. */
    private findMissing;
    private keyColumns;
    private toRow;
    /** One statement per shape, so a row omitting a column keeps its default. */
    private static byShape;
}
//# sourceMappingURL=bulk-writer.d.ts.map