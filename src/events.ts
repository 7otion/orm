/** Lifecycle events a model's writes fire, and who is told. */

import { ORM } from './orm';
import type { Transaction } from './transaction';
import type { Model, ModelClassRef } from './model';
import type { ColumnKeys } from './columns';

export type ModelEvent =
	| 'saving'
	| 'creating'
	| 'created'
	| 'saved'
	| 'updating'
	| 'updated'
	| 'deleting'
	| 'deleted';

export const INSERT_EVENTS: readonly ModelEvent[] = [
	'saving',
	'creating',
	'created',
	'saved',
];
export const UPDATE_EVENTS: readonly ModelEvent[] = [
	'saving',
	'updating',
	'updated',
	'saved',
];
export const DELETE_EVENTS: readonly ModelEvent[] = ['deleting', 'deleted'];
export const WRITE_EVENTS: readonly ModelEvent[] = [
	...INSERT_EVENTS,
	'updating',
	'updated',
	...DELETE_EVENTS,
];

/** Runs inside the write; its own writes must carry `tx`. A throw rolls the write back. */
export type Hook<T> = (
	batch: EventBatch<T>,
	tx: Transaction,
) => void | Promise<void>;

/** Runs after the write has committed and released the queue; never on rollback. */
export type Listener<T> = (batch: EventBatch<T>) => void | Promise<void>;

/** The `hooks` literal a model declares. */
export type ModelHooks<T> = {
	readonly [E in ModelEvent]?: Hook<T> | Hook<T>[];
};

export interface Change {
	old: unknown;
	new: unknown;
}

export type Changes = Map<unknown, Record<string, Change>>;

/** The models one event fires for, with what the write changed as of that moment. */
export class EventBatch<T> {
	constructor(
		readonly event: ModelEvent,
		readonly modelName: string,
		readonly models: T[],
		private readonly changes: Changes,
	) {}

	/** Whether the write changed `column`, or anything when no column is given. */
	changed(model: T, column?: ColumnKeys<T>): boolean {
		const changes = this.changes.get(model);
		if (!changes) return false;
		return column === undefined
			? Object.keys(changes).length > 0
			: column in changes;
	}

	/** The value `column` held before the write; `undefined` when it did not change. */
	previous<K extends ColumnKeys<T>>(model: T, column: K): T[K] | undefined {
		return this.changes.get(model)?.[column]?.old as T[K] | undefined;
	}
}

/** A model class as the registry sees it: named, and possibly declaring hooks. */
type HookSource<T> = ModelClassRef & { readonly hooks?: ModelHooks<T> };

/**
 * One model class's listeners, and a live view of its hooks. Hooks are read
 * off the class at each use, so assigning `hooks` late still takes effect.
 */
export class ModelEvents<T extends Model<T>> {
	private readonly listeners = new Map<ModelEvent, Set<Listener<T>>>();

	constructor(private readonly modelClass: HookSource<T>) {}

	private hooksFor(event: ModelEvent): Hook<T>[] {
		const declared = this.modelClass.hooks?.[event];
		if (!declared) return [];
		return Array.isArray(declared) ? declared : [declared];
	}

	/** Returns the unsubscribe. Registering the same function twice registers it once. */
	on(event: ModelEvent, listener: Listener<T>): () => void {
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	}

	/** Whether any hook or listener is registered for any of these events. */
	has(events: readonly ModelEvent[]): boolean {
		return events.some(
			event =>
				this.hooksFor(event).length > 0 ||
				(this.listeners.get(event)?.size ?? 0) > 0,
		);
	}

	hasHooks(events: readonly ModelEvent[]): boolean {
		return events.some(event => this.hooksFor(event).length > 0);
	}

	/**
	 * A unit when something is registered for its events, so hooks have a
	 * handle and listeners a commit; otherwise a plain queued write.
	 */
	write<R>(
		events: readonly ModelEvent[],
		work: (unit?: Transaction) => Promise<R>,
		tx: Transaction | undefined,
		label: string,
	): Promise<R> {
		const orm = ORM.getInstance();

		if (!this.has(events)) {
			return orm.queueWrite(() => work(tx), tx, label);
		}

		return orm.queueUnit(
			async unit => {
				await this.prepare(events, unit, label);
				return work(unit);
			},
			tx,
			label,
		);
	}

	/** Must precede the unit's first statement: hooks may write, so their unit begins. */
	async prepare(
		events: readonly ModelEvent[],
		unit: Transaction,
		label: string,
	): Promise<void> {
		if (this.hasHooks(events)) {
			await ORM.getInstance().beginForHooks(unit, label);
		}
	}

	/** Runs the hooks now and defers the listeners to the unit's commit. An empty batch fires nothing. */
	async fire(
		event: ModelEvent,
		models: T[],
		unit: Transaction,
		changes?: Changes,
	): Promise<void> {
		if (models.length === 0) return;

		const hooks = this.hooksFor(event);
		const listeners = this.listeners.get(event);
		if (hooks.length === 0 && !listeners?.size) return;

		const batch = new EventBatch<T>(
			event,
			this.modelClass.name,
			models,
			changes ?? this.capture(models),
		);

		// Deferred before the hooks run, so listener order is event order.
		if (listeners) {
			for (const listener of listeners) {
				unit.defer(batch, () => listener(batch));
			}
		}

		if (hooks.length > 0) {
			unit.enterHooks(event, this.modelClass.name);
			try {
				for (const hook of hooks) {
					await hook(batch, unit);
				}
			} finally {
				unit.exitHooks();
			}
		}
	}

	/** What each model's write is about to change, or nothing when no after-event will ask. */
	captureFor(
		events: readonly ModelEvent[],
		models: T[],
	): Changes | undefined {
		return this.has(events) ? this.capture(models) : undefined;
	}

	private capture(models: T[]): Changes {
		const changes: Changes = new Map();
		for (const model of models) {
			changes.set(model, model.getChanges());
		}
		return changes;
	}
}
