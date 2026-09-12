/** Reconciles the set of rows on the far side of a to-many relation. */
import { HasMany } from './relationships/hasMany';
import { MorphMany } from './relationships/morphMany';
import type { Model } from './model';
import type { DatabaseRow } from './types';
import type { Transaction } from './transaction';
/** A member's identity: the columns given, or one bare value for a single column. */
export type RelationMember = DatabaseRow | string | number;
export interface RelationWriteOptions {
    /**
     * Columns that decide whether two rows are the same member. Defaults to the
     * related model's key columns, less the foreign key.
     */
    matchOn?: string[];
}
export interface SyncResult {
    attached: number;
    detached: number;
    updated: number;
    unchanged: number;
}
type ToMany<T extends Model<T>> = HasMany<T> | MorphMany<T>;
export declare class RelationWriter<T extends Model<T>> {
    private readonly parent;
    private readonly name;
    private readonly relation;
    constructor(parent: Model<any>, name: string, relation: ToMany<T>);
    /**
     * Makes the far side hold exactly these rows: missing ones are created,
     * absent ones deleted, and matched ones updated where they differ. Rows that
     * are already right are left alone. One transaction.
     */
    sync(members: RelationMember[], options?: RelationWriteOptions, tx?: Transaction): Promise<SyncResult>;
    private related;
    /** The columns tying a row to this parent: the foreign key, plus a morph's type. */
    private own;
    private parentKey;
    private matchColumns;
    /** A bare value is the single match column; anything else is already a row. */
    private toRow;
    private identity;
    private keyOf;
    private rowOf;
    /** Copies a row's non-identity columns onto a model; reports whether any moved. */
    private applyTo;
    private load;
    /** This parent's rows, narrowed to the members given. */
    private matching;
    /** Every row belonging to this parent, and no other. */
    private scoped;
    /** The loaded relation is now stale, so the next read reloads it. */
    private invalidate;
}
/** Narrows a relation to one whose far side is a writable set. */
export declare function toManyRelation<T extends Model<T>>(relation: unknown, name: string): ToMany<T>;
export {};
//# sourceMappingURL=relation-writer.d.ts.map