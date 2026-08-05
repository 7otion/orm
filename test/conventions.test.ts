/**
 * Naming conventions, config defaults, and custom statics.
 */

import { describe, expect, test } from 'bun:test';

import { Model } from '../src/model';

import { Category, Character, Line, Passage, User } from './helpers/models';
import { freshDatabase } from './helpers/setup';

describe('table name derivation', () => {
	test('an explicit table config wins', () => {
		expect(Line.getTableName()).toBe('lines');
		expect(Character.getTableName()).toBe('characters');
	});

	test('a plain class name is pluralised with s', () => {
		class Widget extends Model<Widget> {}
		expect(Widget.getTableName()).toBe('widgets');
	});

	test('a CamelCase class name becomes snake_case', () => {
		class BlogPost extends Model<BlogPost> {}
		expect(BlogPost.getTableName()).toBe('blog_posts');
	});

	test('a name ending in y becomes ies', () => {
		expect(Category.getTableName()).toBe('categories');
	});

	test('a name already ending in s takes es', () => {
		class Status extends Model<Status> {}
		expect(Status.getTableName()).toBe('statuses');
	});

	test('the derived name is cached per class, not shared', () => {
		class Alpha extends Model<Alpha> {}
		class Beta extends Model<Beta> {}

		expect(Alpha.getTableName()).toBe('alphas');
		expect(Beta.getTableName()).toBe('betas');
		expect(Alpha.getTableName()).toBe('alphas');
	});
});

describe('config defaults', () => {
	test('primaryKey defaults to id', async () => {
		const { adapter } = await freshDatabase();

		await Category.create({ name: 'Fiction' });
		const category = await Category.query().first();
		category!.name = 'Non-fiction';
		adapter.clearLog();
		await category!.save();

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).toContain('WHERE "id" = ?');
	});

	test('an explicit primaryKey is used for writes', async () => {
		const { adapter } = await freshDatabase();

		const passage = await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});
		passage.title = 'Changed';
		adapter.clearLog();
		await passage.save();

		const update = adapter.log.find(e => e.sql.startsWith('UPDATE'))!;
		expect(update.sql).toContain('WHERE "ref" = ?');
	});

	test('a subclass does not inherit another model’s relationships', () => {
		// Static relationships are declared per class; the WeakMap cache in
		// Model must not leak one class's map into another's.
		expect(Object.keys(Passage.relationships).sort()).toEqual([
			'choices',
			'lines',
		]);
		expect(Object.keys(Line.relationships)).toEqual(['routes']);
		expect(Object.keys(Character.relationships).sort()).toEqual([
			'assets',
			'fragments',
			'tags',
		]);
	});

	test('a model with no relationships reports an empty map', () => {
		class Bare extends Model<Bare> {}
		expect(Bare.relationships).toEqual({});
	});
});

describe('generateSlug', () => {
	test('lowercases and hyphenates', () => {
		expect(Model.generateSlug('Hello World')).toBe('hello-world');
	});

	test('strips punctuation and collapses separators', () => {
		expect(Model.generateSlug('A -- B!!  C')).toBe('a-b-c');
	});

	test('trims leading and trailing hyphens', () => {
		expect(Model.generateSlug('  !Hello!  ')).toBe('hello');
	});
});

describe('custom statics', () => {
	test('a subclass static can build a typed query via `this`', async () => {
		await freshDatabase();

		class Widget extends Model<Widget> {
			static config = { table: 'roles', timestamps: false };
			id!: number;
			name!: string;

			// `this.query()` inside a subclass static must bind to Widget, not
			// to the abstract base — otherwise this would not compile.
			static async named(name: string): Promise<Widget | null> {
				return this.query().where('name', name).first();
			}
		}

		await Widget.create({ name: 'admin' });

		const found = await Widget.named('admin');
		expect(found!.name).toBe('admin');
	});

	test('a subclass static sees its own class as `this`', async () => {
		await freshDatabase();

		class Widget extends Model<Widget> {
			static config = { table: 'roles', timestamps: false };
			static whoAmI(): string {
				return this.getTableName();
			}
		}

		expect(Widget.whoAmI()).toBe('roles');
	});

	test('statics and instance writes see the same rows', async () => {
		await freshDatabase();

		const user = await User.create({ name: 'Ann' });
		user.status = 'active';
		await user.save();

		const reloaded = await User.find(user.id);
		expect(reloaded!.status).toBe('active');
	});

	test('the standard static surface round-trips', async () => {
		await freshDatabase();

		await Passage.create({
			ref: 'intro',
			title: 'Intro',
			status: 'draft',
			sort: 0,
			auto_continue: 0,
			allow_back: 0,
		});

		expect(await Passage.all()).toHaveLength(1);
		expect((await Passage.find('intro'))!.title).toBe('Intro');
		expect(
			await Passage.query().where('ref', 'intro').first(),
		).not.toBeNull();
	});
});
