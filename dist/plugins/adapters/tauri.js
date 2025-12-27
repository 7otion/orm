export class TauriAdapter {
    constructor(config) {
        this.db = null;
        this.inTransactionFlag = false;
        this.debug = false;
        this.initPromise = null;
        this.config = config;
        this.debug = config.debug || false;
    }
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = this.performInitialization();
        return this.initPromise;
    }
    async performInitialization() {
        if (this.db) {
            return;
        }
        let tauriSqlModule;
        try {
            // @ts-ignore
            tauriSqlModule = await import('@tauri-apps/plugin-sql');
        }
        catch (_error) {
            throw new Error('@tauri-apps/plugin-sql is required for TauriAdapter. Install it with: npm install @tauri-apps/plugin-sql');
        }
        this.db = await tauriSqlModule.default.load(this.config.database);
        const defaultPragmas = [
            'PRAGMA journal_mode = WAL;',
            'PRAGMA foreign_keys = ON;',
            'PRAGMA case_sensitive_like = OFF;',
            'PRAGMA busy_timeout = 30000;',
            'PRAGMA synchronous = NORMAL;',
        ];
        const pragmas = this.config.pragmas || defaultPragmas;
        for (const pragma of pragmas) {
            await this.db.execute(pragma);
        }
    }
    ensureInitialized() {
        if (!this.db) {
            throw new Error('TauriAdapter not initialized. Call initialize() first.');
        }
        return this.db;
    }
    logQuery(type, sql, params) {
        if (!this.debug) {
            return;
        }
        const formattedSql = this.formatSqlWithParams(sql, params);
        console.log(`🔹 [${type}]:`, formattedSql);
    }
    formatSqlWithParams(sql, params) {
        if (!params || params.length === 0) {
            return sql;
        }
        let formatted = sql;
        for (const param of params) {
            let value;
            if (param === null || param === undefined) {
                value = 'NULL';
            }
            else if (typeof param === 'string') {
                value = `'${param.replace(/'/g, "''")}'`;
            }
            else {
                value = String(param);
            }
            formatted = formatted.replace('?', value);
        }
        return formatted;
    }
    async query(sql, params) {
        const db = this.ensureInitialized();
        this.logQuery('SELECT', sql, params);
        const result = await db.select(sql, params);
        return result || [];
    }
    async execute(sql, params) {
        const db = this.ensureInitialized();
        this.logQuery('EXECUTE', sql, params);
        const result = await db.execute(sql, params);
        return result.rowsAffected || 0;
    }
    async insert(sql, params) {
        const db = this.ensureInitialized();
        this.logQuery('INSERT', sql, params);
        const result = await db.execute(sql, params);
        return result.lastInsertId || 0;
    }
    async beginTransaction() {
        const db = this.ensureInitialized();
        if (this.inTransactionFlag) {
            return;
        }
        await db.execute('BEGIN TRANSACTION');
        this.inTransactionFlag = true;
    }
    async commit() {
        const db = this.ensureInitialized();
        if (!this.inTransactionFlag) {
            throw new Error('No transaction in progress');
        }
        await db.execute('COMMIT');
        this.inTransactionFlag = false;
    }
    async rollback() {
        const db = this.ensureInitialized();
        if (!this.inTransactionFlag) {
            throw new Error('No transaction in progress');
        }
        await db.execute('ROLLBACK');
        this.inTransactionFlag = false;
    }
    inTransaction() {
        return this.inTransactionFlag;
    }
}
//# sourceMappingURL=tauri.js.map