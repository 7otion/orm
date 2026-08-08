import type { ColumnCast } from '.';

const DateCast: ColumnCast<Date, number> = {
	// Unix seconds, not milliseconds.
	fromDatabase: value => new Date(Number(value) * 1000),
	toDatabase: value => Math.floor(value.getTime() / 1000),
	equals: (a, b) => a.getTime() === b.getTime(),
};

export default DateCast;
