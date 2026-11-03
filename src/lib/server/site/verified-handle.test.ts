import { describe, expect, it, vi } from 'vitest';
import { cleanHandle, verifiedHandle } from './verified-handle';

const DID = 'did:plc:abc123';
const loaderOf = (profile: { did: string; handle: string } | undefined) =>
	vi.fn(async (dids: string[]) => Object.fromEntries(dids.map((d) => [d, profile])));

describe('cleanHandle', () => {
	it('accepts a well-formed handle, lowercased', () => {
		expect(cleanHandle('Alice.Bsky.Social')).toBe('alice.bsky.social');
	});
	it('rejects handle.invalid, junk and non-strings', () => {
		expect(cleanHandle('handle.invalid')).toBeNull();
		expect(cleanHandle('nodot')).toBeNull();
		expect(cleanHandle('bad handle.com')).toBeNull();
		expect(cleanHandle(undefined)).toBeNull();
	});
});

describe('verifiedHandle', () => {
	it('returns the appview-verified handle', async () => {
		const load = loaderOf({ did: DID, handle: 'Alice.bsky.social' });
		expect(await verifiedHandle(DID, undefined, { load })).toBe('alice.bsky.social');
		expect(load).toHaveBeenCalledWith([DID], expect.anything());
	});
	it('handle.invalid from the appview → null (never a PDS claim)', async () => {
		expect(await verifiedHandle(DID, undefined, { load: loaderOf({ did: DID, handle: 'handle.invalid' }) })).toBeNull();
	});
	it('unknown to the appview → null', async () => {
		expect(await verifiedHandle(DID, undefined, { load: loaderOf(undefined) })).toBeNull();
	});
	it('a throwing loader → null, never throws', async () => {
		const load = vi.fn(async () => {
			throw new Error('boom');
		});
		expect(await verifiedHandle(DID, undefined, { load })).toBeNull();
	});
	it('a slow appview → null after the timeout', async () => {
		const load = vi.fn(() => new Promise<Record<string, undefined>>(() => {}));
		expect(await verifiedHandle(DID, undefined, { load, timeoutMs: 10 })).toBeNull();
	});
});
