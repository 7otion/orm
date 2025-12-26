/**
 * Change State Mixin
 *
 * Provides dirty tracking and change detection for Model instances.
 */

export class ChangeStateMixin {
	get isDirty(): boolean {
		return this.getDirty().length > 0;
	}

	getDirty(): string[] {
		const self = this as any;
		const dirty: string[] = [];

		for (const key in self._attributes) {
			if (self._attributes[key] !== self._original[key]) {
				dirty.push(key);
			}
		}

		return dirty;
	}

	getChanges(): Record<string, { old: any; new: any }> {
		const self = this as any;
		const changes: Record<string, { old: any; new: any }> = {};

		for (const key of this.getDirty()) {
			changes[key] = {
				old: self._original[key],
				new: self._attributes[key],
			};
		}

		return changes;
	}
}
