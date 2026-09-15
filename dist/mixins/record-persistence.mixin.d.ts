/** save() / delete() for Model instances. */
import type { Transaction } from '../transaction';
import { ModelState } from './model-state.mixin';
export declare class RecordPersistenceMixin extends ModelState {
    /**
     * The value the row is stored under. A reassigned primary key sits in
     * `_attributes` while the row still carries the original.
     */
    private storedKey;
    /** The stored key as one string, for the unit's delete ledger. */
    private keySignature;
    save(tx?: Transaction): Promise<this>;
    /** Names this model in a held-write warning or a missing-handle error. */
    private writeLabel;
    protected generateSlugIfNeeded(): void;
    protected insert(tx?: Transaction): Promise<this>;
    protected update(tx?: Transaction): Promise<this>;
    delete(tx?: Transaction): Promise<boolean>;
}
//# sourceMappingURL=record-persistence.mixin.d.ts.map