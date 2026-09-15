# Model events

A write fires events on its model class: `saving`, `creating`, `created`,
`saved` around an insert; `saving`, `updating`, `updated`, `saved` around an
update; `deleting`, `deleted` around a delete. Every ORM write path fires them:
`save()`, `delete()`, `create()`, `createMany()`, `updateMany()`,
`query().update()`, `query().delete()` and `sync()`. A statement handed to the
adapter directly does not.

Two kinds of handler receive them, and they differ in when they run.

## Hooks

Declared on the model class. They run inside the write, receive the transaction
handle, and their own writes must carry it, so they commit or roll back together
with the write that fired them. A hook that throws rolls the write back.

```ts
import { Model, type ModelHooks } from '@7otion/orm';

class Passage extends Model<Passage> {
	static readonly hooks: ModelHooks<Passage> = {
		deleting: async (batch, tx) => {
			await Line.query()
				.whereIn(
					'passage_ref',
					batch.models.map(p => p.ref),
				)
				.delete(tx);
		},
	};
}
```

`hooks` is read at each write, so it may also be assigned after the class
definition; listeners registered or writes made before then are unaffected.

Child cleanup belongs in `deleting`, not `deleted`: a foreign key without
`ON DELETE CASCADE` rejects the parent's statement before `deleted` could run.

## Listeners

Attached from anywhere, and returned as an unsubscribe:

```ts
const off = Passage.on('deleted', batch => store.remove(batch.models));
```

They run after the write has committed and released the write queue, receive no
handle, and never run for a write that rolled back. A listener that throws does
not undo the write: the remaining listeners still run, then the promise of the
call that owns the unit rejects with a `ListenerError` — `transaction()` when
there is one, otherwise the write's own. It carries `committed: true`, the
failed listeners, and the write's return value, so a committed `create()` does
not lose its model.

The rule for choosing: if this work fails, must the write be undone? Yes means
hook. No means listener.

## The batch

Every handler receives a batch, never one model. `save()` passes a batch of
one; `updateMany()` of 500 models passes all 500 at once. Filter the batch and
write once for it, so a handler adds a fixed number of statements per write,
never one per row.

The batch also holds what the write changed, captured when the event fired:

```ts
class Character extends Model<Character> {
	static readonly hooks: ModelHooks<Character> = {
		updated: async (batch, tx) => {
			const promoted = batch.models.filter(
				c => batch.changed(c, 'is_player') && c.is_player === 1,
			);
			if (promoted.length === 0) return;
			await Character.query()
				.whereNot(
					'ref',
					'IN',
					promoted.map(c => c.ref),
				)
				.update({ is_player: 0 }, tx);
		},
	};
}
```

`changed(model, column?)` and `previous(model, column)` answer from that
capture, so a listener that runs after a long chain still sees what the first
write moved, even if a later write in the chain touched the same instance.

## Order and coverage

Within one write: `saving`, `creating`, statement, `created`, `saved`; or
`saving`, `updating`, statement, `updated`, `saved`; or `deleting`, statement,
`deleted`. Hooks run in declaration order and listeners in registration order.
The statement is compiled after every before-hook, so data normalised in
`saving` reaches the row.

A write that selects or receives no models fires nothing, and a clean model is
not written and fires nothing. When nothing is registered for an event the
write is exactly what it is without events. `query().update()` and
`query().delete()` select the matching rows first only when a handler exists,
inside the same queued unit as the write; a query update with handlers is then
written through `updateMany()`, so a hook that changes one model still lands in
the same statement.

## Cascades

A hook's write is an ordinary write and fires its own hooks. Every write in the
chain carries the same handle, so listeners across the chain wait for the
outermost commit and run in the order the events fired.

- A nested delete of a row that an outer delete in the same unit already
  selected is a no-op: no statement, no events. This closes `deleting` cycles.
  An instance whose delete was skipped is still marked gone.
- Before-hooks act on the batch they receive. A write to another model belongs
  in an after-hook, where dirty tracking bounds it: an update that changes
  nothing writes nothing and fires nothing.
- Hooks nested more than 32 deep raise an error instead of hanging.

## Instance changes

One global subscription is told which instances a write changed, after it has
committed, or which instance a `refresh()` or `load()` reloaded. It is the signal a UI store
uses to re-render whatever holds those instances:

```ts
const off = ORM.onInstanceChange(models => republish(models));
```

It is static, so it survives `ORM.reInitialize`. A unit reports once, with
every instance its writes and cascades changed, after its listeners have run.
Nothing is reported for a write that rolled back, and nothing for an assignment
before `save()`. A subscriber that throws is reported through `ListenerError`
like any listener.

`Model.affectedBy(instance)` says whether a change to `instance` can show
through that model: it is one, or it is reachable through the model's relations,
transitively. A store that holds characters asks `Character.affectedBy` and is
told about a changed portrait file without naming `ProjectFile` itself.

## Requirements

A write with hooks begins a transaction, since a hook may write. On an adapter
without transactions the write still runs, but a hook's write into it is
refused.

Listeners live on the model class, which outlives `ORM.reInitialize`. Register
module-level listeners once at module load and read current state when they
fire; unsubscribe component-scoped ones on cleanup. Registering inside a
per-project `init()` adds a duplicate on every project switch.
