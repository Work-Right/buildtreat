import type { R2Bucket } from '@cloudflare/workers-types';

/** Test-only: a Map-backed R2 bucket with the calls photos.ts makes. */
export function fakeR2() {
	const objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>();
	const bucket = {
		put: async (key: string, value: Blob, opts?: { httpMetadata?: { contentType?: string } }) => {
			objects.set(key, { bytes: new Uint8Array(await value.arrayBuffer()), type: opts?.httpMetadata?.contentType ?? '' });
			return {};
		},
		get: async (key: string) => {
			const o = objects.get(key);
			return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.type } } : null;
		},
		delete: async (keys: string | string[]) => {
			for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
		}
	};
	return { bucket: bucket as unknown as R2Bucket, objects };
}
