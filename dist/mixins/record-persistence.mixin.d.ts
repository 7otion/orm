/**
 * Record Persistence Mixin
 *
 * Provides database write operations (save, delete) for Model instances.
 */
export declare class RecordPersistenceMixin {
    save(): Promise<this>;
    protected generateSlugIfNeeded(): void;
    protected insert(): Promise<this>;
    protected update(): Promise<this>;
    delete(): Promise<boolean>;
}
//# sourceMappingURL=record-persistence.mixin.d.ts.map