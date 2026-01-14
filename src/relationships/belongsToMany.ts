/**
 * BelongsToMany Relationship
 *
 * Represents a many-to-many relationship through a pivot table.
 */

import { Relationship } from './relationship';
import { QueryBuilder } from '../query-builder';
import type { Model, ModelConstructor } from '../model';
import { ORM } from '../orm';

export class BelongsToMany<T extends Model<T>> extends Relationship<T> {
	private pivotTable: string;
	private foreignPivotKey: string;
	private relatedPivotKey: string;
	private parentKey: string;
	private relatedKey: string;

	constructor(
		parent: ModelConstructor<any> | Model<any>,
		related: ModelConstructor<T>,
		pivotTable: string,
		foreignPivotKey?: string,
		relatedPivotKey?: string,
		parentKey?: string,
		relatedKey?: string,
	) {
		// Call parent with dummy values - we override the behavior
		super(parent, related, foreignPivotKey, parentKey);

		this.pivotTable = pivotTable;

		// Auto-infer foreignPivotKey from parent model name
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

		// Auto-infer relatedPivotKey from related model name
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

		// Relationships don't support composite primary keys - use first key
		this.parentKey = Array.isArray(parentPk) ? parentPk[0]! : parentPk;
		this.relatedKey = Array.isArray(relatedPk) ? relatedPk[0]! : relatedPk;
	}

	/**
	 * Get all related models for a parent instance
	 * Uses a JOIN to connect through the pivot table
	 *
	 * Example SQL:
	 * SELECT roles.* FROM roles
	 * INNER JOIN user_roles ON roles.id = user_roles.role_id
	 * WHERE user_roles.user_id = ?
	 */
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

		// Filter by parent value in the pivot table
		query.where(
			`${this.pivotTable}.${this.foreignPivotKey}`,
			parentKeyValue,
		);

		return query.get();
	}

	async eagerLoadFor(
		models: Model<any>[],
		relationName: string,
	): Promise<void> {
		// Collect all parent key values
		const parentValues = models.map(
			model => (model as any)[this.parentKey],
		);

		// Skip if all parent key values are null/undefined
		const hasNonNullValue = parentValues.some(val => val != null);
		if (!hasNonNullValue) {
			for (const model of models) {
				(model as any)[`_${relationName}`] = [];
			}
			return;
		}

		// Deduplicate IDs
		const uniqueParentValues = [
			...new Set(parentValues.filter(v => v != null)),
		];

		const orm = ORM.getInstance();
		const dialect = orm.getDialect();
		const adapter = orm.getAdapter();

		const pivotQuery = dialect.compileSelect({
			table: this.pivotTable,
			wheres: [
				{
					type: 'basic',
					column: this.foreignPivotKey,
					operator: 'IN',
					value: uniqueParentValues,
				},
			],
			orders: [],
		});

		const pivotRows = await adapter.query(
			pivotQuery.sql,
			pivotQuery.bindings,
		);

		if (pivotRows.length === 0) {
			for (const model of models) {
				(model as any)[relationName] = [];
			}
			return;
		}

		const relatedIds = [
			...new Set(pivotRows.map((row: any) => row[this.relatedPivotKey])),
		];

		const tableName = (this.related as any).getTableName();
		const query = new QueryBuilder(this.related, tableName);

		const relatedModels = await query
			.where(this.relatedKey, 'IN', relatedIds)
			.get();

		// Create a map of related models by their key
		const relatedMap = new Map<any, T>();
		for (const related of relatedModels) {
			const key = (related as any)[this.relatedKey];
			relatedMap.set(key, related);
		}

		// Group related models by parent using pivot table
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

		// Attach related models to parents using _relationshipName pattern
		// This allows getWithSuspense() to access loaded data
		for (const model of models) {
			const parentValue = (model as any)[this.parentKey];
			const related = parentRelatedMap.get(parentValue) || [];
			(model as any)[`_${relationName}`] = related;
		}
	}
}
