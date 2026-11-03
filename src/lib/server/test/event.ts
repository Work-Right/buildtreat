import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

/**
 * Test-only: a minimal RequestEvent for calling a route's load or form
 * actions directly. Only the fields those handlers read are real (locals.did,
 * platform.env, request, url); the result is cast to whatever the handler
 * expects.
 */
export const ORGANIZER = 'did:plc:org1';

export interface EventInit {
	did?: string | null;
	db?: D1Database;
	media?: R2Bucket;
	form?: Record<string, string | Blob | Array<string | Blob>>;
	path?: string;
	/** Defaults to POST (form actions); a load test may pass GET. */
	method?: 'GET' | 'POST';
	/** Records `setHeaders` calls (lowercased names) when provided. */
	headers?: Record<string, string>;
}

export function event<T>(init: EventInit): T {
	const body = new FormData();
	for (const [k, v] of Object.entries(init.form ?? {})) {
		for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
	}
	const url = new URL(`http://x${init.path ?? '/'}`);
	return {
		locals: { did: init.did === undefined ? ORGANIZER : init.did, session: null, client: null },
		platform: {
			env: { DB: init.db, SITE_MEDIA: init.media, ORGANIZER_DIDS: ORGANIZER, PROFILE_CACHE: undefined }
		},
		request: init.method === 'GET' ? new Request(url) : new Request(url, { method: 'POST', body }),
		url,
		params: {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] },
		setHeaders: (h: Record<string, string>) => {
			for (const [k, v] of Object.entries(h)) if (init.headers) init.headers[k.toLowerCase()] = v;
		}
	} as unknown as T;
}
