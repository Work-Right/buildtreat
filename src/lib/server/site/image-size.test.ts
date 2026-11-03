import { describe, expect, it } from 'vitest';
import { imageSize } from './image-size';

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

function png(width: number, height: number) {
	return bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), ascii('IHDR'), be32(width), be32(height), [8, 2, 0, 0, 0], be32(0));
}

function jpeg(width: number, height: number, sof = 0xc0) {
	return bytes(
		[0xff, 0xd8],
		// APP0 (JFIF) — skipped by length
		[0xff, 0xe0], be16(16), ascii('JFIF'), [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
		// DHT — C4 sits in the SOF range but isn't a frame header
		[0xff, 0xc4], be16(5), [0, 1, 2],
		// fill bytes before a marker are legal
		[0xff, 0xff, sof], be16(17), [8], be16(height), be16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
		[0xff, 0xd9]
	);
}

function riff(chunk: string, data: number[]) {
	const body = [...ascii('WEBP'), ...ascii(chunk), ...le32(data.length), ...data];
	return bytes(ascii('RIFF'), le32(body.length), body);
}

const webpLossy = (w: number, h: number) => riff('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h), 0, 0]);

function webpLossless(w: number, h: number) {
	const packed = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
	return riff('VP8L', [0x2f, ...le32(packed), 0]);
}

const webpExtended = (w: number, h: number) => riff('VP8X', [0x10, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);

describe('imageSize', () => {
	it('reads PNG dimensions from IHDR', () => {
		expect(imageSize(png(1200, 800), 'image/png')).toEqual({ width: 1200, height: 800 });
	});

	it('reads JPEG dimensions from the first frame header, skipping DHT and fill bytes', () => {
		expect(imageSize(jpeg(2400, 1800), 'image/jpeg')).toEqual({ width: 2400, height: 1800 });
		expect(imageSize(jpeg(640, 480, 0xc2), 'image/jpeg')).toEqual({ width: 640, height: 480 });
	});

	it('steps over standalone markers (RSTn, TEM) that carry no length', () => {
		const b = bytes(
			[0xff, 0xd8],
			[0xff, 0xd0], // RST0
			[0xff, 0x01], // TEM
			[0xff, 0xd7], // RST7
			[0xff, 0xc0], be16(17), [8], be16(300), be16(400), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
		);
		expect(imageSize(b, 'image/jpeg')).toEqual({ width: 400, height: 300 });
	});

	it('reads WebP VP8, VP8L and VP8X dimensions', () => {
		expect(imageSize(webpLossy(1024, 768), 'image/webp')).toEqual({ width: 1024, height: 768 });
		expect(imageSize(webpLossless(300, 16000), 'image/webp')).toEqual({ width: 300, height: 16000 });
		expect(imageSize(webpExtended(5000, 3000), 'image/webp')).toEqual({ width: 5000, height: 3000 });
	});

	it('masks the VP8 scaling bits', () => {
		const b = webpLossy(1024, 768);
		b[27] |= 0xc0; // upper two bits of width are scale, not size
		expect(imageSize(b, 'image/webp')).toEqual({ width: 1024, height: 768 });
	});

	it('returns null for truncated inputs', () => {
		expect(imageSize(png(10, 10).slice(0, 20), 'image/png')).toBeNull();
		const j = jpeg(10, 10);
		expect(imageSize(j.slice(0, j.length - 16), 'image/jpeg')).toBeNull();
		expect(imageSize(webpLossy(10, 10).slice(0, 27), 'image/webp')).toBeNull();
		expect(imageSize(webpLossless(10, 10).slice(0, 23), 'image/webp')).toBeNull();
		expect(imageSize(webpExtended(10, 10).slice(0, 28), 'image/webp')).toBeNull();
		expect(imageSize(new Uint8Array(), 'image/jpeg')).toBeNull();
	});

	it('returns null for garbage or a mismatched type', () => {
		const junk = new Uint8Array(64).fill(0x41);
		expect(imageSize(junk, 'image/png')).toBeNull();
		expect(imageSize(junk, 'image/jpeg')).toBeNull();
		expect(imageSize(junk, 'image/webp')).toBeNull();
		expect(imageSize(png(10, 10), 'image/jpeg')).toBeNull();
		expect(imageSize(jpeg(10, 10), 'image/webp')).toBeNull();
	});

	it('returns null for a JPEG whose segment length runs backwards or never reaches a frame', () => {
		expect(imageSize(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]), 'image/jpeg')).toBeNull();
		expect(imageSize(bytes([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]), 'image/jpeg')).toBeNull();
	});

	it('returns null for zero dimensions', () => {
		expect(imageSize(png(0, 10), 'image/png')).toBeNull();
		expect(imageSize(jpeg(10, 0), 'image/jpeg')).toBeNull();
		expect(imageSize(webpLossy(0, 10), 'image/webp')).toBeNull();
	});

	it('rejects a VP8 chunk without the start code', () => {
		const b = webpLossy(10, 10);
		b[23] = 0;
		expect(imageSize(b, 'image/webp')).toBeNull();
	});
});
