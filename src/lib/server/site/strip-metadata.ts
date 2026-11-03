import type { PhotoType } from './photos';

/**
 * Remove metadata (EXIF GPS, XMP, IPTC, comments, text chunks, appended
 * data) from uploaded photos by keeping only an allowlist of structural parts
 * before they reach R2 — the browser's re-encode already drops it, but the
 * no-JS path (and any hand-built request) posts originals. Pixel data is
 * copied untouched; nothing is decoded or re-encoded here.
 *
 * Trade-off: EXIF also carries orientation, so a no-JS upload of a rotated
 * phone photo may display unrotated. The JS path bakes orientation into the
 * pixels during its re-encode, so it's unaffected.
 *
 * Returns null when the file's structure can't be walked (truncated or not
 * really that type); the upload rejects those.
 */
export function stripMetadata(bytes: Uint8Array, type: PhotoType): Uint8Array<ArrayBuffer> | null {
	const r = stripReason(bytes, type);
	return 'bytes' in r ? r.bytes : null;
}

/** Same as stripMetadata, but says why a file was refused. */
export function stripReason(
	bytes: Uint8Array,
	type: PhotoType
): { bytes: Uint8Array<ArrayBuffer> } | { reason: 'unreadable' | 'animated' } {
	const out = type === 'image/jpeg' ? stripJpeg(bytes) : type === 'image/png' ? stripPng(bytes) : type === 'image/webp' ? stripWebp(bytes) : null;
	if (out === 'animated') return { reason: 'animated' };
	return out ? { bytes: out } : { reason: 'unreadable' };
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/* ── JPEG: allowlist of structural segments, parsed through EOI ── */

const startsWith = (b: Uint8Array, at: number, end: number, sig: string) =>
	end - at >= sig.length && [...sig].every((c, k) => b[at + k] === c.charCodeAt(0));

/**
 * Keep only what decoding needs; every other APPn, COM, etc. is dropped.
 * The few kept APPn are checked structurally, so a prefix can't smuggle a
 * payload (a JFIF thumbnail, a long Adobe segment, a bogus ICC chunk).
 */
function keepJpegSegment(marker: number, b: Uint8Array, payload: number, end: number): boolean {
	const len = end - payload + 2;
	// SOF0–SOF15 plus DHT (C4) and DAC (CC) tables; C8 (JPG) is reserved.
	if (marker >= 0xc0 && marker <= 0xcf) return marker !== 0xc8;
	if (marker === 0xdb || marker === 0xdd || marker === 0xda || marker === 0xdc) return true; // DQT, DRI, SOS, DNL
	// JFIF APP0 without a thumbnail: exactly 16 bytes, Xthumb = Ythumb = 0. JFXX is dropped.
	if (marker === 0xe0) return len === 16 && startsWith(b, payload, end, 'JFIF\0') && b[payload + 12] === 0 && b[payload + 13] === 0;
	// ICC profile chunk: 1 ≤ sequence ≤ count.
	if (marker === 0xe2) {
		if (!startsWith(b, payload, end, 'ICC_PROFILE\0') || end - payload < 14) return false;
		const seq = b[payload + 12];
		const count = b[payload + 13];
		return count >= 1 && seq >= 1 && seq <= count;
	}
	// Adobe APP14 (colour transform): exactly 14 bytes.
	if (marker === 0xee) return len === 14 && startsWith(b, payload, end, 'Adobe');
	return false;
}

/**
 * Walks segments, and after each SOS walks the entropy-coded data (FF00
 * stuffing and RSTn belong to the scan) until the next real marker, so
 * progressive files' between-scan segments get the same rules. Stops at the
 * first EOI and drops everything after it (MPO secondary images, appended
 * motion-photo video). No EOI → null.
 */
function stripJpeg(b: Uint8Array): Uint8Array<ArrayBuffer> | null {
	if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
	const keep: Uint8Array[] = [b.subarray(0, 2)];
	let i = 2;
	while (i < b.length) {
		if (b[i] !== 0xff) return null;
		const start = i;
		while (i < b.length && b[i] === 0xff) i++; // fill bytes
		if (i >= b.length) return null;
		const marker = b[i++];
		if (marker === 0xd9) {
			keep.push(new Uint8Array([0xff, 0xd9]));
			return concat(keep);
		}
		if (marker === 0xd8) return null;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // stray standalone: drop
		if (i + 2 > b.length) return null;
		const len = (b[i] << 8) | b[i + 1];
		if (len < 2 || i + len > b.length) return null;
		const end = i + len;
		if (keepJpegSegment(marker, b, i + 2, end)) keep.push(b.subarray(start, end));
		i = end;
		if (marker === 0xda) {
			let j = i;
			while (j < b.length) {
				if (b[j] === 0xff) {
					if (j + 1 >= b.length) return null;
					const next = b[j + 1];
					if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
						j += 2;
						continue;
					}
					break; // a real marker (or fill before one) ends the scan
				}
				j++;
			}
			if (j >= b.length) return null;
			keep.push(b.subarray(i, j));
			i = j;
		}
	}
	return null;
}

/* ── PNG: allowlist of rendering chunks (incl. APNG), stop at IEND ── */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_KEEP = new Set([
	'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'acTL', 'fcTL', 'fdAT'
]);

function stripPng(b: Uint8Array): Uint8Array<ArrayBuffer> | null {
	if (b.length < 8 || !PNG_SIG.every((v, i) => b[i] === v)) return null;
	const keep: Uint8Array[] = [b.subarray(0, 8)];
	let i = 8;
	while (i + 12 <= b.length) {
		const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
		const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
		const end = i + 12 + len; // length + type + data + CRC
		if (end > b.length) return null;
		if (PNG_KEEP.has(type)) keep.push(b.subarray(i, end));
		i = end;
		// Anything after IEND is not part of the image; leave it behind.
		if (type === 'IEND') return concat(keep);
	}
	return null;
}

/* ── WebP: allowlist of image chunks, clear VP8X EXIF/XMP flags, fix the RIFF size ── */

const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP']);
const VP8X_ANIMATION = 0x02;
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

/** Animated WebPs are rejected outright ('animated'); frames would need re-checking. */
function stripWebp(b: Uint8Array): Uint8Array<ArrayBuffer> | 'animated' | null {
	const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
	const le32 = (i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
	if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
	let riffEnd = 8 + le32(4);
	if (riffEnd === b.length + 1) riffEnd = b.length; // size counts a pad byte the file omits
	if (riffEnd > b.length) return null;
	const keep: Uint8Array[] = [];
	let i = 12;
	while (i < riffEnd) {
		if (i + 8 > riffEnd) return null;
		const fourcc = tag(i);
		const size = le32(i + 4);
		let end = i + 8 + size + (size % 2); // chunks pad to even length
		// libwebp may omit the pad byte on a final odd-sized chunk; accept it
		// and write the pad back so the output is well-formed.
		const unpaddedLast = size % 2 === 1 && end === riffEnd + 1;
		if (unpaddedLast) end = riffEnd;
		else if (end > riffEnd) return null;
		if (fourcc === 'ANIM' || fourcc === 'ANMF') return 'animated';
		if (fourcc === 'VP8X' && size >= 1 && b[i + 8] & VP8X_ANIMATION) return 'animated';
		if (WEBP_KEEP.has(fourcc)) {
			const piece = unpaddedLast ? concat([b.subarray(i, end), new Uint8Array(1)]) : b.slice(i, end);
			if (fourcc === 'VP8X' && size >= 1) piece[8] &= ~(VP8X_EXIF | VP8X_XMP) & 0xff;
			keep.push(piece);
		}
		i = end;
	}
	if (!keep.length) return null;
	const body = concat(keep);
	const out = new Uint8Array(12 + body.length);
	out.set(b.subarray(0, 12));
	new DataView(out.buffer).setUint32(4, out.length - 8, true);
	out.set(body, 12);
	return out;
}
