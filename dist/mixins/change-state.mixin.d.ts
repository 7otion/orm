/**
 * Change State Mixin
 *
 * Provides dirty tracking and change detection for Model instances.
 */
export declare class ChangeStateMixin {
    get isDirty(): boolean;
    getDirty(): string[];
    getChanges(): Record<string, {
        old: any;
        new: any;
    }>;
}
//# sourceMappingURL=change-state.mixin.d.ts.map