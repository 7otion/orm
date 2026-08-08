import type { DatabaseRow, ModelConfig, TimestampConfig } from './types';
/** A model's timestamp columns, which the ORM writes and the caller cannot. */
export declare class Timestamps {
    /** Column names, or `null` when the model disables timestamps. */
    readonly columns: TimestampConfig | null;
    private readonly owned;
    constructor(declaration: ModelConfig['timestamps']);
    get enabled(): boolean;
    owns(column: string): boolean;
    /** Caller data with the timestamp columns dropped, silently as `guarded` is. */
    strip(data: DatabaseRow): DatabaseRow;
    /** Truncated to the whole second the column stores, so the in-memory value
     * matches the persisted one. */
    now(): Date;
}
//# sourceMappingURL=timestamps.d.ts.map