/**
 * Client-side image downscaling for chat attachments.
 *
 * WHY RESIZE AT ALL:
 * A modern phone photo is 12 MP and several megabytes. The API caps usable resolution at
 * 2576px on the long edge, so anything larger is bytes uploaded for nothing — and the
 * whole request has to fit inside Vercel's 4.4 MB body limit alongside the chat history.
 *
 * The two pure functions (fitWithin, validateAttachmentBudget) hold the arithmetic and
 * are unit-tested; the canvas work around them needs a browser and is not.
 */

/** Longest edge Claude actually uses. Larger images are downscaled server-side anyway. */
export const MAX_IMAGE_EDGE = 2576;

/** Attachments per message. Three photos of a product and its label is a realistic ceiling. */
export const MAX_IMAGES_PER_MESSAGE = 3;

/**
 * Total base64 budget across all attachments, in bytes.
 *
 * Vercel caps the request body at 4.4 MB. Conversation history can reach a few hundred
 * KB, so 3 MB of image payload leaves comfortable headroom.
 */
export const MAX_TOTAL_BASE64_BYTES = 3 * 1024 * 1024;

/** Media types we send. Deliberately explicit — see the note in validateImageFile. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface ResizedImage {
  /** Base64 payload without the data: URI prefix, ready for an API image block. */
  base64: string;
  /** Always 'image/jpeg' — everything is re-encoded (see resizeImageForUpload). */
  mediaType: 'image/jpeg';
  /** Object URL for the thumbnail preview. The caller must revoke it. */
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * Scales a width/height pair down so the longest edge fits `maxEdge`.
 *
 * Images already within the limit are returned unchanged — upscaling a small photo would
 * add bytes and invent detail that isn't there. Results are rounded to whole pixels, with
 * a floor of 1 so a very lopsided aspect ratio can't produce a zero-width canvas.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE
): { width: number; height: number } {
  const longestEdge = Math.max(width, height);

  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface AttachmentBudgetResult {
  isValid: boolean;
  /** Ready-to-show message when invalid; null otherwise. */
  error: string | null;
  totalBytes: number;
}

/**
 * Checks a set of encoded attachments against the count and size caps.
 *
 * Base64 inflates bytes by roughly 4/3, so the measured string length is what counts
 * against the request budget — not the original file size.
 */
export function validateAttachmentBudget(images: { base64: string }[]): AttachmentBudgetResult {
  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    return {
      isValid: false,
      error: `Puoi allegare al massimo ${MAX_IMAGES_PER_MESSAGE} foto per messaggio.`,
      totalBytes: 0,
    };
  }

  const totalBytes = images.reduce((sum, image) => sum + image.base64.length, 0);

  if (totalBytes > MAX_TOTAL_BASE64_BYTES) {
    return {
      isValid: false,
      error: 'Le foto sono troppo pesanti anche dopo la compressione. Provane meno o più piccole.',
      totalBytes,
    };
  }

  return { isValid: true, error: null, totalBytes };
}

/**
 * Rejects files we can't send.
 *
 * The accepted list is explicit rather than `image/*` on purpose: iPhones hand over HEIC,
 * which is neither a media type the API accepts nor something Chrome on Android can even
 * decode into a canvas. Failing here with a clear message beats failing later with a
 * decode error or a 400 from the API.
 */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return `Formato non supportato (${file.type || 'sconosciuto'}). Usa JPG, PNG o WebP.`;
  }
  return null;
}

/** Progressively cheaper encodings, tried in order until one fits the per-image budget. */
const ENCODING_STEPS: { maxEdge: number; quality: number }[] = [
  { maxEdge: MAX_IMAGE_EDGE, quality: 0.82 },
  { maxEdge: MAX_IMAGE_EDGE, quality: 0.7 },
  { maxEdge: 2000, quality: 0.75 },
];

/** Per-image ceiling so one photo can't consume the whole message budget. */
const MAX_SINGLE_IMAGE_BYTES = Math.floor(MAX_TOTAL_BASE64_BYTES / MAX_IMAGES_PER_MESSAGE);

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:image/jpeg;base64," prefix — the API wants the payload alone.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Lettura del file non riuscita'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Compressione non riuscita'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Downscales and re-encodes one image for upload.
 *
 * @param file - A file that already passed validateImageFile
 * @returns Base64 payload, media type, preview URL, and final pixel dimensions
 *
 * Three details are load-bearing:
 *
 * 1. `imageOrientation: 'from-image'` applies the EXIF rotation. Without it, photos taken
 *    in portrait arrive rotated 90° — and a sideways product label is unreadable to the
 *    model, which is precisely the use case this feature exists for.
 * 2. `toBlob` rather than `toDataURL`, because we need the encoded size to decide whether
 *    to try a cheaper step, and measuring it before base64 expansion is the honest number.
 * 3. Always re-encoded to JPEG, even from PNG: a photographic PNG is several times larger
 *    than the equivalent JPEG for no visible gain at this resolution.
 *
 * The caller owns `previewUrl` and must call URL.revokeObjectURL on it.
 */
export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  try {
    let encoded: { blob: Blob; width: number; height: number } | null = null;

    for (const step of ENCODING_STEPS) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, step.maxEdge);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas non disponibile');
      }
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, step.quality);
      encoded = { blob, width, height };

      // Base64 inflates by ~4/3, so compare the inflated size against the budget.
      if (blob.size * 1.37 <= MAX_SINGLE_IMAGE_BYTES) {
        break;
      }
    }

    if (!encoded) {
      throw new Error('Compressione non riuscita');
    }

    return {
      base64: await blobToBase64(encoded.blob),
      mediaType: 'image/jpeg',
      previewUrl: URL.createObjectURL(encoded.blob),
      width: encoded.width,
      height: encoded.height,
    };
  } finally {
    // Free the decoded bitmap promptly: a 12 MP decode holds tens of MB, and mobile
    // Safari runs out of memory if several are alive at once.
    bitmap.close();
  }
}

/**
 * Resizes several images one at a time.
 *
 * Sequential on purpose. Decoding multiple 12 MP images concurrently is what pushes
 * mobile Safari into an out-of-memory kill; three at a time is enough to trigger it.
 * The wall-clock cost of serialising three resizes is not noticeable.
 */
export async function resizeImagesForUpload(files: File[]): Promise<ResizedImage[]> {
  const resized: ResizedImage[] = [];

  for (const file of files) {
    resized.push(await resizeImageForUpload(file));
  }

  return resized;
}
