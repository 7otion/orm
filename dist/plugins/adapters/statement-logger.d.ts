import type { QueryValue } from '../../types';
/** Logs each statement with its bindings written in, when enabled. */
export declare class StatementLogger {
    private readonly enabled;
    constructor(enabled: boolean);
    log(kind: string, sql: string, params?: QueryValue[]): void;
    private static inline;
}
//# sourceMappingURL=statement-logger.d.ts.map