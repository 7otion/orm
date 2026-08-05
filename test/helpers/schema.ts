/**
 * Schema backing the model fixtures.
 *
 * The mix of key styles is the point: TEXT primary keys (`ref`), UUID keys
 * (`uuid`), AUTOINCREMENT integer keys (`id`) and one composite key
 * (`character_tags`). That combination is what surfaced the bug where INSERT
 * overwrote a caller-supplied primary key with lastInsertRowid.
 */

export const SCHEMA = /* sql */ `
CREATE TABLE files (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	path        TEXT    NOT NULL UNIQUE,
	name        TEXT    NOT NULL,
	size        INTEGER NOT NULL,
	mime        TEXT    NOT NULL,
	extension   TEXT    NOT NULL,
	ctime       INTEGER NOT NULL,
	mtime       INTEGER NOT NULL,
	created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE assets (
	ref         TEXT    PRIMARY KEY,
	file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	name        TEXT    NOT NULL,
	type        TEXT    NOT NULL,
	created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE characters (
	ref                  TEXT    PRIMARY KEY,
	name                 TEXT    NOT NULL,
	is_player            INTEGER NOT NULL DEFAULT 0,
	speaker_color        TEXT,
	pron_plural          INTEGER NOT NULL DEFAULT 0,
	physical_description TEXT,
	created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE character_tags (
	character_ref   TEXT NOT NULL,
	tag             TEXT NOT NULL,
	PRIMARY KEY (character_ref, tag)
);

CREATE TABLE character_assets (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	character_ref   TEXT NOT NULL,
	asset_ref       TEXT NOT NULL,
	kind            TEXT NOT NULL
);

CREATE TABLE passages (
	ref            TEXT    PRIMARY KEY,
	title          TEXT    NOT NULL,
	status         TEXT    NOT NULL,
	group_ref      TEXT,
	sort           INTEGER NOT NULL DEFAULT 0,
	auto_continue  INTEGER NOT NULL DEFAULT 0,
	allow_back     INTEGER NOT NULL DEFAULT 0,
	created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE lines (
	ref               TEXT    PRIMARY KEY,
	passage_ref       TEXT    NOT NULL,
	sort              INTEGER NOT NULL DEFAULT 0,
	kind              TEXT    NOT NULL,
	text              TEXT,
	character_ref     TEXT,
	asset_ref         TEXT,
	position          TEXT,
	volume            INTEGER,
	return_to_caller  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE choices (
	ref          TEXT    PRIMARY KEY,
	passage_ref  TEXT    NOT NULL,
	sort         INTEGER NOT NULL DEFAULT 0,
	text         TEXT    NOT NULL
);

CREATE TABLE routes (
	ref         TEXT    PRIMARY KEY,
	owner_kind  TEXT    NOT NULL,
	owner_ref   TEXT    NOT NULL,
	sort        INTEGER NOT NULL DEFAULT 0,
	goto_ref    TEXT    NOT NULL
);

CREATE TABLE conditions (
	uuid          TEXT PRIMARY KEY,
	owner_kind    TEXT NOT NULL,
	owner_ref     TEXT NOT NULL,
	variable_ref  TEXT NOT NULL,
	op            TEXT NOT NULL,
	value         TEXT NOT NULL
);

CREATE TABLE effects (
	uuid          TEXT PRIMARY KEY,
	owner_kind    TEXT NOT NULL,
	owner_ref     TEXT NOT NULL,
	variable_ref  TEXT NOT NULL,
	op            TEXT NOT NULL,
	value         TEXT NOT NULL
);

CREATE TABLE hotspots (
	ref             TEXT    PRIMARY KEY,
	bg_asset_ref    TEXT    NOT NULL,
	mask_asset_ref  TEXT,
	sort            INTEGER NOT NULL DEFAULT 0,
	label           TEXT    NOT NULL,
	x               REAL    NOT NULL,
	y               REAL    NOT NULL,
	w               REAL    NOT NULL,
	h               REAL    NOT NULL
);

CREATE TABLE fragment_schemas (
	ref         TEXT PRIMARY KEY,
	owner_kind  TEXT NOT NULL,
	label       TEXT NOT NULL,
	hint        TEXT
);

CREATE TABLE fragments (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	schema_ref  TEXT    NOT NULL,
	owner_ref   TEXT    NOT NULL,
	suffix      TEXT    NOT NULL,
	content     TEXT,
	sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE variables (
	ref            TEXT PRIMARY KEY,
	namespace      TEXT NOT NULL,
	name           TEXT,
	type           TEXT NOT NULL,
	initial_value  TEXT,
	description    TEXT,
	created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

/* Auxiliary tables for convention and edge-case fixtures. */

CREATE TABLE zero_keys (
	id     INTEGER PRIMARY KEY,
	label  TEXT NOT NULL
);

CREATE TABLE categories (
	id    INTEGER PRIMARY KEY AUTOINCREMENT,
	name  TEXT NOT NULL
);

CREATE TABLE profiles (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id  INTEGER,
	bio      TEXT
);

CREATE TABLE users (
	id     INTEGER PRIMARY KEY AUTOINCREMENT,
	name   TEXT,
	title  TEXT,
	slug   TEXT,
	status TEXT,
	age    INTEGER
);

CREATE TABLE roles (
	id    INTEGER PRIMARY KEY AUTOINCREMENT,
	name  TEXT NOT NULL
);

CREATE TABLE user_roles (
	user_id  INTEGER NOT NULL,
	role_id  INTEGER NOT NULL
);

/* Dedicated tables for the thunk fixtures, so they don't inherit the
   NOT NULL columns of the real passages/lines tables. */
CREATE TABLE thunk_passages (
	ref    TEXT PRIMARY KEY,
	title  TEXT NOT NULL
);

CREATE TABLE thunk_lines (
	ref          TEXT PRIMARY KEY,
	passage_ref  TEXT NOT NULL,
	kind         TEXT NOT NULL
);

/* Polymorphic target, for MorphTo coverage. */
CREATE TABLE notes (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	body         TEXT    NOT NULL,
	target_kind  TEXT,
	target_id    INTEGER
);
`;
