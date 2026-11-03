import { describe, expect, it } from 'vitest';
import type { KVNamespaceLike } from '@svelte-atproto/oauth/server/stores/cloudflare';
import { appviewProfileCache, prefixedKV } from './appview-cache';

function memoryKV(): KVNamespaceLike & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		get: async (key) => data.get(key) ?? null,
		put: async (key, value) => void data.set(key, value),
		delete: async (key) => void data.delete(key),
		list: async () => ({ keys: [...data.keys()].map((name) => ({ name })), list_complete: true })
	};
}

describe('appview profile cache', () => {
	it('never serves an entry stored under the bare DID key (e.g. a PDS fallback)', async () => {
		const kv = memoryKV();
		kv.data.set('did:plc:a', JSON.stringify({ did: 'did:plc:a', handle: 'unverified.example' }));
		const cache = appviewProfileCache(kv);
		expect(await cache.get('did:plc:a')).toBeUndefined();
	});

	it('writes and reads only appview:-prefixed keys', async () => {
		const kv = memoryKV();
		const cache = appviewProfileCache(kv);
		await cache.set('did:plc:a', { did: 'did:plc:a', handle: 'ada.example' });
		expect([...kv.data.keys()]).toEqual(['appview:did:plc:a']);
		expect(await cache.get('did:plc:a')).toEqual({ did: 'did:plc:a', handle: 'ada.example' });
	});

	it('lists only its own keys, unprefixed', async () => {
		const kv = memoryKV();
		kv.data.set('did:plc:plain', '{}');
		kv.data.set('appview:did:plc:b', '{}');
		expect((await prefixedKV(kv, 'appview:').list()).keys).toEqual([{ name: 'did:plc:b' }]);
	});
});
