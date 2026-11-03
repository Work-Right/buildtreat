/** Longest edge ≤ max, aspect preserved, integer pixels (never zero). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
	const scale = Math.min(1, max / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function encode(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob | null> {
	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0, width, height);
		return canvas.convertToBlob({ type: 'image/jpeg', quality });
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(bitmap, 0, 0, width, height);
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Browser-only: decode (EXIF orientation applied), shrink to ≤ max px and
 * re-encode as JPEG. Always returns the re-encode when there is one — the
 * canvas drops every byte of metadata (GPS included) and bakes rotation into
 * the pixels. Throws if the browser can't decode the file; returns the
 * original only if it decodes but can't encode. The server strips metadata
 * from whatever arrives either way.
 */
export async function downscale(file: File, max = 2400, quality = 0.85): Promise<File> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const size = fitWithin(bitmap.width, bitmap.height, max);
		const blob = await encode(bitmap, size.width, size.height, quality);
		if (!blob) return file;
		return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
	} finally {
		bitmap.close();
	}
}
