/** Dirty tracking for Model instances. */

import { ModelState } from './model-state.mixin';

export class ChangeStateMixin extends ModelState {
	get isDirty(): boolean {
		return this.getDirty().length > 0;
	}

	getDirty(): string[] {
		const dirty: string[] = [];

		for (const key in this._attributes) {
			if (this._attributes[key] !== this._original[key]) {
				dirty.push(key);
			}
		}

		return dirty;
	}

	getChanges(): Record<string, { old: any; new: any }> {
		const changes: Record<string, { old: any; new: any }> = {};

		for (const key of this.getDirty()) {
			changes[key] = {
				old: this._original[key],
				new: this._attributes[key],
			};
		}

		return changes;
	}
}
