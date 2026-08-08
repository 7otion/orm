import type { ColumnCast } from '.';

const BooleanCast: ColumnCast<boolean, unknown> = {
	fromDatabase: value =>
		value === 1 || value === true || value === '1' || value === 'true',
	toDatabase: value => (value ? 1 : 0),
};

export default BooleanCast;
