import { describe, expect, it } from 'vitest';
import { stripMetadata, stripReason } from './strip-metadata';
import { imageSize } from './image-size';

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());
const seg = (marker: number, payload: number[]) => [0xff, marker, ...be16(payload.length + 2), ...payload];
const contains = (hay: Uint8Array, needle: number[]) =>
	hay.some((_, i) => needle.every((v, j) => hay[i + j] === v));

/* ── JPEG ── */

const APP0 = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const APP0_OTHER = seg(0xe0, [...ascii('AVI1'), 0, 0, 0, 0]);
const APP1 = seg(0xe1, [...ascii('Exif'), 0, 0, ...ascii('GPS 33.7N 116.2W')]);
const APP1_XMP = seg(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x:gps/>')]);
const APP2_ICC = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9]);
const APP2_MPF = seg(0xe2, [...ascii('MPF'), 0, 1, 2, 3]);
const APP5 = seg(0xe5, ascii('vendor secret'));
const APP13 = seg(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii('8BIM caption')]);
const APP14 = seg(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
const COM = seg(0xfe, ascii('shot at the house'));
const DQT = seg(0xdb, [0, ...new Array(64).fill(1)]);
const DHT = seg(0xc4, [0, ...new Array(16).fill(0)]);
const DRI = seg(0xdd, be16(4));
const SOF0 = seg(0xc0, [8, ...be16(480), ...be16(640), 1, 1, 0x11, 0]);
const SOS = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
// Entropy-coded data: FF00 is a stuffed byte, FFD3 a restart marker — both
// are part of the scan and must survive byte-for-byte.
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56];
const SCAN2 = [0x9a, 0xff, 0x00, 0xff, 0xd0, 0xbc];
const EOI = [0xff, 0xd9];
const SOI = [0xff, 0xd8];

const clean = () => bytes(SOI, APP0, DQT, SOF0, SOS, SCAN, EOI);

describe('stripMetadata — JPEG', () => {
	it('drops APP1 (Exif, XMP) and APP13, keeps every other byte in order', () => {
		const out = stripMetadata(bytes(SOI, APP0, APP1, APP1_XMP, APP13, DQT, SOF0, SOS, SCAN, EOI), 'image/jpeg');
		expect(out).toEqual(clean());
		expect(contains(out!, ascii('GPS'))).toBe(false);
		expect(contains(out!, ascii('8BIM'))).toBe(false);
		expect(imageSize(out!, 'image/jpeg')).toEqual({ width: 640, height: 480 });
	});

	it('leaves a JPEG without metadata byte-identical', () => {
		expect(stripMetadata(clean(), 'image/jpeg')).toEqual(clean());
	});

	it('copies scan data with FF00 stuffing and RSTn untouched', () => {
		const out = stripMetadata(clean(), 'image/jpeg')!;
		expect(contains(out, SCAN)).toBe(true);
	});

	it('discards everything after EOI (MPO secondary image, appended motion-photo MP4)', () => {
		const exifJpeg = [...SOI, ...APP1, ...SOF0, ...SOS, ...SCAN, ...EOI];
		expect(stripMetadata(bytes([...clean()], exifJpeg), 'image/jpeg')).toEqual(clean());
		const mp4 = [0, 0, 0, 0x18, ...ascii('ftypmp42'), 0, 0, 0, 0, ...ascii('mp42isom')];
		expect(stripMetadata(bytes([...clean()], mp4), 'image/jpeg')).toEqual(clean());
	});

	it('parses progressive JPEGs between scans and applies the same rules there', () => {
		const src = bytes(SOI, APP0, DQT, SOF0, DHT, SOS, SCAN, APP1, DHT, SOS, SCAN2, EOI);
		expect(stripMetadata(src, 'image/jpeg')).toEqual(bytes(SOI, APP0, DQT, SOF0, DHT, SOS, SCAN, DHT, SOS, SCAN2, EOI));
	});

	it('keeps only allowlisted segments: tables, DRI, JFIF APP0, Adobe APP14, ICC APP2', () => {
		const src = bytes(SOI, APP0, APP0_OTHER, APP2_ICC, APP2_MPF, APP5, APP14, COM, DQT, DRI, SOF0, DHT, SOS, SCAN, EOI);
		expect(stripMetadata(src, 'image/jpeg')).toEqual(bytes(SOI, APP0, APP2_ICC, APP14, DQT, DRI, SOF0, DHT, SOS, SCAN, EOI));
	});

	it('validates kept headers structurally, not just by prefix', () => {
		const jfifThumb = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 2, 2, ...new Array(12).fill(7)]);
		const jfxx = seg(0xe0, [...ascii('JFXX'), 0, 0x10, 1, 2, 3]);
		const adobeLong = seg(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1, ...ascii('extra!')]);
		const iccSeq0 = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 0, 1, 9, 9]);
		const iccSeqOver = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 3, 2, 9, 9]);
		const src = bytes(SOI, jfifThumb, jfxx, adobeLong, iccSeq0, iccSeqOver, DQT, SOF0, SOS, SCAN, EOI);
		expect(stripMetadata(src, 'image/jpeg')).toEqual(bytes(SOI, DQT, SOF0, SOS, SCAN, EOI));
	});

	it('keeps DNL segments', () => {
		const DNL = seg(0xdc, be16(480));
		const src = bytes(SOI, DQT, SOF0, SOS, SCAN, DNL, EOI);
		expect(stripMetadata(src, 'image/jpeg')).toEqual(src);
	});

	it('ends at EOI when fill bytes precede it inside a scan', () => {
		const src = bytes(SOI, DQT, SOF0, SOS, SCAN, [0xff, 0xff], EOI);
		const out = stripMetadata(src, 'image/jpeg')!;
		expect([...out.slice(-2)]).toEqual(EOI);
		expect(out).toEqual(bytes(SOI, DQT, SOF0, SOS, SCAN, EOI));
	});

	it('returns null when a scan ends on a lone FF', () => {
		expect(stripMetadata(bytes(SOI, DQT, SOF0, SOS, SCAN, [0xff]), 'image/jpeg')).toBeNull();
	});

	it('returns null for truncated, garbage, or EOI-less JPEGs', () => {
		const j = clean();
		expect(stripMetadata(j.slice(0, 30), 'image/jpeg')).toBeNull();
		expect(stripMetadata(j.slice(0, j.length - 2), 'image/jpeg')).toBeNull(); // scan never ends
		expect(stripMetadata(bytes(SOI, APP0), 'image/jpeg')).toBeNull();
		expect(stripMetadata(new Uint8Array(40).fill(0x41), 'image/jpeg')).toBeNull();
		expect(stripMetadata(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]), 'image/jpeg')).toBeNull();
	});
});

/* ── PNG ── */

const chunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0xde, 0xad, 0xbe, 0xef];
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = chunk('IHDR', [...be32(320), ...be32(200), 8, 2, 0, 0, 0]);
const IDAT = chunk('IDAT', [1, 2, 3, 4, 5]);
const IEND = chunk('IEND', []);

describe('stripMetadata — PNG', () => {
	it('drops eXIf, tEXt, iTXt, zTXt and tIME, keeps IHDR/IDAT/IEND whole', () => {
		const src = bytes(
			SIG,
			IHDR,
			chunk('tEXt', ascii('Comment\0GPS here')),
			chunk('eXIf', ascii('MM\0*GPS')),
			chunk('iTXt', ascii('XML\0\0\0\0\0x')),
			chunk('zTXt', ascii('k\0\0z')),
			chunk('tIME', [7, 234, 10, 1, 12, 0, 0]),
			IDAT,
			IEND
		);
		const out = stripMetadata(src, 'image/png');
		expect(out).toEqual(bytes(SIG, IHDR, IDAT, IEND));
		expect(imageSize(out!, 'image/png')).toEqual({ width: 320, height: 200 });
	});

	it('keeps only allowlisted chunks (drops private and unknown ancillary chunks)', () => {
		const keepers = [chunk('PLTE', [0, 0, 0]), chunk('tRNS', [0]), chunk('gAMA', be32(45455)), chunk('pHYs', [0, 0, 0, 1, 0, 0, 0, 1, 1])];
		const src = bytes(SIG, IHDR, ...keepers, chunk('prVt', ascii('secret')), chunk('caNv', [1]), IDAT, IEND);
		expect(stripMetadata(src, 'image/png')).toEqual(bytes(SIG, IHDR, ...keepers, IDAT, IEND));
	});

	it('returns null for truncated PNGs or ones missing IEND', () => {
		const src = bytes(SIG, IHDR, IDAT, IEND);
		expect(stripMetadata(src.slice(0, src.length - 6), 'image/png')).toBeNull();
		expect(stripMetadata(bytes(SIG, IHDR, IDAT), 'image/png')).toBeNull();
		expect(stripMetadata(bytes([1, 2, 3, 4, 5, 6, 7, 8], IHDR, IEND), 'image/png')).toBeNull();
	});
});

/* ── WebP ── */

function riff(...chunks: number[][]) {
	const body = [...ascii('WEBP'), ...chunks.flat()];
	return bytes(ascii('RIFF'), le32(body.length), body);
}
const wchunk = (tag: string, data: number[]) => [...ascii(tag), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
// flags: ICC 0x20 | alpha 0x10 | EXIF 0x08 | XMP 0x04
const vp8x = (flags: number) => wchunk('VP8X', [flags, 0, 0, 0, ...le24(799), ...le24(599)]);
const VP8 = wchunk('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02]);

describe('stripMetadata — WebP', () => {
	it('drops EXIF and XMP chunks, clears their VP8X flags and rewrites the RIFF size', () => {
		const src = riff(vp8x(0x10 | 0x08 | 0x04), VP8, wchunk('EXIF', ascii('MM\0*GPS!')), wchunk('XMP ', ascii('<x/>')));
		const out = stripMetadata(src, 'image/webp')!;
		expect(out).toEqual(riff(vp8x(0x10), VP8));
		expect(out[20] & 0x0c).toBe(0);
		expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true)).toBe(out.length - 8);
		expect(imageSize(out, 'image/webp')).toEqual({ width: 800, height: 600 });
	});

	it('handles odd-sized chunks with their pad byte', () => {
		const src = riff(vp8x(0x08), wchunk('EXIF', [1, 2, 3]), VP8);
		expect(stripMetadata(src, 'image/webp')).toEqual(riff(vp8x(0), VP8));
	});

	it('drops unknown chunks, keeps ALPH/ICCP', () => {
		const src = riff(vp8x(0x30), wchunk('ICCP', [1, 2]), wchunk('ALPH', [3, 4]), VP8, wchunk('ZZZZ', [5, 6]));
		expect(stripMetadata(src, 'image/webp')).toEqual(riff(vp8x(0x30), wchunk('ICCP', [1, 2]), wchunk('ALPH', [3, 4]), VP8));
	});

	it('accepts a final odd-sized chunk that omits its pad byte', () => {
		const odd = [...ascii('ALPH'), ...le32(3), 7, 8, 9]; // no pad
		const body = [...ascii('WEBP'), ...vp8x(0x10), ...VP8, ...odd];
		const src = bytes(ascii('RIFF'), le32(body.length), body);
		const out = stripMetadata(src, 'image/webp')!;
		expect(out).not.toBeNull();
		expect(imageSize(out, 'image/webp')).toEqual({ width: 800, height: 600 });
		expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true)).toBe(out.length - 8);
	});

	it('rejects animated WebPs (animation flag, ANIM or ANMF)', () => {
		expect(stripMetadata(riff(vp8x(0x02), VP8), 'image/webp')).toBeNull();
		expect(stripMetadata(riff(vp8x(0), wchunk('ANIM', [0, 0, 0, 0, 0, 0]), VP8), 'image/webp')).toBeNull();
		expect(stripMetadata(riff(vp8x(0), wchunk('ANMF', new Array(16).fill(0))), 'image/webp')).toBeNull();
		expect(stripReason(riff(vp8x(0x02), VP8), 'image/webp')).toEqual({ reason: 'animated' });
		expect(stripReason(new Uint8Array(8), 'image/webp')).toEqual({ reason: 'unreadable' });
	});

	it('returns null for truncated or non-RIFF WebPs', () => {
		const src = riff(vp8x(0x08), VP8, wchunk('EXIF', [1, 2, 3, 4]));
		expect(stripMetadata(src.slice(0, src.length - 3), 'image/webp')).toBeNull();
		expect(stripMetadata(new Uint8Array(40).fill(0x41), 'image/webp')).toBeNull();
		expect(stripMetadata(riff(), 'image/webp')).toBeNull();
	});
});
