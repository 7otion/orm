/** Many-to-many through a pivot table. */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model, ModelClassRef, ModelStatic } from '../model';
import type { DatabaseRow } from '../types';
import {
	assertIdentifier,
	dynamicWhere,
	getAttribute,
	isRelationLoaded,
	setRelation,
} from '../internal';

export class BelongsToMany<
	T extends Model<T>,
	TClass = unknown,
> extends Relationship<T, TClass> {
	private pivotTable: string;
	private foreignPivotKey: string;
	private relatedPivotKey: string;
	private parentKey: string;
	private relatedKey: string;

	constructor(
		parent: ModelClassRef | Model<any>,
		related: ModelStatic<T>,
		pivotTable: string,
		foreignPivotKey?: string,
		relatedPivotKey?: string,
		parentKey?: string,
		relatedKey?: string,
	) {
		super(parent, related, foreignPivotKey, parentKey);

		this.pivotTable = assertIdentifier(pivotTable, 'pivot table');

		if (!foreignPivotKey) {
			const parentName = this.parentConstructor.name
				.replace(/Model$/, '')
				.replace(/([A-Z])/g, '_$1')
				.toLowerCase()
				.replace(/^_/, '');
			this.foreignPivotKey = `${parentName}_id`;
		} else {
			this.foreignPivotKey = foreignPivotKey;
		}

		if (!relatedPivotKey) {
			const relatedName = related.name
				.replace(/Model$/, '')
				.replace(/([A-Z])/g, '_$1')
				.toLowerCase()
				.replace(/^_/, '');
			this.relatedPivotKey = `${relatedName}_id`;
		} else {
			this.relatedPivotKey = relatedPivotKey;
		}

		const parentPk =
			parentKey || this.parentConstructor.config?.primaryKey || 'id';
		const relatedPk = relatedKey || related.config?.primaryKey || 'id';

		this.parentKey = Array.isArray(parentPk) ? parentPk[0]! : parentPk;
		this.relatedKey = Array.isArray(relatedPk) ? relatedPk[0]! : relatedPk;
	}

	getOwnerFields(): string[] {
		return [this.parentKey];
	}

	/** Joins through the pivot table. */
	async get(parent: Model<any>): Promise<T[]> {
		const relatedTable = this.related.getTableName();
		const parentKeyValue = this.getParentKeyValue(parent);

		const query = new QueryBuilder(this.related, relatedTable);
		query.innerJoin(
			this.pivotTable,
			`${relatedTable}.${this.relatedKey}`,
			'=',
			`${this.pivotTable}.${this.relatedPivotKey}`,
		);

		dynamicWhere(query).where(
			`${this.pivotTable}.${this.foreignPivotKey}`,
			parentKeyValue,
		);

		return query.get();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		if (models.every(m => isRelationLoaded(m, relationName))) return;

		const parentValues = models.map(model =>
			getAttribute(model, this.parentKey),
		);

		const hasNonNullValue = parentValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
				if (isRelationLoaded(model, relationName)) continue;
				setRelation(model, relationName, []);
			}
			return;
		}

		const uniqueParentValues = [
			...new Set(parentValues.filter(v => v != null)),
		];

		// Through the builder, so the pivot's names are identifier-checked too.
		const pivotRows = await dynamicWhere(
			new QueryBuilder<T>(this.related, this.pivotTable),
		)
			.where(this.foreignPivotKey, 'IN', uniqueParentValues)
			.aggregate<DatabaseRow>();

		if (pivotRows.length === 0) {
			for (const model of models) {
				if (isRelationLoaded(model, relationName)) continue;
				setRelation(model, relationName, []);
			}
			return;
		}

		const relatedIds = [
			...new Set(pivotRows.map((row: any) => row[this.relatedPivotKey])),
		];

		const tableName = this.related.getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await dynamicWhere(query)
			.where(this.relatedKey, 'IN', relatedIds)
			.get();

		const relatedMap = new Map<any, T>();
		for (const related of relatedModels) {
			const key = getAttribute(related, this.relatedKey);
			relatedMap.set(key, related);
		}

		const parentRelatedMap = new Map<any, T[]>();
		for (const pivotRow of pivotRows) {
			const parentValue = pivotRow[this.foreignPivotKey];
			const relatedValue = pivotRow[this.relatedPivotKey];
			const relatedModel = relatedMap.get(relatedValue);

			if (relatedModel) {
				if (!parentRelatedMap.has(parentValue)) {
					parentRelatedMap.set(parentValue, []);
				}
				parentRelatedMap.get(parentValue)!.push(relatedModel);
			}
		}

		// Partial-load guard, as in HasMany.
		for (const model of models) {
			if (isRelationLoaded(model, relationName)) continue;
			const parentValue = getAttribute(model, this.parentKey);
			const related = parentRelatedMap.get(parentValue) || [];
			setRelation(model, relationName, related);
		}
	}
}
