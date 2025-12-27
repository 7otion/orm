/**
 * Change State Mixin
 *
 * Provides dirty tracking and change detection for Model instances.
 */
export class ChangeStateMixin {
    get isDirty() {
        return this.getDirty().length > 0;
    }
    getDirty() {
        const self = this;
        const dirty = [];
        for (const key in self._attributes) {
            if (self._attributes[key] !== self._original[key]) {
                dirty.push(key);
            }
        }
        return dirty;
    }
    getChanges() {
        const self = this;
        const changes = {};
        for (const key of this.getDirty()) {
            changes[key] = {
                old: self._original[key],
                new: self._attributes[key],
            };
        }
        return changes;
    }
}
//# sourceMappingURL=change-state.mixin.js.map