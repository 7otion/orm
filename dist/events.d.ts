/** Lifecycle events a model's writes fire, and who is told. */
import type { Transaction } from './transaction';
import type { Model, ModelClassRef } from './model';
import type { ColumnKeys } from './columns';
export type ModelEvent = 'saving' | 'creating' | 'created' | 'saved' | 'updating' | 'updated' | 'deleting' | 'deleted';
export declare const INSERT_EVENTS: readonly ModelEvent[];
export declare const UPDATE_EVENTS: readonly ModelEvent[];
export declare const DELETE_EVENTS: readonly ModelEvent[];
export declare const WRITE_EVENTS: readonly ModelEvent[];
/** Runs inside the write; its own writes must carry `tx`. A throw rolls the write back. */
export type Hook<T> = (batch: EventBatch<T>, tx: Transaction) => void | Promise<void>;
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
export declare class EventBatch<T> {
    readonly event: ModelEvent;
    readonly modelName: string;
    readonly models: T[];
    private readonly changes;
    constructor(event: ModelEvent, modelName: string, models: T[], changes: Changes);
    /** Whether the write changed `column`, or anything when no column is given. */
    changed(model: T, column?: ColumnKeys<T>): boolean;
    /** The value `column` held before the write; `undefined` when it did not change. */
    previous<K extends ColumnKeys<T>>(model: T, column: K): T[K] | undefined;
}
/** One model class's hooks and listeners. `Model.events` builds and caches one per class. */
export declare class ModelEvents<T extends Model<T>> {
    private readonly modelClass;
    private readonly hooks;
    private readonly listeners;
    constructor(modelClass: ModelClassRef, declared: ModelHooks<T> | undefined);
    /** Returns the unsubscribe. Registering the same function twice registers it once. */
    on(event: ModelEvent, listener: Listener<T>): () => void;
    /** Whether any hook or listener is registered for any of these events. */
    has(events: readonly ModelEvent[]): boolean;
    hasHooks(events: readonly ModelEvent[]): boolean;
    /**
     * A unit when something is registered for its events, so hooks have a
     * handle and listeners a commit; otherwise a plain queued write.
     */
    write<R>(events: readonly ModelEvent[], work: (unit?: Transaction) => Promise<R>, tx: Transaction | undefined, label: string): Promise<R>;
    /** Must precede the unit's first statement: hooks may write, so their unit begins. */
    prepare(events: readonly ModelEvent[], unit: Transaction, label: string): Promise<void>;
    /** Runs the hooks now and defers the listeners to the unit's commit. An empty batch fires nothing. */
    fire(event: ModelEvent, models: T[], unit: Transaction, changes?: Changes): Promise<void>;
    /** What each model's write is about to change, or nothing when no after-event will ask. */
    captureFor(events: readonly ModelEvent[], models: T[]): Changes | undefined;
    private capture;
}
//# sourceMappingURL=events.d.ts.map