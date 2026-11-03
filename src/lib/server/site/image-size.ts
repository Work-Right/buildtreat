/**
 * Pixel dimensions from an image's header bytes, so the server never trusts
 * a browser-supplied width/height. Each reader checks bounds before every
 * read and returns null on anything malformed or truncated — the caller
 * turns null into a "couldn't read the photo's size" error.
 */

export type SizedType = 'image/jpeg' | 'image/png' | 'image/webp';
type Size = { width: number; height: number };

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

const sized = (width: number, height: number): Size | null => (width > 0 && height > 0 ? { width, height } : null);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(b: Uint8Array): Size | null {
	if (b.length < 24) return null;
	if (!PNG_SIG.every((v, i) => b[i] === v) || tag(b, 12) !== 'IHDR') return null;
	return sized(be32(b, 16), be32(b, 20));
}

/** SOF0–SOF15 minus DHT (C4), JPG (C8) and DAC (CC). */
const isFrameHeader = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
/** Markers that stand alone, with no length field: TEM, RST0–7. */
const isStandalone = (m: number) => m === 0x01 || (m >= 0xd0 && m <= 0xd7);

function jpegSize(b: Uint8Array): Size | null {
	if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
	let i = 2;
	while (i < b.length) {
		if (b[i] !== 0xff) return null;
		// Any number of 0xFF fill bytes may precede a marker.
		while (i < b.length && b[i] === 0xff) i++;
		if (i >= b.length) return null;
		const marker = b[i++];
		if (isStandalone(marker)) continue;
		// End of image or start of scan before any frame header: nothing to read.
		if (marker === 0xd9 || marker === 0xda || marker === 0xd8) return null;
		if (i + 2 > b.length) return null;
		const len = be16(b, i);
		if (len < 2) return null;
		if (isFrameHeader(marker)) {
			// length(2) precision(1) height(2) width(2)
			if (len < 7 || i + 7 > b.length) return null;
			return sized(be16(b, i + 5), be16(b, i + 3));
		}
		i += len;
	}
	return null;
}

function webpSize(b: Uint8Array): Size | null {
	if (b.length < 20 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WEBP') return null;
	const chunk = tag(b, 12);
	const size = le32(b, 16);
	const d = 20;
	if (chunk === 'VP8 ') {
		// frame tag(3) start code 9D 01 2A, then 14-bit width/height (+2 scale bits).
		if (size < 10 || b.length < d + 10) return null;
		if (b[d + 3] !== 0x9d || b[d + 4] !== 0x01 || b[d + 5] !== 0x2a) return null;
		return sized(le16(b, d + 6) & 0x3fff, le16(b, d + 8) & 0x3fff);
	}
	if (chunk === 'VP8L') {
		// signature 0x2F, then width-1 and height-1 packed as 14 bits each.
		if (size < 5 || b.length < d + 5 || b[d] !== 0x2f) return null;
		const bits = le32(b, d + 1);
		return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
	}
	if (chunk === 'VP8X') {
		// flags(1) reserved(3), then canvas width-1 and height-1 as 24 bits each.
		if (size < 10 || b.length < d + 10) return null;
		return sized(le24(b, d + 4) + 1, le24(b, d + 7) + 1);
	}
	return null;
}

export function imageSize(bytes: Uint8Array, type: SizedType): Size | null {
	if (type === 'image/png') return pngSize(bytes);
	if (type === 'image/jpeg') return jpegSize(bytes);
	if (type === 'image/webp') return webpSize(bytes);
	return null;
}
