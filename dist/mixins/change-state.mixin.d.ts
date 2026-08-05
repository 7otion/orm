/** Dirty tracking for Model instances. */
import { ModelState } from './model-state.mixin';
export declare class ChangeStateMixin extends ModelState {
    get isDirty(): boolean;
    getDirty(): string[];
    getChanges(): Record<string, {
        old: any;
        new: any;
    }>;
}
//# sourceMappingURL=change-state.mixin.d.ts.map