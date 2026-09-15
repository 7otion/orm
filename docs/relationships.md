# Relationships

Declare the property for TypeScript, then register the relation:

```ts
import { Model } from '@7otion/orm';

class User extends Model<User> {
	posts!: Post[];
	profile!: Profile | null;
	roles!: Role[];

	static readonly relationships = {
		posts: this.hasMany(Post), // foreign key: user_id
		profile: this.hasOne(Profile), // foreign key: user_id
		roles: this.belongsToMany(Role, 'user_roles'),
	};
}
```

Keys are inferred from class names when omitted, and can always be given
explicitly:

| factory         | signature                                                                            |
| --------------- | ------------------------------------------------------------------------------------ |
| `hasOne`        | `(related, foreignKey?, localKey?)`                                                  |
| `hasMany`       | `(related, foreignKey?, localKey?)`                                                  |
| `belongsTo`     | `(related, foreignKey?, localKey?)`                                                  |
| `belongsToMany` | `(related, pivotTable, foreignPivotKey?, relatedPivotKey?, parentKey?, relatedKey?)` |
| `morphMany`     | `(related, config)`                                                                  |
| `morphTo`       | `(config)`                                                                           |

Declare `relationships` as a plain object literal — **not** annotated
`Record<string, any>`. The literal is what lets `with()` know the valid names.

## Circular imports

When two model files reference each other, pass a thunk. Thunks require
explicit keys, because inference would otherwise read a class that does not
exist yet:

```ts
static readonly relationships = {
  lines: this.hasMany(() => Line, 'passage_ref', 'ref'),
};
```

## Loading

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
User.query().with('postz'); // compile error
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
passage.isDirty; // false
```

## Polymorphic relations

`morphTo` — this model points at one of several types:

```ts
class Attachment extends Model<Attachment> {
	static readonly relationships = {
		target: this.morphTo({
			discriminatorField: 'target_kind',
			foreignKeyField: 'target_id',
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
			foreignKey: 'owner_ref',
			localKey: 'ref',
		}),
	};
}
```

## Syncing a relation's set

A `hasMany` or `morphMany` relation can be made to hold exactly a given set:

```ts
await character.relation('tags').sync(['hero', 'rogue']);
// { attached: 1, detached: 1, updated: 0, unchanged: 1 }
```

It works by difference: rows missing from the database are created, rows absent
from your set are deleted, a row whose other columns moved is updated, and
anything already right is left untouched. When that takes more than one
statement they run in one transaction, so a failure part way leaves the set as it
was — unlike the usual hand-written version, which deletes everything first and
loses the lot if a later insert fails. On an adapter without transactions such a
`sync` is refused before it writes; one that needs a single statement still runs.

The current rows are read inside the same queued unit, so writes queued ahead of
a `sync` are part of its difference.

Members are bare values when one column identifies them, or whole rows when more
than one does:

```ts
await character.relation('assets').sync(
	[
		{ asset_ref: 'a1', kind: 'portrait' },
		{ asset_ref: 'a2', kind: 'sprite' },
	],
	{ matchOn: ['asset_ref', 'kind'] },
);
```

Identity defaults to the related model's key columns less the foreign key — for
a tag table keyed on `['character_ref', 'tag']`, that is `tag`. A generated `id`
cannot identify an incoming row, so pass `matchOn` there.

A row given without a column keeps whatever that column already held, so a
partial row updates rather than blanks.

Relation names are checked against the model's own relations, the same way
`with()` is:

```ts
character.relation('tagz'); // compile error
character.relation('name'); // compile error — a column, not a relation
```

To-one relations (`hasOne`, `belongsTo`) have no set to sync, so they are a
compile error too — assign the property and `save()`.

## Refreshing

```ts
await user.refresh(); // reloads columns + whatever was eager-loaded
await user.refresh(['posts']); // reload only these paths
```

Relations are also invalidated automatically when a column they key off
changes.
