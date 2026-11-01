import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Crop, Paintbrush, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { toPersianDigits } from '../utils/format';
import { triggerHaptic } from '../utils/haptics';
import './ImageEditorModal.css';

export interface ImageEditorModalProps {
    imageFile: File;
    onSend: (fileToSend: File) => void;
    onCancel: () => void;
}

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

// Crop in natural image coordinates
type CropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const COLOR_PALETTE = [
    { label: 'سفید', value: '#ffffff' },
    { label: 'فیروزه‌ای', value: '#06b6d4' },
    { label: 'زرد', value: '#facc15' },
    { label: 'قرمز', value: '#ef4444' },
    { label: 'سبز', value: '#22c55e' },
    { label: 'آبی', value: '#3b82f6' },
    { label: 'بنفش', value: '#a855f7' },
    { label: 'مشکی', value: '#000000' },
];

const THICKNESS_PRESETS = [
    { label: 'نازک', value: 4, dotSize: 6 },
    { label: 'متوسط', value: 10, dotSize: 12 },
    { label: 'ضخیم', value: 22, dotSize: 18 },
];

export function ImageEditorModal({ imageFile, onSend, onCancel }: ImageEditorModalProps) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
    const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

    // Tool Modes: 'none' | 'draw' | 'crop'
    const [activeTool, setActiveTool] = useState<'none' | 'draw' | 'crop'>('none');
    const [selectedColor, setSelectedColor] = useState<string>('#ffffff');
    const [selectedThickness, setSelectedThickness] = useState<number>(10);

    // Drawing state
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const stageRef = useRef<HTMLDivElement | null>(null);

    // Crop state in natural pixels
    const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
    const isCropped =
        imgNaturalSize.width > 0 &&
        (Math.round(cropRect.x) > 0 ||
            Math.round(cropRect.y) > 0 ||
            Math.round(cropRect.width) < imgNaturalSize.width - 2 ||
            Math.round(cropRect.height) < imgNaturalSize.height - 2);

    // Crop dragging state
    const cropDragRef = useRef<{
        handle: string; // 'top' | 'bottom' | 'left' | 'right' | 'tl' | 'tr' | 'bl' | 'br' | 'move'
        startX: number;
        startY: number;
        initialCrop: CropRect;
    } | null>(null);

    // Canvas display scale tracker
    const [canvasDisplaySize, setCanvasDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

    // Load Image
    useEffect(() => {
        const objectUrl = URL.createObjectURL(imageFile);
        const img = new Image();
        img.onload = () => {
            const nw = img.naturalWidth;
            const nh = img.naturalHeight;
            setImgElement(img);
            setImgNaturalSize({ width: nw, height: nh });
            setCropRect({ x: 0, y: 0, width: nw, height: nh });
            setImageLoaded(true);
        };
        img.src = objectUrl;

        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [imageFile]);

    // Redraw Canvas (Image + Strokes, clipped to crop area if cropped)
    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imgElement) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = imgNaturalSize.width;
        const h = imgNaturalSize.height;

        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(imgElement, 0, 0, w, h);

        // If cropped, clip strokes to cropRect so drawing doesn't bleed outside the user's crop frame
        ctx.save();
        if (isCropped && cropRect.width > 0 && cropRect.height > 0) {
            ctx.beginPath();
            ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
            ctx.clip();
        }

        // Render strokes
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const allStrokes = currentStrokeRef.current ? [...strokes, currentStrokeRef.current] : strokes;

        for (const stroke of allStrokes) {
            if (stroke.points.length === 0) continue;
            ctx.beginPath();
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width;

            if (stroke.points.length === 1) {
                const pt = stroke.points[0];
                ctx.arc(pt.x, pt.y, stroke.width / 2, 0, Math.PI * 2);
                ctx.fillStyle = stroke.color;
                ctx.fill();
            } else {
                ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                for (let i = 1; i < stroke.points.length; i++) {
                    const pt = stroke.points[i];
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
            }
        }

        ctx.restore();

        // Update display dimensions for crop overlay alignment
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setCanvasDisplaySize({ width: rect.width, height: rect.height });
        }
    }, [imgElement, imgNaturalSize, strokes, isCropped, cropRect]);

    useEffect(() => {
        if (imageLoaded) {
            redrawCanvas();
        }
    }, [imageLoaded, redrawCanvas]);

    // Track window resize to keep crop overlay aligned with canvas
    useEffect(() => {
        const updateSize = () => {
            if (canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    setCanvasDisplaySize({ width: rect.width, height: rect.height });
                }
            }
        };
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Convert screen coordinates to canvas natural coordinates
    const getCanvasCoordinates = (e: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    // Drawing pointer handlers (always active and unobstructed in draw mode)
    const handleDrawingPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (activeTool !== 'draw') return;
        e.preventDefault();
        const pt = getCanvasCoordinates(e);
        if (!pt) return;

        try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            // ignore
        }

        currentStrokeRef.current = {
            points: [pt],
            color: selectedColor,
            width: selectedThickness * (imgNaturalSize.width / 1000 || 1),
        };
        redrawCanvas();
    };

    const handleDrawingPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (activeTool !== 'draw' || !currentStrokeRef.current) return;
        e.preventDefault();
        const pt = getCanvasCoordinates(e);
        if (!pt) return;

        currentStrokeRef.current.points.push(pt);
        redrawCanvas();
    };

    const handleDrawingPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (activeTool !== 'draw' || !currentStrokeRef.current) return;
        e.preventDefault();
        const finishedStroke = currentStrokeRef.current;
        currentStrokeRef.current = null;

        if (finishedStroke.points.length > 0) {
            setStrokes((prev) => [...prev, finishedStroke]);
        }
    };

    // Undo last stroke
    const handleUndo = () => {
        if (strokes.length === 0) return;
        triggerHaptic();
        setStrokes((prev) => prev.slice(0, -1));
    };

    // Clear all strokes
    const handleClearStrokes = () => {
        if (strokes.length === 0) return;
        triggerHaptic();
        setStrokes([]);
    };

    // CROP DRAGGING LOGIC (100% INDEPENDENT EDGES)
    const handleCropPointerDown = (handle: string, e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic();

        cropDragRef.current = {
            handle,
            startX: e.clientX,
            startY: e.clientY,
            initialCrop: { ...cropRect },
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (!cropDragRef.current || !canvasRef.current) return;
            const { handle, startX, startY, initialCrop } = cropDragRef.current;

            const rect = canvasRef.current.getBoundingClientRect();
            const scaleX = imgNaturalSize.width / rect.width;
            const scaleY = imgNaturalSize.height / rect.height;

            const dx = (ev.clientX - startX) * scaleX;
            const dy = (ev.clientY - startY) * scaleY;

            const MIN_DIM = 40; // minimum 40px crop
            const nw = imgNaturalSize.width;
            const nh = imgNaturalSize.height;

            let newX = initialCrop.x;
            let newY = initialCrop.y;
            let newW = initialCrop.width;
            let newH = initialCrop.height;

            // 1. Move Entire Box
            if (handle === 'move') {
                newX = Math.max(0, Math.min(nw - newW, initialCrop.x + dx));
                newY = Math.max(0, Math.min(nh - newH, initialCrop.y + dy));
            }

            // 2. Independent Top Edge (Changes ONLY top; bottom edge remains stationary)
            if (handle === 'top' || handle === 'tl' || handle === 'tr') {
                const bottomEdge = initialCrop.y + initialCrop.height;
                newY = Math.max(0, Math.min(bottomEdge - MIN_DIM, initialCrop.y + dy));
                newH = bottomEdge - newY;
            }

            // 3. Independent Bottom Edge (Changes ONLY bottom; top edge remains stationary)
            if (handle === 'bottom' || handle === 'bl' || handle === 'br') {
                newH = Math.max(MIN_DIM, Math.min(nh - newY, initialCrop.height + dy));
            }

            // 4. Independent Left Edge (Changes ONLY left; right edge remains stationary)
            if (handle === 'left' || handle === 'tl' || handle === 'bl') {
                const rightEdge = initialCrop.x + initialCrop.width;
                newX = Math.max(0, Math.min(rightEdge - MIN_DIM, initialCrop.x + dx));
                newW = rightEdge - newX;
            }

            // 5. Independent Right Edge (Changes ONLY right; left edge remains stationary)
            if (handle === 'right' || handle === 'tr' || handle === 'br') {
                newW = Math.max(MIN_DIM, Math.min(nw - newX, initialCrop.width + dx));
            }

            setCropRect({
                x: Math.round(newX),
                y: Math.round(newY),
                width: Math.round(newW),
                height: Math.round(newH),
            });
        };

        const onPointerUp = () => {
            cropDragRef.current = null;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    // Keyboard Shortcuts: Esc to cancel, Ctrl+Z to undo
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                handleUndo();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [strokes, onCancel]);

    // Handle Send Action
    const handleSend = async () => {
        triggerHaptic();

        // 1. If not drawn AND not cropped, send raw file directly (preserves 100% original quality)
        const hasDrawn = strokes.length > 0;
        if (!hasDrawn && !isCropped) {
            onSend(imageFile);
            return;
        }

        // 2. Otherwise, export cropped & drawn canvas
        if (!imgElement || !canvasRef.current) {
            onSend(imageFile);
            return;
        }

        const targetW = Math.round(cropRect.width > 0 ? cropRect.width : imgNaturalSize.width);
        const targetH = Math.round(cropRect.height > 0 ? cropRect.height : imgNaturalSize.height);
        const sourceX = Math.round(cropRect.x);
        const sourceY = Math.round(cropRect.y);

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = targetW;
        exportCanvas.height = targetH;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) {
            onSend(imageFile);
            return;
        }

        // Draw cropped section from base canvas
        ctx.drawImage(canvasRef.current, sourceX, sourceY, targetW, targetH, 0, 0, targetW, targetH);

        exportCanvas.toBlob(
            (blob) => {
                if (!blob) {
                    onSend(imageFile);
                    return;
                }
                const cleanName = imageFile.name.replace(/\.[^/.]+$/, '') + '.jpg';
                const finalFile = new File([blob], cleanName, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                });
                onSend(finalFile);
            },
            'image/jpeg',
            0.92,
        );
    };

    const formattedFileSize = (imageFile.size / (1024 * 1024)).toFixed(1);

    // Compute screen coordinates for crop overlay
    const scaleToDisplayX = canvasDisplaySize.width / (imgNaturalSize.width || 1);
    const scaleToDisplayY = canvasDisplaySize.height / (imgNaturalSize.height || 1);

    const screenCrop = {
        left: cropRect.x * scaleToDisplayX,
        top: cropRect.y * scaleToDisplayY,
        width: cropRect.width * scaleToDisplayX,
        height: cropRect.height * scaleToDisplayY,
    };

    const modalContent = (
        <div className="image-editor-overlay" role="dialog" aria-modal="true">
            {/* Top Bar */}
            <div className="image-editor-header">
                <div className="image-editor-header__right">
                    <button
                        className="image-editor-icon-btn"
                        onClick={onCancel}
                        title="انصراف (Esc)"
                        aria-label="Close image preview"
                    >
                        <X size={20} />
                    </button>
                    <div className="image-editor-header__info">
                        <span className="image-editor-header__title">{imageFile.name}</span>
                        {imgNaturalSize.width > 0 && (
                            <span className="image-editor-header__meta">
                                {toPersianDigits(Math.round(cropRect.width))} × {toPersianDigits(Math.round(cropRect.height))} •{' '}
                                {toPersianDigits(formattedFileSize)} MB
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Canvas Viewport */}
            <div className="image-editor-body">
                <div className="image-editor-canvas-stage" ref={stageRef}>
                    <canvas
                        ref={canvasRef}
                        className={`image-editor-canvas ${activeTool === 'draw' ? 'image-editor-canvas--drawable' : ''}`}
                        onPointerDown={handleDrawingPointerDown}
                        onPointerMove={handleDrawingPointerMove}
                        onPointerUp={handleDrawingPointerUp}
                        onPointerCancel={handleDrawingPointerUp}
                    />

                    {/* CROP OVERLAY (Only interactive when activeTool === 'crop', purely visual & non-blocking otherwise) */}
                    {(activeTool === 'crop' || isCropped) && canvasDisplaySize.width > 0 && (
                        <div
                            className="image-editor-crop-overlay"
                            style={{ pointerEvents: activeTool === 'crop' ? 'auto' : 'none' }}
                        >
                            {/* Dark Shading Outside Crop Box */}
                            <div
                                className="image-editor-crop-shade"
                                style={{
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: `${screenCrop.top}px`,
                                    pointerEvents: activeTool === 'crop' ? 'auto' : 'none',
                                }}
                            />
                            <div
                                className="image-editor-crop-shade"
                                style={{
                                    top: `${screenCrop.top + screenCrop.height}px`,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    pointerEvents: activeTool === 'crop' ? 'auto' : 'none',
                                }}
                            />
                            <div
                                className="image-editor-crop-shade"
                                style={{
                                    top: `${screenCrop.top}px`,
                                    height: `${screenCrop.height}px`,
                                    left: 0,
                                    width: `${screenCrop.left}px`,
                                    pointerEvents: activeTool === 'crop' ? 'auto' : 'none',
                                }}
                            />
                            <div
                                className="image-editor-crop-shade"
                                style={{
                                    top: `${screenCrop.top}px`,
                                    height: `${screenCrop.height}px`,
                                    left: `${screenCrop.left + screenCrop.width}px`,
                                    right: 0,
                                    pointerEvents: activeTool === 'crop' ? 'auto' : 'none',
                                }}
                            />

                            {/* The Crop Box */}
                            <div
                                className={`image-editor-crop-box ${activeTool !== 'crop' ? 'image-editor-crop-box--passive' : ''}`}
                                style={{
                                    left: `${screenCrop.left}px`,
                                    top: `${screenCrop.top}px`,
                                    width: `${screenCrop.width}px`,
                                    height: `${screenCrop.height}px`,
                                    pointerEvents: activeTool === 'crop' ? 'auto' : 'none',
                                }}
                                onPointerDown={(e) => activeTool === 'crop' && handleCropPointerDown('move', e)}
                            >
                                {activeTool === 'crop' && (
                                    <>
                                        {/* Rule of Thirds Grid */}
                                        <div className="image-editor-crop-grid-h1" />
                                        <div className="image-editor-crop-grid-h2" />
                                        <div className="image-editor-crop-grid-v1" />
                                        <div className="image-editor-crop-grid-v2" />

                                        {/* 4 Independent Edge Handles */}
                                        <div
                                            className="image-editor-crop-edge image-editor-crop-edge--top"
                                            onPointerDown={(e) => handleCropPointerDown('top', e)}
                                        >
                                            <div className="image-editor-crop-edge-bar-h" />
                                        </div>
                                        <div
                                            className="image-editor-crop-edge image-editor-crop-edge--bottom"
                                            onPointerDown={(e) => handleCropPointerDown('bottom', e)}
                                        >
                                            <div className="image-editor-crop-edge-bar-h" />
                                        </div>
                                        <div
                                            className="image-editor-crop-edge image-editor-crop-edge--left"
                                            onPointerDown={(e) => handleCropPointerDown('left', e)}
                                        >
                                            <div className="image-editor-crop-edge-bar-v" />
                                        </div>
                                        <div
                                            className="image-editor-crop-edge image-editor-crop-edge--right"
                                            onPointerDown={(e) => handleCropPointerDown('right', e)}
                                        >
                                            <div className="image-editor-crop-edge-bar-v" />
                                        </div>

                                        {/* 4 Corner Handles */}
                                        <div
                                            className="image-editor-crop-corner image-editor-crop-corner--tl"
                                            onPointerDown={(e) => handleCropPointerDown('tl', e)}
                                        />
                                        <div
                                            className="image-editor-crop-corner image-editor-crop-corner--tr"
                                            onPointerDown={(e) => handleCropPointerDown('tr', e)}
                                        />
                                        <div
                                            className="image-editor-crop-corner image-editor-crop-corner--bl"
                                            onPointerDown={(e) => handleCropPointerDown('bl', e)}
                                        />
                                        <div
                                            className="image-editor-crop-corner image-editor-crop-corner--br"
                                            onPointerDown={(e) => handleCropPointerDown('br', e)}
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* UNIFIED TOOLBAR DIRECTLY UNDER THE IMAGE */}
                <div className="image-editor-sub-tools">
                    {/* Drawing Sub-dock (Colors & Thickness) */}
                    {activeTool === 'draw' && (
                        <div className="image-editor-draw-controls">
                            <div className="image-editor-colors">
                                {COLOR_PALETTE.map((c) => (
                                    <div
                                        key={c.value}
                                        className={`image-editor-color-circle ${selectedColor === c.value ? 'image-editor-color-circle--selected' : ''}`}
                                        style={{ backgroundColor: c.value }}
                                        onClick={() => {
                                            triggerHaptic();
                                            setSelectedColor(c.value);
                                        }}
                                        title={c.label}
                                    />
                                ))}
                            </div>

                            <div className="image-editor-divider" />

                            <div className="image-editor-thicknesses">
                                {THICKNESS_PRESETS.map((t) => (
                                    <button
                                        key={t.value}
                                        className={`image-editor-thickness-btn ${selectedThickness === t.value ? 'image-editor-thickness-btn--selected' : ''}`}
                                        onClick={() => {
                                            triggerHaptic();
                                            setSelectedThickness(t.value);
                                        }}
                                        title={t.label}
                                    >
                                        <span
                                            className="image-editor-thickness-dot"
                                            style={{
                                                width: `${t.dotSize}px`,
                                                height: `${t.dotSize}px`,
                                                backgroundColor: selectedColor,
                                            }}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Crop Sub-dock */}
                    {activeTool === 'crop' && (
                        <div className="image-editor-crop-controls">
                            <span className="image-editor-crop-tag">
                                {toPersianDigits(Math.round(cropRect.width))} × {toPersianDigits(Math.round(cropRect.height))}
                            </span>
                        </div>
                    )}

                    {/* Main Tools Dock */}
                    <div className="image-editor-tools-dock">
                        {/* Crop Button */}
                        <button
                            className={`image-editor-icon-btn ${activeTool === 'crop' ? 'image-editor-icon-btn--active' : ''}`}
                            onClick={() => {
                                triggerHaptic();
                                setActiveTool((prev) => (prev === 'crop' ? 'none' : 'crop'));
                            }}
                            title="کراپ و برش کادر عکس"
                        >
                            <Crop size={18} />
                        </button>

                        {/* Brush Button */}
                        <button
                            className={`image-editor-icon-btn ${activeTool === 'draw' ? 'image-editor-icon-btn--active' : ''}`}
                            onClick={() => {
                                triggerHaptic();
                                setActiveTool((prev) => (prev === 'draw' ? 'none' : 'draw'));
                            }}
                            title="قلم نقاشی روی عکس"
                        >
                            <Paintbrush size={18} />
                        </button>

                        <div className="image-editor-divider" />

                        {/* Undo */}
                        <button
                            className="image-editor-icon-btn"
                            onClick={handleUndo}
                            disabled={strokes.length === 0}
                            title="واگرد حرکت آخر (Ctrl+Z)"
                        >
                            <RotateCcw size={18} />
                        </button>

                        {/* Clear All Drawing */}
                        <button
                            className="image-editor-icon-btn"
                            onClick={handleClearStrokes}
                            disabled={strokes.length === 0}
                            title="پاکسازی تمام نقاشی‌ها"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="image-editor-bottom-bar">
                <div className="image-editor-actions-group">
                    {/* In RTL: First is on the RIGHT */}
                    <button className="image-editor-send-btn" onClick={handleSend} title="ارسال عکس">
                        <span>ارسال</span>
                        <Send size={16} />
                    </button>

                    {/* In RTL: Second is on the LEFT of Send */}
                    <button className="image-editor-cancel-btn" onClick={onCancel} title="انصراف و بستن">
                        <X size={16} />
                        <span>انصراف</span>
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
