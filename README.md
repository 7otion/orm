# @7otion/orm

A small, database-agnostic Active Record ORM for TypeScript. Built for Tauri +
SQLite, but the database is reached through an adapter and a dialect, so
nothing in the core is SQLite-specific.

- **Typed end to end** — `User.find(1)` returns `Promise<User | null>`, and
  `with('posts.comments')` is checked against the model's declared relations.
- **Relationships** — hasOne, hasMany, belongsTo, belongsToMany, morphTo,
  morphMany, with eager loading and nested paths.
- **Column casts** — `boolean`, `json` and `date` built in, or write your own.
- **Dirty tracking** — updates write only the columns that changed.
- **Model events** — hooks that run inside a write and listeners that run after
  it commits, on every write path including the bulk ones.
- **Transactions** — on adapters that support them; nested calls pass the handle.
- **Write queue** — serialises writes for databases that need it.

## Install

```bash
bun add @7otion/orm
```

`@tauri-apps/plugin-sql` is an optional peer dependency, needed only for the
bundled `TauriAdapter`.

## Setup

`ORM.initialize` is synchronous, but an adapter may need connecting first:

```ts
import { ORM, Tauri7otionSqliteAdapter, SQLiteDialect } from '@7otion/orm';

const adapter = new Tauri7otionSqliteAdapter({ database: 'app.sqlite' });
await adapter.initialize();

ORM.initialize({
	adapter,
	dialect: new SQLiteDialect(),
	enableWriteQueue: true, // recommended for SQLite
});
```

`Tauri7otionSqliteAdapter` runs transactions. The bundled `TauriAdapter` over
`@tauri-apps/plugin-sql` does not, because that plugin pools connections. See
[Adapters](docs/adapters.md) for both, and for writing your own.

## A tour

```ts
import { Model, type ModelHooks } from '@7otion/orm';

class Post extends Model<Post> {
	static config = { table: 'posts', timestamps: true };

	id!: number;
	title!: string;
	published!: boolean;

	author!: User | null;
	comments!: Comment[];

	static readonly relationships = {
		author: this.belongsTo(User),
		comments: this.hasMany(Comment),
	};

	static readonly hooks: ModelHooks<Post> = {
		deleting: async (batch, tx) => {
			await Comment.query()
				.whereIn(
					'post_id',
					batch.models.map(p => p.id),
				)
				.delete(tx);
		},
	};
}

const post = await Post.create({ title: 'Hello', published: false });

post.title = 'Hello, world';
await post.save(); // UPDATE, only `title`

await Post.query()
	.where('published', true)
	.with('author', 'comments')
	.orderBy('created_at', 'desc')
	.limit(10)
	.get();

await Post.query().where('published', false).delete(); // fires `deleting`

await ORM.getInstance().transaction(async tx => {
	await Post.create({ title: 'A' }, tx);
	await Post.create({ title: 'B' }, tx);
});

const off = Post.on('saved', batch => store.upsert(batch.models));
```

## Documentation

- [Models](docs/models.md) — declaring a model, `static config`.
- [Querying](docs/querying.md) — where, grouping, aggregates, raw expressions.
- [Writing](docs/writing.md) — save, create, bulk writes, mass assignment,
  dirty tracking, timestamps.
- [Casts](docs/casts.md) — built-in and custom column casts.
- [Relationships](docs/relationships.md) — declaring, loading, polymorphic
  relations, `sync()`, `refresh()`.
- [Model events](docs/events.md) — hooks, listeners, the batch, cascades.
- [Transactions](docs/transactions.md) — the handle, the write queue, failure
  behaviour.
- [Adapters and dialects](docs/adapters.md) — the bundled adapters, and
  targeting another driver or SQL flavour.

## Notes and limits

- **No result caching.** Queries go straight to the adapter.
- **One adapter at a time.** A `TransactionalAdapter` must also reach a single
  connection; see [Adapters](docs/adapters.md).
- **Relations do not support composite keys** — the first key column is used.
- **`Object.assign` bypasses `fillable`/`guarded`** and can write internal
  state. Use `fill()` for anything you did not construct yourself.
- **Model classes are the query entry point.** There is no repository layer;
  `User.query()` is fully typed on its own.

## License

MIT
