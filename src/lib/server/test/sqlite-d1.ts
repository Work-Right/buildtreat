import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Test-only: a D1-shaped wrapper over an in-memory node:sqlite database with
 * every migration in /migrations applied in filename order, so server tests
 * exercise the real schema and SQL. Supports the subset this app uses:
 * prepare().bind(...).first/all/run, and batch().
 */
export function sqliteD1(): D1Database {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	const dir = join(process.cwd(), 'migrations');
	for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		db.exec(readFileSync(join(dir, file), 'utf8'));
	}
	type Arg = string | number | null;
	const statement = (sql: string, args: Arg[] = []) => ({
		bind: (...next: unknown[]) => statement(sql, next as Arg[]),
		first: async <T>(column?: string): Promise<T | null> => {
			const row = db.prepare(sql).get(...args) as Record<string, unknown> | undefined;
			if (!row) return null;
			return (column ? row[column] : { ...row }) as T;
		},
		all: async <T>() => ({
			results: (db.prepare(sql).all(...args) as Record<string, unknown>[]).map((r) => ({ ...r })) as T[],
			success: true,
			meta: {}
		}),
		run: async () => {
			const r = db.prepare(sql).run(...args);
			return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
		}
	});
	return {
		prepare: (sql: string) => statement(sql),
		batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
			db.exec('BEGIN');
			try {
				const out = [];
				for (const s of stmts) out.push(await s.run());
				db.exec('COMMIT');
				return out;
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
		}
	} as unknown as D1Database;
}
