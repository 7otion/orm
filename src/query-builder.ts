/** Builds a QueryStructure for a SqlDialect to compile. Generates no SQL. */

import type {
	DatabaseRow,
	OrderDirection,
	QueryStructure,
	QueryValue,
	WhereValue,
	WhereCondition,
	WhereOperator,
} from './types';
import type { Model, ModelStatic } from './model';
import { ORM } from './orm';
import { findRelationship, getRelation } from './internal';
import type { AnyRelations, RelationPath } from './relation-paths';

export class QueryBuilder<T extends Model<T>, TRelations = AnyRelations> {
	private query: QueryStructure;
	// Only used to construct instances, so the minimal class type suffices.
	private modelClass: ModelStatic<T>;
	private eagerLoad = new Set<string>();

	private relationshipConstraint?: (
		query: QueryBuilder<T, TRelations>,
	) => void;

	constructor(modelClass: ModelStatic<T>, tableName: string) {
		this.modelClass = modelClass;
		this.query = {
			table: tableName,
			wheres: [],
			orders: [],
		};
	}

	/** Accepts `where(col, value)` or `where(col, operator, value)`. */
	where(
		column: string,
		operatorOrValue: WhereOperator | QueryValue,
		value?: WhereValue,
	): this {
		let operator: WhereOperator;
		let actualValue: WhereValue;

		if (value === undefined) {
			operator = '=';
			actualValue = operatorOrValue;
		} else {
			operator = operatorOrValue as WhereOperator;
			actualValue = value;
		}

		const condition: WhereCondition = {
			type: 'basic',
			column: String(column),
			operator,
			value: actualValue,
		};

		this.query.wheres.push(condition);
		return this;
	}

	whereRaw(sql: string, bindings: QueryValue[] = []): this {
		const condition: WhereCondition = {
			type: 'raw',
			sql,
			bindings,
		};

		this.query.wheres.push(condition);
		return this;
	}

	whereIn(column: keyof T | string, values: QueryValue[]): this {
		this.query.wheres.push({
			type: 'basic',
			column: String(column),
			operator: 'IN',
			value: values,
		});
		return this;
	}

	join(
		type: 'INNER' | 'LEFT' | 'RIGHT',
		table: string,
		first: string,
		operator: string,
		second: string,
	): this {
		if (!this.query.joins) {
			this.query.joins = [];
		}

		this.query.joins.push({
			type,
			table,
			first,
			operator,
			second,
		});

		return this;
	}

	innerJoin(
		table: string,
		first: string,
		operator: string,
		second: string,
	): this {
		return this.join('INNER', table, first, operator, second);
	}

	leftJoin(
		table: string,
		first: string,
		operator: string,
		second: string,
	): this {
		return this.join('LEFT', table, first, operator, second);
	}

	orderBy(column: string, direction: OrderDirection = 'asc'): this {
		this.query.orders.push({ column, direction });
		return this;
	}

	/** Emitted verbatim, for sorts the builder cannot express. */
	orderByRaw(sql: string): this {
		this.query.orders.push({
			column: sql,
			direction: 'raw',
		});
		return this;
	}

	limit(limit: number): this {
		this.query.limitValue = limit;
		return this;
	}

	offset(offset: number): this {
		this.query.offsetValue = offset;
		return this;
	}

	select(...columns: (keyof T | string)[]): this {
		this.query.columns = columns.map(String);
		return this;
	}

	/** Emitted verbatim, for aggregates and computed columns. */
	selectRaw(sql: string): this {
		this.query.selectRaw = sql;
		return this;
	}

	/**
	 * Eager load relations, including nested dotted paths. Names are checked
	 * against the model's `relationships` literal; models without one accept
	 * any string.
	 */
	with(...relations: RelationPath<TRelations>[]): this {
		for (const relation of relations) {
			this.eagerLoad.add(relation);
		}
		return this;
	}

	private extractTableNames(): string[] {
		const tables = new Set<string>();

		tables.add(this.query.table);
		if (this.query.joins) {
			for (const join of this.query.joins) {
				tables.add(join.table);
			}
		}

		return Array.from(tables);
	}

	setRelationshipConstraint(
		constraint: (query: QueryBuilder<T, TRelations>) => void,
	): this {
		this.relationshipConstraint = constraint;
		return this;
	}

	async get(): Promise<T[]> {
		if (this.relationshipConstraint) {
			this.relationshipConstraint(this);
		}

		const orm = ORM.getInstance();
		const dialect = orm.getDialect();

		const compiled = dialect.compileSelect(this.query);

		const tables = orm.resultCacheAdapter ? this.extractTableNames() : [];
		const rows = await orm.cachedSelect(
			compiled.sql,
			compiled.bindings,
			tables,
		);

		const models = rows.map((row: DatabaseRow) => this.hydrate(row));

		if (this.eagerLoad.size > 0) {
			await this.loadRelationships(models);
		}

		return models;
	}

	async first(): Promise<T | null> {
		this.limit(1);

		const results = await this.get();
		return results.length > 0 ? results[0]! : null;
	}

	async paginate(
		page: number = 1,
		limit: number = 20,
	): Promise<{ data: T[]; total: number }> {
		if (this.relationshipConstraint) {
			this.relationshipConstraint(this);
		}

		const orm = ORM.getInstance();
		const dialect = orm.getDialect();

		const countQuery = { ...this.query };
		const countCompiled = dialect.compileCount(countQuery);
		const countTables = this.extractTableNames();
		const countResult = await orm.cachedSelect(
			countCompiled.sql,
			countCompiled.bindings,
			countTables,
		);
		const total = countResult[0]?.count || 0;

		const offset = (page - 1) * limit;
		this.limit(limit).offset(offset);

		const compiled = dialect.compileSelect(this.query);
		const dataTables = this.extractTableNames();
		const rows = await orm.cachedSelect(
			compiled.sql,
			compiled.bindings,
			dataTables,
		);

		const models = rows.map((row: DatabaseRow) => this.hydrate(row));

		if (this.eagerLoad.size > 0) {
			await this.loadRelationships(models);
		}

		return { data: models, total };
	}

	/** Deletes matching rows in one queued statement, returning the count. */
	async delete(): Promise<number> {
		if (this.relationshipConstraint) {
			this.relationshipConstraint(this);
		}

		const orm = ORM.getInstance();
		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();

			const compiled = dialect.compileDeleteQuery(this.query);

			const affected = await adapter.execute(
				compiled.sql,
				compiled.bindings,
			);

			const tables = this.extractTableNames();
			orm.invalidateResultCache(tables);

			return affected;
		});
	}

	/** Updates matching rows in one queued statement, returning the count. */
	async update(data: Record<string, QueryValue>): Promise<number> {
		if (this.relationshipConstraint) {
			this.relationshipConstraint(this);
		}

		const orm = ORM.getInstance();
		return orm.queueWrite(async () => {
			const dialect = orm.getDialect();
			const adapter = orm.getAdapter();

			const compiled = dialect.compileUpdateQuery(this.query, data);

			const affected = await adapter.execute(
				compiled.sql,
				compiled.bindings,
			);

			const tables = this.extractTableNames();
			orm.invalidateResultCache(tables);

			return affected;
		});
	}

	private hydrate(row: DatabaseRow): T {
		const model = new this.modelClass();

		// Set directly, so the model is not marked dirty.
		model._attributes = { ...row };
		model._original = { ...row };
		model._exists = true;

		return model;
	}

	private async loadRelationships(models: T[]): Promise<void> {
		if (models.length === 0) return;

		const firstModel = models[0];
		const modelConstructor = firstModel!.constructor as unknown as {
			relationships: Record<string, unknown>;
			afterEagerLoad?: (
				paths: Iterable<string>,
				models: T[],
			) => Promise<void>;
		};

		const relationships = modelConstructor.relationships;

		if (!relationships || Object.keys(relationships).length === 0) {
			return;
		}

		for (const relationName of this.eagerLoad.keys()) {
			if (relationName.includes('.')) {
				await this.loadNestedRelationship(
					models,
					relationName,
					relationships,
				);
			} else {
				const relationship = findRelationship(
					relationships,
					relationName,
				);

				if (!relationship) {
					// May still be handled by afterEagerLoad.
					continue;
				}

				if (typeof relationship.eagerLoadFor === 'function') {
					await relationship.eagerLoadFor(models, relationName);
				}
			}
		}

		if (typeof modelConstructor.afterEagerLoad === 'function') {
			await modelConstructor.afterEagerLoad(
				this.eagerLoad.keys(),
				models,
			);
		}

		// Recorded so refresh() can replay them.
		for (const model of models) {
			model._loadedPaths ??= new Set<string>();
			for (const path of this.eagerLoad.keys()) {
				model._loadedPaths.add(path);
			}
		}
	}

	private async loadNestedRelationship(
		models: T[],
		nestedRelation: string,
		relationships: Record<string, any>,
	): Promise<void> {
		const relationParts = nestedRelation.split('.');
		const firstLevelRelation = relationParts[0]!;
		const remainingRelations = relationParts.slice(1).join('.');

		const relationship = findRelationship(
			relationships,
			firstLevelRelation,
		);

		if (!relationship) {
			throw new Error(
				`Relationship '${firstLevelRelation}' not found in static relationships constant`,
			);
		}

		if (typeof relationship.eagerLoadFor === 'function') {
			await relationship.eagerLoadFor(models, firstLevelRelation);
		}

		if (remainingRelations) {
			const relatedModels = this.getRelatedModelsFromLoadedRelationship(
				models,
				firstLevelRelation,
			);

			const validRelatedModels = relatedModels.filter(
				model => model != null,
			);

			if (validRelatedModels.length > 0) {
				await this.loadNestedRelationshipOnRelatedModels(
					validRelatedModels,
					remainingRelations,
					relationship.getRelated(),
				);
			}
		}
	}

	private getRelatedModelsFromLoadedRelationship(
		parentModels: T[],
		relationName: string,
	): any[] {
		const relatedModels: any[] = [];

		for (const parentModel of parentModels) {
			const loadedData = getRelation(parentModel, relationName);

			if (loadedData != null) {
				if (Array.isArray(loadedData)) {
					relatedModels.push(...loadedData);
				} else {
					relatedModels.push(loadedData);
				}
			}
		}

		return relatedModels;
	}

	private async loadNestedRelationshipOnRelatedModels(
		relatedModels: any[],
		remainingRelation: string,
		relatedModelConstructor: any,
	): Promise<void> {
		const relationships = relatedModelConstructor.relationships;

		if (!relationships || Object.keys(relationships).length === 0) {
			return;
		}

		if (remainingRelation.includes('.')) {
			await this.loadNestedRelationship(
				relatedModels,
				remainingRelation,
				relationships,
			);
		} else {
			const relationship = findRelationship(
				relationships,
				remainingRelation,
			);

			if (!relationship) {
				throw new Error(
					`Relationship '${remainingRelation}' not found in ${relatedModelConstructor.name} relationships`,
				);
			}

			if (typeof relationship.eagerLoadFor === 'function') {
				await relationship.eagerLoadFor(
					relatedModels,
					remainingRelation,
				);
			}
		}
	}

	/** @internal Lets relationship classes inspect the pending query. */
	getQuery(): QueryStructure {
		return this.query;
	}
}
