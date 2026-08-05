/**
 * MorphMany — children in a table shared by several owner types.
 *
 * The scenario throughout is the one a plain hasMany gets wrong: `conditions`
 * carries `owner_kind`/`owner_ref`, and two owners of different types share a
 * key value.
 */

import { describe, expect, test } from 'bun:test';

import { Model } from '../src/model';
import { freshDatabase } from './helpers/setup';

class Condition extends Model<Condition> {
	static config = {
		table: 'conditions',
		primaryKey: 'uuid',
		timestamps: false,
	};

	uuid!: string;
	owner_kind!: string;
	owner_ref!: string;
	variable_ref!: string;
	op!: string;
	value!: string;
}

class MorphHotspot extends Model<MorphHotspot> {
	static config = { table: 'hotspots', primaryKey: 'ref', timestamps: false };

	ref!: string;
	bg_asset_ref!: string;
	label!: string;

	conditions!: Condition[];

	static readonly relationships = {
		conditions: this.morphMany(Condition, {
			discriminatorField: 'owner_kind',
			discriminatorValue: 'hotspot',
			foreignKey: 'owner_ref',
			localKey: 'ref',
		}),
	};
}

class MorphRoute extends Model<MorphRoute> {
	static config = { table: 'routes', primaryKey: 'ref', timestamps: false };

	ref!: string;
	owner_kind!: string;
	owner_ref!: string;
	goto_ref!: string;

	conditions!: Condition[];

	static readonly relationships = {
		conditions: this.morphMany(Condition, {
			discriminatorField: 'owner_kind',
			discriminatorValue: 'route',
			foreignKey: 'owner_ref',
			localKey: 'ref',
		}),
	};
}

/** A hotspot and a route sharing the ref 'door', each with one condition. */
async function seedCollision(): Promise<void> {
	await MorphHotspot.create({
		ref: 'door',
		bg_asset_ref: 'bg',
		label: 'Door',
		sort: 0,
		x: 0,
		y: 0,
		w: 1,
		h: 1,
		mask_asset_ref: null,
	});
	await MorphRoute.create({
		ref: 'door',
		owner_kind: 'line',
		owner_ref: 'intro/a',
		sort: 0,
		goto_ref: 'hall',
	});

	await Condition.create({
		uuid: 'c-hotspot',
		owner_kind: 'hotspot',
		owner_ref: 'door',
		variable_ref: 'has_key',
		op: 'eq',
		value: 'true',
	});
	await Condition.create({
		uuid: 'c-route',
		owner_kind: 'route',
		owner_ref: 'door',
		variable_ref: 'gold',
		op: 'gt',
		value: '10',
	});
}

describe('morphMany', () => {
	test('eager loading matches on the discriminator, not just the key', async () => {
		await freshDatabase();
		await seedCollision();

		const [hotspot] = await MorphHotspot.query().with('conditions').get();
		const [route] = await MorphRoute.query().with('conditions').get();

		expect(hotspot!.conditions.map(c => c.uuid)).toEqual(['c-hotspot']);
		expect(route!.conditions.map(c => c.uuid)).toEqual(['c-route']);
	});

	test('lazy loading applies the same filter', async () => {
		await freshDatabase();
		await seedCollision();

		const hotspot = (await MorphHotspot.find('door'))!;
		await hotspot.load('conditions');

		expect(hotspot.conditions.map(c => c.uuid)).toEqual(['c-hotspot']);
	});

	test('the discriminator appears in the emitted SQL', async () => {
		const { adapter } = await freshDatabase();
		await seedCollision();

		adapter.clearLog();
		await MorphHotspot.query().with('conditions').get();

		const query = adapter.log.find(e => e.sql.includes('FROM conditions'))!;
		expect(query.sql).toContain('"owner_kind" = ?');
		expect(query.params).toContain('hotspot');
	});

	test('an owner with no matching children gets an empty array', async () => {
		await freshDatabase();
		await MorphHotspot.create({
			ref: 'window',
			bg_asset_ref: 'bg',
			label: 'Window',
			sort: 0,
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			mask_asset_ref: null,
		});

		const [hotspot] = await MorphHotspot.query().with('conditions').get();
		expect(hotspot!.conditions).toEqual([]);
	});

	test('children are batched into one query across owners', async () => {
		const { adapter } = await freshDatabase();
		for (const ref of ['a', 'b', 'c']) {
			await MorphHotspot.create({
				ref,
				bg_asset_ref: 'bg',
				label: ref,
				sort: 0,
				x: 0,
				y: 0,
				w: 1,
				h: 1,
				mask_asset_ref: null,
			});
			await Condition.create({
				uuid: `c-${ref}`,
				owner_kind: 'hotspot',
				owner_ref: ref,
				variable_ref: 'v',
				op: 'eq',
				value: '1',
			});
		}

		adapter.clearLog();
		const hotspots = await MorphHotspot.query().with('conditions').get();

		expect(hotspots).toHaveLength(3);
		expect(hotspots.every(h => h.conditions.length === 1)).toBe(true);
		expect(
			adapter.log.filter(e => e.sql.includes('FROM conditions')),
		).toHaveLength(1);
	});

	test('the relation name is a valid with() path', async () => {
		await freshDatabase();
		await seedCollision();

		// Compile-time: morphMany registers like any other relation.
		await MorphHotspot.query().with('conditions').get();
		// @ts-expect-error - not a relation of MorphHotspot.
		MorphHotspot.query().with('conditionz');
	});

	test('changing the owner key invalidates the cached relation', async () => {
		await freshDatabase();
		await seedCollision();

		const [hotspot] = await MorphHotspot.query().with('conditions').get();
		expect(hotspot!.conditions).toHaveLength(1);

		await Condition.create({
			uuid: 'c-window',
			owner_kind: 'hotspot',
			owner_ref: 'window',
			variable_ref: 'v',
			op: 'eq',
			value: '1',
		});

		hotspot!.ref = 'window';
		await hotspot!.save();

		expect(hotspot!.conditions.map(c => c.uuid)).toEqual(['c-window']);
	});
});

describe('hasMany on a shared child table', () => {
	test('demonstrates why morphMany exists', async () => {
		await freshDatabase();

		class LooseHotspot extends Model<LooseHotspot> {
			static config = {
				table: 'hotspots',
				primaryKey: 'ref',
				timestamps: false,
			};
			ref!: string;
			conditions!: Condition[];
			static readonly relationships = {
				conditions: this.hasMany(Condition, 'owner_ref', 'ref'),
			};
		}

		await seedCollision();

		const [loose] = await LooseHotspot.query().with('conditions').get();
		// Without the discriminator, the route's condition leaks in.
		expect(loose!.conditions.map(c => c.uuid).sort()).toEqual([
			'c-hotspot',
			'c-route',
		]);
	});
});
