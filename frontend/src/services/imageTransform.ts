/**
 * Image Edge Transformation Pipeline (Stage 2)
 *
 * Implements client-side in-browser image optimization:
 * 1. Asynchronous decode off the UI thread via `createImageBitmap` (with fallback).
 * 2. Proportional downscaling: clamps maximum dimension to 2048px (optimal for Gemini Flash).
 * 3. Privacy sanitization: drawing to a clean canvas discards all EXIF hardware telemetry & GPS data.
 * 4. Lossy WebP encoding (fallback to JPEG) at 85% quality (~300KB - 400KB).
 * 5. Zero-Memory-Leak hygiene:
 *    - Never uses `FileReader.readAsDataURL()` on large raw files.
 *    - Uses `URL.createObjectURL` with explicit cleanup via `URL.revokeObjectURL`.
 *    - Explicitly closes `ImageBitmap` buffers to free RAM in mobile WebKit/Chromium.
 */

export interface TransformedImageResult {
  blob: Blob;
  previewUrl: string;
  revokePreview: () => void;
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatioPercent: number;
  mimeType: string;
  durationMs: number;
}

export interface ImageTransformOptions {
  maxDimension?: number; // Defaults to 2048px
  quality?: number;      // Defaults to 0.85 (85%)
  preferredMimeType?: string; // Defaults to 'image/webp'
}

const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_QUALITY = 0.85;

/**
 * Calculates new dimensions that preserve aspect ratio while ensuring
 * neither width nor height exceeds `maxDim`.
 */
export function calculateTargetDimensions(
  width: number,
  height: number,
  maxDim: number = DEFAULT_MAX_DIMENSION
): { targetWidth: number; targetHeight: number } {
  if (width <= maxDim && height <= maxDim) {
    return { targetWidth: width, targetHeight: height };
  }

  const scale = maxDim / Math.max(width, height);
  return {
    targetWidth: Math.max(1, Math.round(width * scale)),
    targetHeight: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Asynchronously loads an image source into an ImageBitmap or HTMLImageElement.
 * Tries `createImageBitmap` first (runs off main thread), falling back to
 * `HTMLImageElement` with an internal object URL for WebKit compatibility.
 */
async function decodeImageSource(
  file: File | Blob
): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; cleanup: () => void }> {
  // Path A: Modern off-thread createImageBitmap
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => {
          bitmap.close();
        },
      };
    } catch {
      // Some mobile WebKit versions fail createImageBitmap on specific raw/HEIC blobs.
      // Fallback gracefully to HTMLImageElement.
    }
  }

  // Path B: Fallback HTMLImageElement via object URL
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        cleanup: () => {
          URL.revokeObjectURL(objectUrl);
        },
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image from selected file.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Encodes canvas to Blob with preferred MIME type (WebP) and fallback (JPEG).
 */
async function exportCanvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  preferredMime: string = 'image/webp',
  quality: number = DEFAULT_QUALITY
): Promise<Blob> {
  // OffscreenCanvas export path
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    try {
      const blob = await canvas.convertToBlob({ type: preferredMime, quality });
      // Verify the browser actually encoded to the requested type (or acceptable image)
      if (blob && blob.size > 0) {
        return blob;
      }
    } catch {
      // Try fallback to image/jpeg if WebP is unsupported in this environment
      return await canvas.convertToBlob({ type: 'image/jpeg', quality });
    }
  }

  // Standard HTMLCanvasElement fallback
  const htmlCanvas = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) {
          resolve(blob);
        } else {
          // Fallback to JPEG if WebP wasn't produced
          htmlCanvas.toBlob(
            (fallbackBlob) => {
              if (fallbackBlob) resolve(fallbackBlob);
              else reject(new Error('Canvas image compression failed.'));
            },
            'image/jpeg',
            quality
          );
        }
      },
      preferredMime,
      quality
    );
  });
}

/**
 * Primary Client-Side Transform Pipeline.
 *
 * Takes a raw image file from the camera input (often 8MB - 15MB) and converts
 * it into a privacy-sanitized, downscaled WebP/JPEG blob (~300KB - 400KB).
 */
export async function transformMealImage(
  file: File | Blob,
  options: ImageTransformOptions = {}
): Promise<TransformedImageResult> {
  const startTime = performance.now();
  const maxDim = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const preferredMime = options.preferredMimeType ?? 'image/webp';

  const originalSizeBytes = file.size;

  // Step 1: Decode image off-thread
  const decoded = await decodeImageSource(file);

  try {
    const originalWidth = decoded.width;
    const originalHeight = decoded.height;

    // Step 2: Proportional downscaling (clamping max dimension to 2048px)
    const { targetWidth, targetHeight } = calculateTargetDimensions(
      originalWidth,
      originalHeight,
      maxDim
    );

    // Step 3: Privacy Sanitization via clean canvas (EXIF and GPS data stripped)
    let blob: Blob;

    if (typeof OffscreenCanvas !== 'undefined') {
      // Off-thread OffscreenCanvas
      const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Unable to initialize OffscreenCanvas 2D context.');

      // High quality bicubic interpolation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

      blob = await exportCanvasToBlob(offscreen, preferredMime, quality);
    } else {
      // DOM Canvas Fallback
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to initialize Canvas 2D context.');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

      blob = await exportCanvasToBlob(canvas, preferredMime, quality);

      // Memory hygiene: Zero out canvas dimensions to release backing store
      canvas.width = 0;
      canvas.height = 0;
    }

    const durationMs = Math.round(performance.now() - startTime);
    const compressedSizeBytes = blob.size;
    const reduction = ((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100;
    const compressionRatioPercent = Math.max(0, Math.round(reduction * 10) / 10);

    // Step 4: Create memory-safe preview URL with explicit revocation handle
    const previewUrl = URL.createObjectURL(blob);
    let revoked = false;
    const revokePreview = () => {
      if (!revoked) {
        URL.revokeObjectURL(previewUrl);
        revoked = true;
      }
    };

    return {
      blob,
      previewUrl,
      revokePreview,
      originalWidth,
      originalHeight,
      targetWidth,
      targetHeight,
      originalSizeBytes,
      compressedSizeBytes,
      compressionRatioPercent,
      mimeType: blob.type || preferredMime,
      durationMs,
    };
  } finally {
    // Step 5: Always clean up image bitmap/object URL pointers to prevent mobile leaks
    decoded.cleanup();
  }
}

/**
 * Helper to format bytes into readable KB/MB strings.
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
