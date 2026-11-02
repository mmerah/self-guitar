import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export function GET() {
	getDb().get(sql`select 1`);
	return json({ ok: true });
}
