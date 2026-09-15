# Writing

```ts
const user = new User();
user.name = 'John';
await user.save(); // INSERT

user.name = 'Jane';
await user.save(); // UPDATE — only the `name` column

await user.delete();
```

`create()` combines the two:

```ts
const user = await User.create({ name: 'John', email: 'john@example.com' });
```

A supplied primary key is kept as-is; only an omitted one adopts the value the
database generated. UUID and slug-style keys are safe to assign yourself.

## Bulk updates and deletes

```ts
await User.query().where('status', 'inactive').delete(); // → count
await User.query().where('is_player', 1).update({ is_player: 0 }); // → count
```

## Bulk inserts

`createMany()` writes rows in as few statements as the dialect's parameter limit
allows, and returns the models in the order given:

```ts
const tags = await CharacterTag.createMany([
	{ character_ref: 'alice', tag: 'hero' },
	{ character_ref: 'alice', tag: 'mage' },
]); // → CharacterTag[]
```

It fills, stamps timestamps and applies casts per row exactly as `create()`
does. Every model carries its key. A supplied one is kept as-is. A
database-generated one comes back from the same statement through `RETURNING`
and is matched to its row by rowid, since within one statement SQLite assigns
rowids in insertion order. A generated key on a `WITHOUT ROWID` table cannot be
matched and is refused; supply the key there.

Rows are grouped by the columns they set, one statement per group, so a row that
omits a column keeps that column's database default instead of being bound
`NULL`.

## Bulk updates

`updateMany()` writes every model's pending changes in as few statements as the
dialect's parameter limit allows, the way `save()` writes one model's:

```ts
const fragments = await Fragment.query().where('owner_ref', 'alice').get();
fragments.forEach((fragment, sort) => (fragment.sort = sort));

await Fragment.updateMany(fragments); // → the same models, no longer dirty
```

Only dirty columns are written, and only for the models that changed them, so
the models need not have changed the same ones. Models with nothing pending are
skipped. `updated_at` is stamped once for the statement, and rows are located by
their original primary key — so reassigning a key is refused (`save()` that model
on its own), and a row that has been deleted raises rather than silently matching
nothing.

Use this when the values differ per model; when one value applies to everything,
`Model.query().where(…).update({ … })` is the smaller statement.

## Bulk writes and transactions

A `createMany()` or `updateMany()` that fits in one statement runs as that
statement, with no transaction around it. One that the parameter limit splits
into several runs them in one transaction, so they land or fail together. On an
adapter without transactions that is refused before anything is written — split
the rows into calls that each fit one statement.

Pass a transaction's handle to run either inside that transaction instead.

## Mass assignment

`create()` and `fill()` respect `fillable` / `guarded` and never write
ORM-internal keys, which makes them safe for request bodies. Plain
`Object.assign(model, data)` does neither — don't use it with untrusted input.

```ts
class User extends Model<User> {
	static config = { fillable: ['name', 'email'] };
}

await User.create({ name: 'Eve', role: 'admin' }); // `role` ignored
existing.fill(req.body);
```

A model declaring neither `fillable` nor `guarded` accepts every column.

## Dirty tracking

```ts
user.name = 'Jane';
user.isDirty; // true
user.getDirty(); // ['name']
user.getChanges(); // { name: { old: 'John', new: 'Jane' } }
```

## Timestamps

With timestamps enabled, `created_at` and `updated_at` are stored as unix
seconds and read back as `Date` — they are ordinary [`date` cast](casts.md)
columns the ORM populates itself, not a separate mechanism:

```ts
user.created_at; // Date
user.updated_at; // Date
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
