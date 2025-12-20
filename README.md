# 7otion ORM

Simple, type-safe, database-agnostic TypeScript ORM with Active Record pattern.

## Features

- 🔌 **Database Agnostic** - Works with any database through adapters
- 🚀 **Active Record Pattern** - Intuitive model-based API
- 🔗 **Relationships** - HasOne, HasMany, BelongsToMany with eager/lazy loading
- 💾 **Smart Caching** - Automatic relationship cache management
- 🔄 **Transactions** - Full transaction support with nested transactions
- 📝 **Query Builder** - Fluent, chainable query interface
- ⚡ **SQLite Optimized** - Built-in write queue for SQLite concurrency
- ⚡ **Tauri SQL Plugin Adapter**

## Installation

```bash
bun add https://github.com/7otion/7otion-orm
```

### Optional Dependencies

For Tauri applications:
```bash
bun add @tauri-apps/plugin-sql
```

## Quick Start

### 1. Initialize ORM

```typescript
import { ORM, TauriAdapter, SQLiteDialect } from '7otion-orm';

await ORM.initialize({
  adapter: new TauriAdapter({
    database: 'sqlite:myapp.db',
    debug: true // Optional: log SQL queries
  }),
  dialect: new SQLiteDialect(),
  enableWriteQueue: true // Required for SQLite
});
```

### 2. Define Models

```typescript
import { Model, HasMany, HasOne, BelongsToMany } from '7otion-orm';

class User extends Model<User> {
  static config = {
    // table: 'users', // Optional - auto-derived from class name
    primaryKey: 'id',
    timestamps: true
  };

  static defineRelationships() {
    return {
      posts: new HasMany(this, Post, 'user_id'),
      profile: new HasOne(this, Profile, 'user_id'),
      roles: new BelongsToMany(this, Role, 'user_roles', 'user_id', 'role_id')
    };
  }

  get posts() {
    return this.getWithSuspense<Post[]>('posts');
  }

  get profile() {
    return this.getWithSuspense<Profile | null>('profile');
  }

  get roles() {
    return this.getWithSuspense<Role[]>('roles');
  }
}

class Post extends Model<Post> {
  static config = {
    timestamps: true
  };
}

class Profile extends Model<Profile> {}

class Role extends Model<Role> {}
```

## Usage

### Creating Records

```typescript
// Method 1: Create and insert
const user = new User();
user.name = 'John Doe';
user.email = 'john@example.com';
await user.insert();

// Method 2: Create in one call
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com'
});
```

### Reading Records

```typescript
// Find by ID
const user = await User.find(1);

// Get all records
const users = await User.all();

// Query with conditions
const activeUsers = await User.query()
  .where('status', 'active')
  .where('age', '>', 18)
  .orderBy('created_at', 'desc')
  .limit(10)
  .get();

// Get first match
const user = await User.query()
  .where('email', 'john@example.com')
  .first();
```

### Updating Records

```typescript
const user = await User.find(1);
user.name = 'Jane Doe';
await user.update();
```

### Deleting Records

```typescript
const user = await User.find(1);
await user.delete();
```

### Dirty Tracking

```typescript
const user = await User.find(1);
user.name = 'Jane';
user.email = 'jane@example.com';

console.log(user.isDirty); // true
console.log(user.getDirty()); // ['name', 'email']
console.log(user.getChanges()); 
// { name: { old: 'John', new: 'Jane' }, email: { old: 'john@...', new: 'jane@...' } }

await user.update();
```

## Relationships

### Defining Relationships

```typescript
class User extends Model<User> {
  static defineRelationships() {
    return {
      // One-to-many
      posts: new HasMany(this, Post, 'user_id'),
      
      // One-to-one
      profile: new HasOne(this, Profile, 'user_id'),
      
      // Many-to-many
      roles: new BelongsToMany(
        this,
        Role,
        'user_roles',      // pivot table
        'user_id',         // foreign key for User
        'role_id'          // foreign key for Role
      )
    };
  }

  get posts() {
    return this.getWithSuspense<Post[]>('posts');
  }

  get profile() {
    return this.getWithSuspense<Profile | null>('profile');
  }

  get roles() {
    return this.getWithSuspense<Role[]>('roles');
  }
}
```

### Accessing Relationships

```typescript
// Lazy loading (loads on access)
const user = await User.find(1);
const posts = user.posts; // Loads automatically

// Eager loading (loads upfront)
const users = await User.query()
  .with('posts', 'profile', 'roles')
  .get();

users[0].posts;   // Already loaded
users[0].profile; // Already loaded
users[0].roles;   // Already loaded
```

### Cache Management

Relationships are automatically cleared when a model is updated:

```typescript
const user = await User.find(1);
user.name = 'Updated';
await user.update(); // Auto-clears all cached relationships

// Manual operations
user.clearRelationships(); // Clear cache
await user.refresh();      // Reload from database + clear cache
```

## Query Builder

### Basic Queries

```typescript
User.query()
  .where('status', 'active')
  .where('age', '>', 18)
  .where('role', 'IN', ['admin', 'moderator'])
  .orderBy('created_at', 'desc')
  .limit(10)
  .offset(20)
  .get();
```

### Joins

```typescript
User.query()
  .innerJoin('posts', 'posts.user_id', '=', 'users.id')
  .where('posts.published', true)
  .get();
```

### Raw Queries

```typescript
User.query()
  .whereRaw('age > ? AND status = ?', [18, 'active'])
  .get();
```

## Transactions

```typescript
await ORM.transaction(async () => {
  const user = await User.create({
    name: 'John Doe',
    email: 'john@example.com'
  });

  await Post.create({
    user_id: user.id,
    title: 'My First Post',
    content: 'Hello World'
  });

  // Auto-commits on success
  // Auto-rolls back on error
});
```

Nested transactions are supported - only the outermost transaction commits/rolls back.

## Table Name Convention

Table names are automatically derived from model class names:

- `User` → `users`
- `BlogPost` → `blog_posts`
- `Category` → `categories`

Override with `static config`:

```typescript
class User extends Model<User> {
  static config = {
    table: 'custom_users'
  };
}
```

## Timestamps

Enable automatic `created_at` and `updated_at` timestamps:

```typescript
class User extends Model<User> {
  static config = {
    timestamps: true
  };
}
```

Custom timestamp columns:

```typescript
class User extends Model<User> {
  static config = {
    timestamps: {
      created_at: 'createdAt',
      updated_at: 'updatedAt'
    }
  };
}
```

## Creating Custom Adapters

Implement the `DatabaseAdapter` interface:

```typescript
import { DatabaseAdapter, DatabaseRow, QueryValue } from '7otion-orm';

export class MyAdapter implements DatabaseAdapter {
  async query(sql: string, params?: QueryValue[]): Promise<DatabaseRow[]> {
    // Execute SELECT query
  }

  async execute(sql: string, params?: QueryValue[]): Promise<number> {
    // Execute INSERT/UPDATE/DELETE
    // Return affected rows
  }

  async insert(sql: string, params?: QueryValue[]): Promise<number> {
    // Execute INSERT
    // Return last inserted ID
  }

  async beginTransaction(): Promise<void> {}
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  inTransaction(): boolean { return false; }
}
```

## Creating Custom Dialects

Implement the `SqlDialect` interface:

```typescript
import { SqlDialect, QueryStructure, CompiledQuery } from '7otion-orm';

export class MyDialect implements SqlDialect {
  compileSelect(query: QueryStructure): CompiledQuery {
    // Build SELECT query
    return { sql: '...', bindings: [...] };
  }

  compileInsert(table: string, data: Record<string, any>): CompiledQuery {
    // Build INSERT query
  }

  compileUpdate(table: string, data: Record<string, any>, primaryKey: string, id: any): CompiledQuery {
    // Build UPDATE query
  }

  compileDelete(table: string, primaryKey: string, id: any): CompiledQuery {
    // Build DELETE query
  }

  getCurrentTimestamp(): string {
    return 'CURRENT_TIMESTAMP'; // Database-specific
  }
}
```

## License

MIT
