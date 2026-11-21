import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop, RotateCw, RotateCcw, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';

export type CropAspectPreset = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | 'original';

interface ImageCropModalProps {
  file: File;
  title?: string;
  defaultPreset?: CropAspectPreset;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => Promise<void>;
}

const PRESET_OPTIONS: Array<{ key: CropAspectPreset; label: string; ratio: number | null }> = [
  { key: '21:9', label: '21:9 Banner', ratio: 21 / 9 },
  { key: '16:9', label: '16:9 Landscape', ratio: 16 / 9 },
  { key: '4:3', label: '4:3 Standar', ratio: 4 / 3 },
  { key: '1:1', label: '1:1 Persegi', ratio: 1 },
  { key: '3:4', label: '3:4 Portrait', ratio: 3 / 4 },
  { key: 'original', label: 'Asli', ratio: null },
];

function drawCroppedFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  boxW: number,
  boxH: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
  rotation: number
) {
  const natW = img.naturalWidth || 1;
  const natH = img.naturalHeight || 1;
  const isQuarterTurn = rotation % 180 !== 0;
  const rotW = isQuarterTurn ? natH : natW;
  const rotH = isQuarterTurn ? natW : natH;

  const baseScale = Math.max(boxW / rotW, boxH / rotH);
  const effectiveScale = baseScale * zoom;

  const maxOffsetX = Math.max(0, (rotW * effectiveScale - boxW) / 2);
  const maxOffsetY = Math.max(0, (rotH * effectiveScale - boxH) / 2);
  const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
  const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

  const ratio = canvasW / boxW;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#111113';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.save();
  ctx.translate(canvasW / 2 + clampedX * ratio, canvasH / 2 + clampedY * ratio);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(effectiveScale * ratio, effectiveScale * ratio);
  ctx.drawImage(img, -natW / 2, -natH / 2, natW, natH);
  ctx.restore();
}

export function ImageCropModal({
  file,
  title = 'Sesuaikan & Crop Foto',
  defaultPreset = '4:3',
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  }>({ active: false, startX: 0, startY: 0, origOffsetX: 0, origOffsetY: 0 });

  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 1200, height: 900 });
  const [preset, setPreset] = useState<CropAspectPreset>(defaultPreset);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setImgLoaded(false);
    setErrorMsg('');
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({
        width: img.naturalWidth || 1200,
        height: img.naturalHeight || 900,
      });
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(true);
    };
    img.onerror = () => {
      setErrorMsg('File gambar tidak dapat dimuat untuk dicrop.');
    };
    img.src = objectUrl;
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const activeAspect = useMemo(() => {
    const found = PRESET_OPTIONS.find((p) => p.key === preset);
    if (found && found.ratio !== null) return found.ratio;
    const isQuarterTurn = rotation % 180 !== 0;
    const w = isQuarterTurn ? naturalSize.height : naturalSize.width;
    const h = isQuarterTurn ? naturalSize.width : naturalSize.height;
    return Math.max(0.25, w / Math.max(1, h));
  }, [preset, rotation, naturalSize]);

  const { boxW, boxH } = useMemo(() => {
    const maxW = 460;
    const maxH = 300;
    let w = maxW;
    let h = Math.round(w / activeAspect);
    if (h > maxH) {
      h = maxH;
      w = Math.round(h * activeAspect);
    }
    return { boxW: Math.max(120, w), boxH: Math.max(120, h) };
  }, [activeAspect]);

  const clampOffset = (nextX: number, nextY: number, currentZoom = zoom, currentRot = rotation) => {
    const isQuarterTurn = currentRot % 180 !== 0;
    const rotW = isQuarterTurn ? naturalSize.height : naturalSize.width;
    const rotH = isQuarterTurn ? naturalSize.width : naturalSize.height;
    const baseScale = Math.max(boxW / rotW, boxH / rotH);
    const effectiveScale = baseScale * currentZoom;
    const maxOffsetX = Math.max(0, (rotW * effectiveScale - boxW) / 2);
    const maxOffsetY = Math.max(0, (rotH * effectiveScale - boxH) / 2);
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY)),
    };
  };

  useEffect(() => {
    setOffset((prev) => clampOffset(prev.x, prev.y, zoom, rotation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxW, boxH, zoom, rotation, naturalSize]);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(boxW * dpr);
    canvas.height = Math.round(boxH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCroppedFrame(
      ctx,
      imgRef.current,
      canvas.width,
      canvas.height,
      boxW,
      boxH,
      zoom,
      offset.x,
      offset.y,
      rotation
    );
  }, [imgLoaded, boxW, boxH, zoom, offset, rotation]);

  const handleConfirmCrop = async () => {
    if (!imgRef.current) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const outputMaxW = 1600;
      const outW = Math.max(600, Math.min(outputMaxW, Math.round(boxW * 3)));
      const outH = Math.max(240, Math.round(outW * (boxH / boxW)));
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = outW;
      exportCanvas.height = outH;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) throw new Error('Browser gagal memproses canvas gambar.');

      drawCroppedFrame(
        ctx,
        imgRef.current,
        outW,
        outH,
        boxW,
        boxH,
        zoom,
        offset.x,
        offset.y,
        rotation
      );

      const targetMime =
        file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
      const ext =
        targetMime === 'image/png' ? 'png' : targetMime === 'image/webp' ? 'webp' : 'jpg';
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'cropped-image';

      const blob = await new Promise<Blob | null>((resolve) =>
        exportCanvas.toBlob(resolve, targetMime, 0.92)
      );
      if (!blob) throw new Error('Gagal mengekspor hasil crop gambar.');

      const croppedFile = new File([blob], `${baseName}-cropped.${ext}`, {
        type: targetMime,
        lastModified: Date.now(),
      });
      await onConfirm(croppedFile);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses crop gambar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadOriginal = async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      await onConfirm(file);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunggah gambar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-modal-title"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl border border-zinc-200">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-[#111113]" />
            <div>
              <h2 id="crop-modal-title" className="font-display text-base font-bold text-[#111113]">
                {title}
              </h2>
              <p className="text-[11px] text-zinc-500">
                Geser posisi foto &amp; atur zoom sebelum diunggah ke toko.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Tutup editor crop"
            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-[#111113] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rasio Crop */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setPreset(opt.key);
                setOffset({ x: 0, y: 0 });
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                preset === opt.key
                  ? 'bg-[#111113] text-white border-[#111113]'
                  : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:border-[#111113]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Area Preview & Drag Crop */}
        <div className="bg-zinc-900 rounded-xl p-4 flex items-center justify-center min-h-[240px]">
          {!imgLoaded && !errorMsg ? (
            <p className="text-xs text-zinc-400">Memuat pratinjau gambar...</p>
          ) : (
            <div
              className="relative overflow-hidden rounded-lg border-2 border-white/80 shadow-lg select-none touch-none cursor-grab active:cursor-grabbing"
              style={{ width: `${boxW}px`, height: `${boxH}px`, maxWidth: '100%' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragStateRef.current = {
                  active: true,
                  startX: e.clientX,
                  startY: e.clientY,
                  origOffsetX: offset.x,
                  origOffsetY: offset.y,
                };
              }}
              onPointerMove={(e) => {
                if (!dragStateRef.current.active) return;
                const dx = e.clientX - dragStateRef.current.startX;
                const dy = e.clientY - dragStateRef.current.startY;
                setOffset(
                  clampOffset(
                    dragStateRef.current.origOffsetX + dx,
                    dragStateRef.current.origOffsetY + dy
                  )
                );
              }}
              onPointerUp={(e) => {
                dragStateRef.current.active = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              onPointerCancel={() => {
                dragStateRef.current.active = false;
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full block"
              />
              {/* Rule-of-thirds crop guide */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-white/20" />
                <div className="border-r border-white/20" />
                <div />
              </div>
            </div>
          )}
        </div>

        {/* Kontrol Zoom & Putar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <ZoomOut className="w-4 h-4 text-zinc-500 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              aria-label="Zoom gambar"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[#111113] cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-zinc-500 shrink-0" />
            <span className="text-[11px] font-semibold text-zinc-700 w-10 text-right tabular-nums">
              {zoom.toFixed(1)}x
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 hover:border-[#111113] text-[11px] font-semibold text-zinc-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Putar 90°</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setRotation(0);
                setOffset({ x: 0, y: 0 });
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 hover:border-[#111113] text-[11px] font-semibold text-zinc-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200">
          <button
            type="button"
            disabled={submitting}
            onClick={handleUploadOriginal}
            className="px-3.5 py-2 rounded-lg border border-zinc-300 text-xs font-medium text-zinc-700 hover:bg-zinc-50 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Unggah Asli Tanpa Crop</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!imgLoaded || submitting}
              onClick={handleConfirmCrop}
              className="px-5 py-2 rounded-lg bg-[#111113] text-white text-xs font-semibold hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{submitting ? 'Mengunggah...' : 'Potong & Unggah'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
