# Transactions

Transactions need an adapter that implements `TransactionalAdapter` (see
[Adapters](adapters.md)). On any other, `transaction()` throws before its callback
runs.

`transaction` is an instance method. It hands the callback a handle, and every
write inside must carry it:

```ts
await ORM.getInstance().transaction(async tx => {
	const user = await User.create({ name: 'John' }, tx);
	await Post.create({ user_id: user.id, title: 'Hello' }, tx);
	await Comment.query().where('user_id', user.id).delete(tx);
});
```

Commits on success, rolls back on throw, and returns the callback's value.
A nested call passes the open transaction's handle and runs inside it — only the
outermost commits:

```ts
await ORM.getInstance().transaction(async tx => {
	await archive(tx);
	await ORM.getInstance().transaction(async inner => {
		await user.save(inner); // `inner` is `tx`
	}, tx);
});
```

Without the handle, a nested call inside the body is reported like any other
write, and a call from unrelated code waits for the open transaction to end.

Reads take no handle. They are never queued, and inside the transaction they
already see its own uncommitted rows.

Some failures make the database roll the whole transaction back rather than
just the failing statement — disk full, an I/O error. When a write inside a
transaction fails, the ORM asks the adapter whether the transaction is still
open; if it is not, later writes carrying the handle are refused and the
transaction rejects instead of committing. A failure that leaves it open, such as
a constraint violation you catch, lets the transaction carry on.

## Why the handle

`BEGIN` and `COMMIT` belong to the connection, not to your code, so _any_
statement reaching the database while a transaction is open becomes part of it.
Without the handle an unrelated write — an autosave, a timer — is committed or
rolled back along with work it has nothing to do with, and its caller is told it
succeeded either way.

The handle is what separates the two. A write carrying it runs inside the
transaction; a write without one is held and runs once the transaction ends:

```ts
await ORM.getInstance().transaction(async tx => {
	await user.save(tx); // inside the transaction
	void other.save(); // held — runs after COMMIT, and survives a ROLLBACK
});
```

Forgetting it is reported rather than left to be discovered:

```
[orm] Passage.save() was issued inside transaction() without its tx handle…
```

`enableWriteQueue` does not apply to transactions; they are always serialised.

The handle is only valid inside the callback that received it — using a finished
one throws.
