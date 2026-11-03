import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { photoTier, viewerTier } from '$lib/server/site/tier';
import { servePhoto } from '$lib/server/site/photos';
import { verifiedHandle } from '$lib/server/site/verified-handle';

const ID_RE = /^[0-9a-f-]{36}$/;

/** Retreat-site photo bytes, gated by the parent section's visibility. */
export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
	const db = platform?.env?.DB;
	const bucket = platform?.env?.SITE_MEDIA;
	if (!db || !bucket || !ID_RE.test(params.id)) return new Response('Not found', { status: 404 });
	// Appview-verified handle only: a PDS-claimed handle must not unlock
	// invited photos (null → the tier matches by DID alone).
	const handle = locals.did ? await verifiedHandle(locals.did, platform.env.PROFILE_CACHE) : null;
	const actual = await viewerTier(db, platform.env.ORGANIZER_DIDS, locals.did ? { did: locals.did, handle } : null);
	// `dev` is compile-time false in production builds: there, ?preview is ignored.
	const tier = photoTier(actual, { dev, preview: url.searchParams.has('preview') });
	return servePhoto(db, bucket, params.id, tier);
};
