import type { ColumnCast } from '.';

const EmptyToNullCast: ColumnCast<string | null, string | null> = {
	fromDatabase: value => value,
	toDatabase: value => (value === '' ? null : value),
};

export default EmptyToNullCast;
