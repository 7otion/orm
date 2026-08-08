/**
 * Declaration base giving every mixin a typed `this`. Emits no runtime code.
 *
 * Must be one shared base: two independent declarations of a member do not
 * merge into `Model`'s interface. Only members crossing a mixin boundary
 * belong here.
 */

import type { ModelConfig } from '../types';
import type { Caster } from '../casts';
import type { Timestamps } from '../timestamps';

export class ModelState {
	/* Initialised by Model's constructor. */

	/** @internal Column values, keyed by column name. */
	declare _attributes: Record<string, any>;

	/** @internal `_attributes` as last synced with the database. */
	declare _original: Record<string, any>;

	/** @internal Whether this instance corresponds to a persisted row. */
	declare _exists: boolean;

	/** @internal The Proxy wrapping this instance. */
	declare _proxy?: any;

	/** @internal Eager-load paths replayed by `refresh()`. */
	declare _loadedPaths?: Set<string>;
}

/**
 * Declared as an interface so they merge as methods: a subclass may override a
 * method, but not redeclare a property as one.
 */
export interface ModelState {
	/** @internal Provided by Model. */
	getConfig(): ModelConfig;

	/** @internal Provided by Model. */
	getTimestamps(): Timestamps;

	/** @internal Provided by Model. */
	getCaster(): Caster;

	/** Provided by ChangeStateMixin. */
	getDirty(): string[];

	/** Provided by RelationshipLoaderMixin. */
	load(relationshipName: string): Promise<void>;

	/** @internal Provided by RelationshipLoaderMixin. */
	clearAffectedRelationships(dirtyFields: string[]): string[];
}
