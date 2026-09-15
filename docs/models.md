# Defining models

```ts
import { Model } from '@7otion/orm';

class User extends Model<User> {
	static config = {
		table: 'users', // optional — derived from the class name otherwise
		primaryKey: 'id', // optional — 'id' by default
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

## `static config`

| key          | default                 | notes                                                                  |
| ------------ | ----------------------- | ---------------------------------------------------------------------- |
| `table`      | derived from class name | `User` → `users`, `BlogPost` → `blog_posts`, `Category` → `categories` |
| `primaryKey` | `'id'`                  | a `string[]` declares a composite key                                  |
| `timestamps` | see below               | `true`, or `{ created_at, updated_at }` to rename the columns          |
| `casts`      | —                       | column ⇄ logical value conversion — see [Casts](casts.md)              |
| `fillable`   | —                       | allow-list for `create()` / `fill()`                                   |
| `guarded`    | —                       | deny-list for `create()` / `fill()`                                    |

> **Timestamps gotcha.** The base class defaults to `timestamps: true`, but a
> subclass that declares `static config` **without** a `timestamps` key turns
> them off. Set it explicitly whenever you declare a config.
