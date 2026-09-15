# Casts

SQLite stores no booleans, structured values or dates. `casts` declares a
column's logical shape once, and the ORM converts in both directions — on
hydration, on write, and when comparing for dirty tracking:

```ts
class Task extends Model<Task> {
	static config = {
		timestamps: true,
		casts: {
			is_done: 'boolean', // stored 0/1
			metadata: 'json', // stored as text
			due_at: 'date', // stored as unix seconds
		} as const,
	};

	is_done!: boolean;
	metadata!: { tags: string[] } | null;
	due_at!: Date | null;
}

const task = (await Task.find(1))!;
task.is_done; // true, not 1
task.metadata!.tags; // string[], already parsed
task.due_at; // Date
```

`as const` is required — without it TypeScript widens `'boolean'` to `string`.

Casts apply on every path: hydration, `save()`, `create()`, `fill()` and
`query().update()`.

## Object values and dirty tracking

`json` and `date` produce objects, so the snapshot compared against is a
detached copy — an edit in place is still detected:

```ts
task.metadata!.tags.push('urgent');
task.isDirty; // true

task.due_at!.setUTCFullYear(2031);
task.isDirty; // true
```

## Custom casts

Anything implementing `ColumnCast` can go wherever a built-in name goes. The
built-ins are themselves `ColumnCast` objects, so there is one mechanism rather
than a separate path for each:

```ts
import { Model, type ColumnCast } from '@7otion/orm';

class Money {
	constructor(readonly cents: number) {}
	get dollars() {
		return this.cents / 100;
	}
}

const MoneyCast: ColumnCast<Money, number> = {
	fromDatabase: cents => new Money(cents),
	toDatabase: money => money.cents,
	equals: (a, b) => a.cents === b.cents, // optional
	clone: money => new Money(money.cents), // optional
};

class Product extends Model<Product> {
	static config = { casts: { price: MoneyCast } as const };
	price!: Money;
}
```

| member                        | required | purpose                                                                          |
| ----------------------------- | -------- | -------------------------------------------------------------------------------- |
| `fromDatabase(value, column)` | yes      | stored → logical. Never called for `null` / `undefined`.                         |
| `toDatabase(value, column)`   | yes      | logical → stored. Never called for `null` / `undefined`.                         |
| `clone(value)`                | no       | detach the value for the dirty-tracking snapshot. Defaults to `structuredClone`. |
| `equals(a, b)`                | no       | value comparison for dirty tracking. Defaults to a structural compare.           |

`clone` and `equals` are consulted only for object values — primitives copy and
compare correctly on their own. Supply `clone` when the logical value is a class
instance, since `structuredClone` would drop its prototype.

`BooleanCast`, `JsonCast` and `DateCast` are exported if you want to reference
one directly or wrap it.
