# Reading

```ts
await User.find(1); // User | null
await User.find(['tenant-a', 'u-1']); // composite key
await User.all(); // User[]

await User.query()
	.where('status', 'active')
	.where('age', '>', 18)
	.whereIn('role', ['admin', 'editor'])
	.orderBy('created_at', 'desc')
	.limit(10)
	.offset(20)
	.get();

await User.query().where('email', 'a@b.c').first(); // User | null
await User.query().where('email', 'a@b.c').exists(); // boolean
await User.query().paginate(2, 20); // { data, total }

await User.query().where('status', 'active').count(); // number
await User.query().pluck('email'); // string[]
await User.query().value('email'); // string | null

await User.query().sum('age'); // number — 0 when nothing matches
await User.query().avg('age'); // number | null
await User.query().min('created_at'); // Date | null
await User.query().max('age'); // number | null
```

`count()` asks how many rows match without building any. `pluck()` returns one
column across every matching row, cast the way `get()` casts it — a `date`
column comes back as `Date`. `value()` is the first of those, or `null`, and
`min()` / `max()` cast the same way.

Limit, offset and order do not apply to an aggregate: `.limit(5).sum('age')`
sums every matching row, not five.

`exists()` compiles to `SELECT 1 … LIMIT 1` and never builds a model, so it is
the cheap way to ask a yes/no question that `first() !== null` answers by
hydrating a row.

A builder is mutable: each chained method adds to the builder it is called on,
and terminal methods leave it unchanged, so it can be run more than once. To
branch one base query into several, copy it with `clone()`:

```ts
const active = User.query().where('status', 'active');

await active.clone().where('role', 'admin').get();
await active.clone().orderBy('name').get();
await active.get(); // still just status = active
```

`where()` takes either `(column, value)` or `(column, operator, value)`.
Operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `IN`, `NOT IN`, `IS`,
`IS NOT`.

## OR and grouping

`orWhere`, `orWhereIn` and `orWhereRaw` join with `OR` instead of `AND`. Passing
a callback nests its conditions in one parenthesised group:

```ts
await User.query()
	.where('status', 'active')
	.where(q => q.where('age', '>', 65).orWhere('role', 'admin'))
	.get();
// WHERE "status" = ? AND ("age" > ? OR "role" = ?)
```

`whereNot` and `orWhereNot` negate what follows — a single condition, or a whole
group when given a callback:

```ts
User.query().where('status', 'active').whereNot('role', 'admin');
// WHERE "status" = ? AND NOT "role" = ?

User.query().whereNot(q => q.where('status', 'active').where('age', '>', 65));
// WHERE NOT ("status" = ? AND "age" > ?)
```

A flat chain is emitted as written, and SQL binds `AND` tighter than `OR`:

```ts
User.query().where('a', 1).where('b', 2).orWhere('c', 3);
// WHERE "a" = ? AND "b" = ? OR "c" = ?   →  reads as (a AND b) OR c
```

Nothing is parenthesised on your behalf, so reach for the callback form when
you mean something else.

## Grouping and aggregates

`groupBy()` turns the rows into grouped rows, which are no longer rows of the
model. `aggregate()` reads them as-is; `get()`, `first()`, `paginate()`,
`with()`, `update()` and `delete()` are unavailable on a grouped query, and the
compiler says so:

```ts
const counts = await Fragment.query()
	.selectRaw('schema_ref, COUNT(*) AS n')
	.groupBy('schema_ref')
	.havingRaw('COUNT(*) > ?', [1])
	.aggregate<{ schema_ref: string; n: number }>();
// SELECT schema_ref, COUNT(*) AS n FROM fragments
//   GROUP BY "schema_ref" HAVING COUNT(*) > ?

await Fragment.query().groupBy('schema_ref').get();
// Error: a grouped row is not a Fragment; use aggregate().
```

`having()` takes a model column like `where()` does; `havingRaw()` takes the
aggregate expressions `HAVING` is usually written against. Neither requires
`groupBy()` — `HAVING` over an ungrouped query treats the table as one group.

The `having` family mirrors `where`: `orHaving`, `havingNot`, `orHavingNot`,
`orHavingRaw`, and a callback for one parenthesised group.

`aggregate()` returns whatever the adapter returned, typed by its parameter. It
never hydrates, so nothing arrives wearing a model's type without a model's
columns.

## Identifiers vs expressions

Values are always bound as parameters. Column and table names are interpolated
into SQL, so they must be plain names — anything else is rejected:

```ts
User.query().where('LOWER(name)', 'ann');
// Error: [orm] Unsafe column: "LOWER(name)".

User.query().whereRaw('LOWER(name) = ?', ['ann']); // ✓
```

`whereRaw`, `orWhereRaw`, `orderByRaw` and `selectRaw` pass SQL through
untouched. Never build them from user input.
