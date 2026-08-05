/** save() / delete() for Model instances. */
import { ModelState } from './model-state.mixin';
export declare class RecordPersistenceMixin extends ModelState {
    save(): Promise<this>;
    protected generateSlugIfNeeded(): void;
    protected insert(): Promise<this>;
    protected update(): Promise<this>;
    delete(): Promise<boolean>;
}
//# sourceMappingURL=record-persistence.mixin.d.ts.map