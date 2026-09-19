import React, { useRef, useState, useEffect } from 'react';
import { Camera, Image as ImageIcon, CheckCircle2, ShieldCheck, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { transformMealImage, formatBytes } from '../services/imageTransform';
import type { TransformedImageResult } from '../services/imageTransform';

interface CameraCaptureProps {
  onImageReady?: (result: TransformedImageResult) => void;
  onAnalyze?: (result: TransformedImageResult) => void;
  isAnalyzing?: boolean;
  disabled?: boolean;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onImageReady,
  onAnalyze,
  isAnalyzing = false,
  disabled = false,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [isTransforming, setIsTransforming] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transformResult, setTransformResult] = useState<TransformedImageResult | null>(null);

  // Zero-Memory-Leak Hygiene: Revoke preview URL on unmount or before replacing
  useEffect(() => {
    return () => {
      if (transformResult?.revokePreview) {
        transformResult.revokePreview();
      }
    };
  }, [transformResult]);

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset file input value so user can select the same file again if desired
    event.target.value = '';

    if (!file) return;

    // Zero-Memory-Leak: Revoke previous preview URL before starting new transformation
    if (transformResult?.revokePreview) {
      transformResult.revokePreview();
      setTransformResult(null);
    }

    setErrorMessage(null);
    setIsTransforming(true);

    try {
      // Stage 2: Client-side edge transformation pipeline
      const result = await transformMealImage(file, {
        maxDimension: 2048,
        quality: 0.85,
        preferredMimeType: 'image/webp',
      });

      setTransformResult(result);
      if (onImageReady) {
        onImageReady(result);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to transform image.';
      setErrorMessage(msg);
    } finally {
      setIsTransforming(false);
    }
  };

  const handleTriggerCamera = () => {
    setErrorMessage(null);
    cameraInputRef.current?.click();
  };

  const handleTriggerGallery = () => {
    setErrorMessage(null);
    galleryInputRef.current?.click();
  };

  const handleReset = () => {
    if (transformResult?.revokePreview) {
      transformResult.revokePreview();
    }
    setTransformResult(null);
    setErrorMessage(null);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Hidden Hardware Delegation Inputs (Stage 1) */}
      {/* 1. Direct native camera app handoff: capture="environment" launches back camera with OIS/flash */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelection}
        className="hidden"
        disabled={disabled || isTransforming}
        aria-label="Capture meal with camera"
      />

      {/* 2. Photo gallery / file picker fallback */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelection}
        className="hidden"
        disabled={disabled || isTransforming}
        aria-label="Upload meal photo from gallery"
      />

      {/* State A: Loading / Transforming */}
      {isTransforming && (
        <div className="w-full p-8 flex flex-col items-center justify-center bg-slate-900/60 rounded-2xl border border-slate-800 animate-pulse">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Optimizing Plate Photo</p>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            Asynchronously downscaling to 2048px, stripping EXIF GPS telemetry, and compressing to WebP off the main thread...
          </p>
        </div>
      )}

      {/* State B: Error */}
      {errorMessage && !isTransforming && (
        <div className="w-full mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Image Processing Error</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* State C: Transformed Result Preview & Telemetry (Stage 2 Complete) */}
      {transformResult && !isTransforming && (
        <div className="w-full flex flex-col gap-4">
          {/* Image Preview Container */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[4/3] flex items-center justify-center group shadow-xl">
            <img
              src={transformResult.previewUrl}
              alt="Optimized meal preview"
              className="w-full h-full object-cover"
            />
            
            {/* Status Pill on Image */}
            <div className="absolute top-3 left-3 px-2.5 py-1 bg-slate-900/85 backdrop-blur border border-slate-700/60 rounded-full text-[11px] font-medium text-emerald-400 flex items-center gap-1.5 shadow">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Optimized ({transformResult.mimeType.split('/')[1]?.toUpperCase() || 'WEBP'})</span>
            </div>

            {/* Privacy Shield Pill */}
            <div className="absolute top-3 right-3 px-2.5 py-1 bg-slate-900/85 backdrop-blur border border-slate-700/60 rounded-full text-[11px] font-medium text-blue-400 flex items-center gap-1.5 shadow">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>EXIF Stripped</span>
            </div>

            {/* Retake Button Floating Overlay */}
            <button
              type="button"
              onClick={handleReset}
              className="absolute bottom-3 right-3 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retake
            </button>
          </div>

          {/* Telemetry Metrics Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800/80">
              <span className="font-semibold text-slate-300">Client-Side Edge Transform</span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                {transformResult.durationMs}ms
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block mb-0.5">Payload Reduction</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-bold text-white font-mono">
                    {formatBytes(transformResult.compressedSizeBytes)}
                  </span>
                  <span className="text-slate-500 line-through font-mono">
                    {formatBytes(transformResult.originalSizeBytes)}
                  </span>
                  <span className="text-[10px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 font-bold rounded">
                    -{transformResult.compressionRatioPercent}%
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">Dimensions (Clamped)</span>
                <span className="font-bold text-white font-mono block">
                  {transformResult.targetWidth} × {transformResult.targetHeight} px
                </span>
                <span className="text-slate-500 font-mono text-[10px]">
                  orig: {transformResult.originalWidth} × {transformResult.originalHeight} px
                </span>
              </div>
            </div>
          </div>

          {/* Action to proceed to Stage 3 / Stage 4 */}
          {onAnalyze && (
            <button
              type="button"
              onClick={() => onAnalyze(transformResult)}
              disabled={isAnalyzing || disabled}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/25 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isAnalyzing ? 'Ingesting & Analyzing with Gemini...' : 'Analyze Meal with Gemini'}
            </button>
          )}
        </div>
      )}

      {/* State D: Initial Prompt (No image captured yet) */}
      {!transformResult && !isTransforming && (
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-inner">
            <Camera className="w-8 h-8" />
          </div>
          <h2 className="text-base font-semibold text-white mb-1">Plate Photography</h2>
          <p className="text-xs text-slate-400 max-w-xs mb-5">
            Snap your plate using native camera hardware (OIS & flash). On-device optimization shrinks 12MB photos to ~350KB before upload.
          </p>

          {/* Action Buttons: Native Camera vs Photo Library */}
          <div className="w-full flex flex-col gap-2.5 max-w-xs">
            {/* Primary: Stage 1 Native Camera Handoff */}
            <button
              type="button"
              onClick={handleTriggerCamera}
              disabled={disabled}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              Capture Meal (Native Camera)
            </button>

            {/* Secondary: Choose from Photo Library */}
            <button
              type="button"
              onClick={handleTriggerGallery}
              disabled={disabled}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl transition-all border border-slate-700/80 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-slate-400" />
              Choose from Photo Library
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
