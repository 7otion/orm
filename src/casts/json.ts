import type { ColumnCast } from '.';

const JsonCast: ColumnCast<unknown, unknown> = {
	fromDatabase: (value, column) => {
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value);
		} catch (cause) {
			throw new Error(
				`[orm] Column ${JSON.stringify(column)} is cast to 'json' but does ` +
					`not hold valid JSON: ${JSON.stringify(String(value).slice(0, 80))}. ` +
					`${cause instanceof Error ? cause.message : String(cause)}`,
			);
		}
	},
	// Strings are serialised too: stored raw they would fail to parse back.
	toDatabase: value => JSON.stringify(value),
};

export default JsonCast;
