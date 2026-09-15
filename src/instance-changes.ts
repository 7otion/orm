/** Global subscribers told which model instances changed, after the change is real. */

import type { ListenerFailure } from './transaction';

export type InstanceChangeListener = (
	models: readonly object[],
) => void | Promise<void>;

export class InstanceChanges {
	private readonly listeners = new Set<InstanceChangeListener>();

	on(listener: InstanceChangeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	get size(): number {
		return this.listeners.size;
	}

	async report(models: readonly object[]): Promise<ListenerFailure[]> {
		if (models.length === 0 || this.listeners.size === 0) return [];

		const failures: ListenerFailure[] = [];
		for (const listener of [...this.listeners]) {
			try {
				await listener(models);
			} catch (error) {
				failures.push({
					event: 'changed',
					model: InstanceChanges.describe(models),
					error,
				});
			}
		}
		return failures;
	}

	private static describe(models: readonly object[]): string {
		const names = new Set(models.map(model => model.constructor.name));
		return [...names].join(', ');
	}
}

export const instanceChanges = new InstanceChanges();
