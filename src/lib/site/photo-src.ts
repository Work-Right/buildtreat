import { dev } from '$app/environment';

/**
 * Dev-only: on the `?preview` home (no real session) invited photos ask the
 * photo route for `?preview`, which it honors only in dev. `dev` is
 * compile-time false in production builds, so this is the identity there.
 */
export function photoSrc(src: string, url: URL): string {
	return dev && url.searchParams.has('preview') ? `${src}?preview` : src;
}
