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
- **Transactions** — nested calls collapse into the outermost one.
- **Write queue** — serialises writes for databases that need it.

## Install

```bash
bun add @7otion/orm
```

`@tauri-apps/plugin-sql` is an optional peer dependency, needed only for the
bundled `TauriAdapter`.

## Setup

`ORM.initialize` is synchronous, but an adapter may need connecting first —
`TauriAdapter` does:

```ts
import { ORM, TauriAdapter, SQLiteDialect } from '@7otion/orm';

const adapter = new TauriAdapter({
  database: 'sqlite:myapp.db',
  debug: true,          // log every statement
});
await adapter.initialize();

ORM.initialize({
  adapter,
  dialect: new SQLiteDialect(),
  enableWriteQueue: true,   // recommended for SQLite
});
```

Use `ORM.reInitialize(config)` to swap databases at runtime; it closes the
previous connection first.

## Defining models

```ts
import { Model } from '@7otion/orm';

class User extends Model<User> {
  static config = {
    table: 'users',        // optional — derived from the class name otherwise
    primaryKey: 'id',      // optional — 'id' by default
    timestamps: true,
  };

  id!: number;
  name!: string;
  email!: string;
}
```

Column declarations are type-only. Values live in an internal attribute store
and are reached through a Proxy, so `user.name` reads the stored column rather
than the (never assigned) class field.

### `static config`

| key | default | notes |
|---|---|---|
| `table` | derived from class name | `User` → `users`, `BlogPost` → `blog_posts`, `Category` → `categories` |
| `primaryKey` | `'id'` | a `string[]` declares a composite key |
| `timestamps` | see below | `true`, or `{ created_at, updated_at }` to rename the columns |
| `casts` | — | column ⇄ logical value conversion — see [Casts](#casts) |
| `fillable` | — | allow-list for `create()` / `fill()` |
| `guarded` | — | deny-list for `create()` / `fill()` |

> **Timestamps gotcha.** The base class defaults to `timestamps: true`, but a
> subclass that declares `static config` **without** a `timestamps` key turns
> them off. Set it explicitly whenever you declare a config.

## Reading

```ts
await User.find(1);                    // User | null
await User.find(['tenant-a', 'u-1']);  // composite key
await User.all();                      // User[]

await User.query()
  .where('status', 'active')
  .where('age', '>', 18)
  .whereIn('role', ['admin', 'editor'])
  .orderBy('created_at', 'desc')
  .limit(10)
  .offset(20)
  .get();

await User.query().where('email', 'a@b.c').first();   // User | null
await User.query().paginate(2, 20);                   // { data, total }
```

`where()` takes either `(column, value)` or `(column, operator, value)`.
Operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `IN`, `NOT IN`, `IS`,
`IS NOT`.

### Identifiers vs expressions

Values are always bound as parameters. Column and table names are interpolated
into SQL, so they must be plain names — anything else is rejected:

```ts
User.query().where('LOWER(name)', 'ann');
// Error: [orm] Unsafe column: "LOWER(name)".

User.query().whereRaw('LOWER(name) = ?', ['ann']);   // ✓
```

`whereRaw`, `orderByRaw` and `selectRaw` pass SQL through untouched. Never
build them from user input.

## Writing

```ts
const user = new User();
user.name = 'John';
await user.save();              // INSERT

user.name = 'Jane';
await user.save();              // UPDATE — only the `name` column

await user.delete();
```

`create()` combines the two:

```ts
const user = await User.create({ name: 'John', email: 'john@example.com' });
```

A supplied primary key is kept as-is; only an omitted one adopts the value the
database generated. UUID and slug-style keys are safe to assign yourself.

### Bulk updates and deletes

```ts
await User.query().where('status', 'inactive').delete();            // → count
await User.query().where('is_player', 1).update({ is_player: 0 });  // → count
```

### Mass assignment

`create()` and `fill()` respect `fillable` / `guarded` and never write
ORM-internal keys, which makes them safe for request bodies. Plain
`Object.assign(model, data)` does neither — don't use it with untrusted input.

```ts
class User extends Model<User> {
  static config = { fillable: ['name', 'email'] };
}

await User.create({ name: 'Eve', role: 'admin' });   // `role` ignored
existing.fill(req.body);
```

A model declaring neither `fillable` nor `guarded` accepts every column.

### Dirty tracking

```ts
user.name = 'Jane';
user.isDirty;      // true
user.getDirty();   // ['name']
user.getChanges(); // { name: { old: 'John', new: 'Jane' } }
```

### Timestamps

With timestamps enabled, `created_at` and `updated_at` are stored as unix
seconds and read back as `Date` — they are ordinary [`date` cast](#casts)
columns the ORM populates itself, not a separate mechanism:

```ts
user.created_at;   // Date
user.updated_at;   // Date
```

They belong to the ORM, not the caller. `created_at` is set once at insert,
`updated_at` is refreshed on every update, and neither is ever taken from
supplied data. Assigning one throws:

```ts
user.created_at = new Date();
// Error: [orm] User.created_at is a timestamp, which the ORM maintains: it is
// set on insert and refreshed on every update. It cannot be assigned.
```

`create()`, `fill()` and `query().update()` drop a supplied timestamp silently,
the same way `guarded` columns are — so round-tripping a whole row back through
`fill()` still works.

## Casts

SQLite stores no booleans, structured values or dates. `casts` declares a
column's logical shape once, and the ORM converts in both directions — on
hydration, on write, and when comparing for dirty tracking:

```ts
class Task extends Model<Task> {
  static config = {
    timestamps: true,
    casts: {
      is_done:  'boolean',   // stored 0/1
      metadata: 'json',      // stored as text
      due_at:   'date',      // stored as unix seconds
    } as const,
  };

  is_done!: boolean;
  metadata!: { tags: string[] } | null;
  due_at!: Date | null;
}

const task = (await Task.find(1))!;
task.is_done;          // true, not 1
task.metadata!.tags;   // string[], already parsed
task.due_at;           // Date
```

`as const` is required — without it TypeScript widens `'boolean'` to `string`.

Casts apply on every path: hydration, `save()`, `create()`, `fill()` and
`query().update()`.

### Object values and dirty tracking

`json` and `date` produce objects, so the snapshot compared against is a
detached copy — an edit in place is still detected:

```ts
task.metadata!.tags.push('urgent');
task.isDirty;   // true

task.due_at!.setUTCFullYear(2031);
task.isDirty;   // true
```

### Custom casts

Anything implementing `ColumnCast` can go wherever a built-in name goes. The
built-ins are themselves `ColumnCast` objects, so there is one mechanism rather
than a separate path for each:

```ts
import { Model, type ColumnCast } from '@7otion/orm';

class Money {
  constructor(readonly cents: number) {}
  get dollars() { return this.cents / 100; }
}

const MoneyCast: ColumnCast<Money, number> = {
  fromDatabase: cents => new Money(cents),
  toDatabase:   money => money.cents,
  equals:       (a, b) => a.cents === b.cents,     // optional
  clone:        money => new Money(money.cents),   // optional
};

class Product extends Model<Product> {
  static config = { casts: { price: MoneyCast } as const };
  price!: Money;
}
```

| member | required | purpose |
|---|---|---|
| `fromDatabase(value, column)` | yes | stored → logical. Never called for `null` / `undefined`. |
| `toDatabase(value, column)` | yes | logical → stored. Never called for `null` / `undefined`. |
| `clone(value)` | no | detach the value for the dirty-tracking snapshot. Defaults to `structuredClone`. |
| `equals(a, b)` | no | value comparison for dirty tracking. Defaults to a structural compare. |

`clone` and `equals` are consulted only for object values — primitives copy and
compare correctly on their own. Supply `clone` when the logical value is a class
instance, since `structuredClone` would drop its prototype.

`BooleanCast`, `JsonCast` and `DateCast` are exported if you want to reference
one directly or wrap it.

## Relationships

Declare the property for TypeScript, then register the relation:

```ts
import { Model } from '@7otion/orm';

class User extends Model<User> {
  posts!: Post[];
  profile!: Profile | null;
  roles!: Role[];

  static readonly relationships = {
    posts:   this.hasMany(Post),                    // foreign key: user_id
    profile: this.hasOne(Profile),                  // foreign key: user_id
    roles:   this.belongsToMany(Role, 'user_roles'),
  };
}
```

Keys are inferred from class names when omitted, and can always be given
explicitly:

| factory | signature |
|---|---|
| `hasOne` | `(related, foreignKey?, localKey?)` |
| `hasMany` | `(related, foreignKey?, localKey?)` |
| `belongsTo` | `(related, foreignKey?, localKey?)` |
| `belongsToMany` | `(related, pivotTable, foreignPivotKey?, relatedPivotKey?, parentKey?, relatedKey?)` |
| `morphMany` | `(related, config)` |
| `morphTo` | `(config)` |

Declare `relationships` as a plain object literal — **not** annotated
`Record<string, any>`. The literal is what lets `with()` know the valid names.

### Circular imports

When two model files reference each other, pass a thunk. Thunks require
explicit keys, because inference would otherwise read a class that does not
exist yet:

```ts
static readonly relationships = {
  lines: this.hasMany(() => Line, 'passage_ref', 'ref'),
};
```

### Loading

```ts
const users = await User.query().with('posts', 'profile').get();

// nested, any depth
await Post.query().with('author.profile', 'comments.author').get();

// lazily, on an instance
await user.load('posts');
```

Relation names — including dotted paths — are checked against the model's
`relationships` literal:

```ts
User.query().with('postz');          // compile error
User.query().with('posts.commentz'); // compile error
```

Eager loading is batched: one query per relation, regardless of how many
parents. Accessing an unloaded relation triggers a lazy load and throws a
promise, which works under React Suspense but is otherwise best avoided —
prefer `with()` or `load()`.

Assigning a relation writes to its backing field, not to the column set, so
sorting loaded children and writing them back is safe:

```ts
passage.lines = [...passage.lines].sort(bySort);
passage.isDirty;   // false
```

### Polymorphic relations

`morphTo` — this model points at one of several types:

```ts
class Attachment extends Model<Attachment> {
  static readonly relationships = {
    target: this.morphTo({
      discriminatorField: 'target_kind',
      foreignKeyField:    'target_id',
      morphMap: { post: Post, video: Video },
    }),
  };
}
```

`morphMany` — the inverse: children in a table shared by several owner types.
A plain `hasMany` would match on the foreign key alone and collect another
owner's rows whenever key values collide:

```ts
class Hotspot extends Model<Hotspot> {
  conditions!: Condition[];

  static readonly relationships = {
    conditions: this.morphMany(Condition, {
      discriminatorField: 'owner_kind',
      discriminatorValue: 'hotspot',
      foreignKey:         'owner_ref',
      localKey:           'ref',
    }),
  };
}
```

### Refreshing

```ts
await user.refresh();               // reloads columns + whatever was eager-loaded
await user.refresh(['posts']);      // reload only these paths
```

Relations are also invalidated automatically when a column they key off
changes.

## Transactions

`transaction` is an instance method:

```ts
await ORM.getInstance().transaction(async () => {
  const user = await User.create({ name: 'John' });
  await Post.create({ user_id: user.id, title: 'Hello' });
});
```

Commits on success, rolls back on throw, and returns the callback's value.
Nested calls join the outermost transaction — only it commits.

## Adapters

Implement `DatabaseAdapter` to target another driver:

```ts
import type { DatabaseAdapter, DatabaseRow, QueryValue } from '@7otion/orm';

export class MyAdapter implements DatabaseAdapter {
  async query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]> { /* … */ }
  async execute(sql: string, params?: QueryValue[]): Promise<number> { /* affected rows */ }
  async insert(sql: string, params?: QueryValue[]): Promise<number> { /* new row id */ }
  async beginTransaction(): Promise<void> { /* … */ }
  async commit(): Promise<void> { /* … */ }
  async rollback(): Promise<void> { /* … */ }
  inTransaction(): boolean { /* … */ }
  async close(): Promise<void> { /* … */ }
}
```

`insert()` must return the generated row id — that is what an omitted primary
key adopts.

## Dialects

Implement `SqlDialect` to target another SQL flavour. `SQLiteDialect` ships
with the package.

| method | required for |
|---|---|
| `compileSelect` | reads |
| `compileInsert` | `save()` on a new model |
| `compileUpdate` | `save()` on an existing model |
| `compileDelete` | `model.delete()` |
| `compileCount` | `paginate()` |
| `compileDeleteQuery` | `QueryBuilder.delete()` |
| `compileUpdateQuery` | `QueryBuilder.update()` |

Dialects generate SQL and never execute it. Bind every value; only identifiers
belong in the statement text.

## Notes and limits

- **No result caching.** Queries go straight to the adapter.
- **No connection pooling or multi-connection support.** One adapter at a time.
- **Relations do not support composite keys** — the first key column is used.
- **`Object.assign` bypasses `fillable`/`guarded`** and can write internal
  state. Use `fill()` for anything you did not construct yourself.
- **Model classes are the query entry point.** There is no repository layer;
  `User.query()` is fully typed on its own.

## License

MIT
