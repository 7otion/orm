/** Global subscribers told which model instances changed, after the change is real. */
import type { ListenerFailure } from './transaction';
export type InstanceChangeListener = (models: readonly object[]) => void | Promise<void>;
export declare class InstanceChanges {
    private readonly listeners;
    on(listener: InstanceChangeListener): () => void;
    get size(): number;
    report(models: readonly object[]): Promise<ListenerFailure[]>;
    private static describe;
}
export declare const instanceChanges: InstanceChanges;
//# sourceMappingURL=instance-changes.d.ts.map