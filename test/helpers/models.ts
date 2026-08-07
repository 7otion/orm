/**
 * Model fixtures.
 *
 * Realistic rather than minimal: mixes TEXT, UUID,
 * AUTOINCREMENT and composite keys, with a relation graph three levels deep.
 * That combination is what exercises key adoption, nested eager loading and
 * the partial-load guard.
 *
 * Written the way a consumer writes models, so a change that breaks this
 * file's declaration style is a breaking change, not just a test failure.
 *
 * Declaration order is dependency order: a class named in a `relationships`
 * initializer must exist already. The thunk fixtures at the bottom cover the
 * case where that is impossible.
 */

import { Model } from '../../src/model';

/* ── Story graph leaves ─────────────────────────────────────────────────── */

export class Condition extends Model<Condition> {
	static config = {
		table: 'conditions',
		primaryKey: 'uuid',
		timestamps: false,
	};

	uuid!: string;
	owner_kind!: string;
	owner_ref!: string;
	variable_ref!: string;
	op!: string;
	value!: string;

	static readonly relationships = {};
}

export class Effect extends Model<Effect> {
	static config = {
		table: 'effects',
		primaryKey: 'uuid',
		timestamps: false,
	};

	uuid!: string;
	owner_kind!: string;
	owner_ref!: string;
	variable_ref!: string;
	op!: string;
	value!: string;

	static readonly relationships = {};
}

export class Route extends Model<Route> {
	static config = {
		table: 'routes',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	owner_kind!: string;
	owner_ref!: string;
	sort!: number;
	goto_ref!: string;

	conditions!: Condition[];

	static readonly relationships = {
		conditions: this.hasMany(Condition, 'owner_ref', 'ref'),
	};
}

export class Hotspot extends Model<Hotspot> {
	static config = {
		table: 'hotspots',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	bg_asset_ref!: string;
	mask_asset_ref!: string | null;
	sort!: number;
	label!: string;
	x!: number;
	y!: number;
	w!: number;
	h!: number;

	conditions!: Condition[];
	effects!: Effect[];
	routes!: Route[];

	static readonly relationships = {
		conditions: this.hasMany(Condition, 'owner_ref', 'ref'),
		effects: this.hasMany(Effect, 'owner_ref', 'ref'),
		routes: this.hasMany(Route, 'owner_ref', 'ref'),
	};
}

/* ── Files & assets ─────────────────────────────────────────────────────── */

export class ProjectFile extends Model<ProjectFile> {
	static config = {
		table: 'files',
		timestamps: { created_at: 'created_at', updated_at: 'updated_at' },
	};

	id!: number;
	path!: string;
	name!: string;
	size!: number;
	mime!: string;
	extension!: string;
	ctime!: number;
	mtime!: number;
	created_at!: number;
	updated_at!: number;

	get formattedSize(): string {
		return `${this.size} bytes`;
	}
}

export class Asset extends Model<Asset> {
	static config = {
		table: 'assets',
		primaryKey: 'ref',
		timestamps: { created_at: 'created_at', updated_at: 'updated_at' },
	};

	ref!: string;
	file_id!: number;
	name!: string;
	type!: 'image' | 'audio' | 'video';

	file!: ProjectFile;
	hotspots!: Hotspot[];

	created_at!: number;
	updated_at!: number;

	static readonly relationships = {
		file: this.belongsTo(ProjectFile, 'file_id', 'id'),
		hotspots: this.hasMany(Hotspot, 'bg_asset_ref', 'ref'),
	};

	get path() {
		return this.file?.path;
	}

	get folder(): string {
		const m = (this.path ?? '').match(/^assets\/([^/]+)\/[^/]+$/);
		return m ? m[1]! : '';
	}
}

/* ── Characters ─────────────────────────────────────────────────────────── */

export class CharacterTag extends Model<CharacterTag> {
	static config = {
		table: 'character_tags',
		primaryKey: ['character_ref', 'tag'],
		timestamps: false,
	};

	character_ref!: string;
	tag!: string;
}

export class CharacterAsset extends Model<CharacterAsset> {
	static config = {
		table: 'character_assets',
		timestamps: false,
	};

	id!: number;
	character_ref!: string;
	asset_ref!: string;
	kind!: string;

	asset!: Asset;

	static readonly relationships = {
		asset: this.belongsTo(Asset, 'asset_ref', 'ref'),
	};
}

export class FragmentSchema extends Model<FragmentSchema> {
	static config = {
		table: 'fragment_schemas',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	owner_kind!: string;
	label!: string;
	hint!: string | null;
}

export class Fragment extends Model<Fragment> {
	static config = {
		table: 'fragments',
		timestamps: false,
	};

	id!: number;
	schema_ref!: string;
	owner_ref!: string;
	suffix!: string;
	content!: string | null;
	sort!: number;

	schema!: FragmentSchema;

	static readonly relationships = {
		schema: this.belongsTo(FragmentSchema, 'schema_ref', 'ref'),
	};
}

export class Character extends Model<Character> {
	static config = {
		table: 'characters',
		primaryKey: 'ref',
		timestamps: { created_at: 'created_at', updated_at: 'updated_at' },
	};

	ref!: string;
	name!: string;
	is_player!: number;
	speaker_color!: string | null;
	pron_plural!: number;
	physical_description!: string | null;

	tags!: CharacterTag[];
	assets!: CharacterAsset[];
	fragments!: Fragment[];

	created_at!: number;
	updated_at!: number;

	static readonly relationships = {
		tags: this.hasMany(CharacterTag, 'character_ref', 'ref'),
		assets: this.hasMany(CharacterAsset, 'character_ref', 'ref'),
		fragments: this.hasMany(Fragment, 'owner_ref', 'ref'),
	};

	get isPlayer() {
		return this.is_player === 1;
	}
}

/* ── Passages ───────────────────────────────────────────────────────────── */

export class Line extends Model<Line> {
	static config = {
		table: 'lines',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	passage_ref!: string;
	sort!: number;
	kind!: string;
	text!: string | null;
	character_ref!: string | null;
	asset_ref!: string | null;
	position!: string | null;
	volume!: number | null;
	return_to_caller!: number;

	routes!: Route[];

	static readonly relationships = {
		routes: this.hasMany(Route, 'owner_ref', 'ref'),
	};

	get summary(): string {
		return this.kind === 'say'
			? `${this.character_ref ?? '?'} · "${this.text ?? ''}"`
			: (this.text ?? '');
	}

	get isReturnToCaller(): boolean {
		return this.return_to_caller === 1;
	}
}

export class Choice extends Model<Choice> {
	static config = {
		table: 'choices',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	passage_ref!: string;
	sort!: number;
	text!: string;

	conditions!: Condition[];
	effects!: Effect[];
	routes!: Route[];

	static readonly relationships = {
		conditions: this.hasMany(Condition, 'owner_ref', 'ref'),
		effects: this.hasMany(Effect, 'owner_ref', 'ref'),
		routes: this.hasMany(Route, 'owner_ref', 'ref'),
	};
}

export class Passage extends Model<Passage> {
	static config = {
		table: 'passages',
		primaryKey: 'ref',
		timestamps: { created_at: 'created_at', updated_at: 'updated_at' },
	};

	ref!: string;
	title!: string;
	status!: string;
	group_ref!: string | null;
	sort!: number;
	auto_continue!: number;
	allow_back!: number;

	created_at!: number;
	updated_at!: number;

	lines!: Line[];
	choices!: Choice[];

	static readonly relationships = {
		lines: this.hasMany(Line, 'passage_ref', 'ref'),
		choices: this.hasMany(Choice, 'passage_ref', 'ref'),
	};

	get isAutoContinue(): boolean {
		return this.auto_continue === 1;
	}
}

export class Variable extends Model<Variable> {
	static config = {
		table: 'variables',
		primaryKey: 'ref',
		timestamps: { created_at: 'created_at', updated_at: 'updated_at' },
	};

	ref!: string;
	namespace!: string;
	name!: string | null;
	type!: string;
	initial_value!: string | null;
	description!: string | null;

	created_at!: number;
	updated_at!: number;

	static readonly relationships = {};
}

/* ── Convention and edge-case fixtures ─────────────────────────────────── */

/** Default config: no `table`, no `primaryKey`, so both are derived. */
export class Category extends Model<Category> {
	static config = { timestamps: false };
	id!: number;
	name!: string;
}

/** Exercises a primary key whose valid value is `0` — falsy but real. */
export class ZeroKey extends Model<ZeroKey> {
	static config = { table: 'zero_keys', timestamps: false };
	id!: number;
	label!: string;
}

export class Profile extends Model<Profile> {
	static config = { table: 'profiles', timestamps: false };
	id!: number;
	user_id!: number | null;
	bio!: string | null;
}

export class Role extends Model<Role> {
	static config = { table: 'roles', timestamps: false };
	id!: number;
	name!: string;
}

/** Covers hasOne, belongsToMany, and automatic slug generation. */
export class User extends Model<User> {
	static config = { table: 'users', timestamps: false };

	id!: number;
	name!: string | null;
	title!: string | null;
	slug!: string | null;
	status!: string | null;
	age!: number | null;

	profile!: Profile | null;
	roles!: Role[];

	static readonly relationships = {
		profile: this.hasOne(Profile, 'user_id', 'id'),
		roles: this.belongsToMany(Role, 'user_roles', 'user_id', 'role_id'),
	};
}

/** Covers MorphTo against two unrelated target models. */
export class Note extends Model<Note> {
	static config = { table: 'notes', timestamps: false };

	id!: number;
	body!: string;
	target_kind!: string | null;
	target_id!: number | null;

	target!: User | Role | null;

	static readonly relationships = {
		target: this.morphTo({
			discriminatorField: 'target_kind',
			foreignKeyField: 'target_id',
			morphMap: {
				user: User as never,
				role: Role as never,
			},
		}),
	};
}

/* ── Thunk fixtures ─────────────────────────────────────────────────────────
 * Mutually-referential models — the case that forces `() => Model` thunks,
 * since neither class exists when the other's initializer runs.
 */

export class ThunkPassage extends Model<ThunkPassage> {
	static config = {
		table: 'thunk_passages',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	title!: string;

	lines!: ThunkLine[];

	static readonly relationships = {
		lines: this.hasMany(() => ThunkLine, 'passage_ref', 'ref'),
	};
}

export class ThunkLine extends Model<ThunkLine> {
	static config = {
		table: 'thunk_lines',
		primaryKey: 'ref',
		timestamps: false,
	};

	ref!: string;
	passage_ref!: string;
	kind!: string;

	passage!: ThunkPassage | null;

	static readonly relationships = {
		passage: this.belongsTo(() => ThunkPassage, 'passage_ref', 'ref'),
	};
}

/**
 * A get-only accessor is `readonly` and so is not a column; an accessor with a
 * setter is writable and so is one. `ColumnKeys` has to tell them apart.
 */
export class Settable extends Model<Settable> {
	static config = { table: 'settables', timestamps: false };

	id!: number;
	raw_label!: string;

	get computed(): string {
		return this.raw_label.toUpperCase();
	}

	get label(): string {
		return this.raw_label;
	}

	set label(value: string) {
		this.raw_label = value;
	}
}
