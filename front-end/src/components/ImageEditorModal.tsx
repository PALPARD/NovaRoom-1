import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import { Paintbrush, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { toPersianDigits } from '../utils/format';
import { triggerHaptic } from '../utils/haptics';
import './ImageEditorModal.css';

export type ImageSizePreset = 'original' | '1080p' | '720p';

export interface ImageEditorModalProps {
    imageFile: File;
    onSend: (fileToSend: File) => void;
    onCancel: () => void;
}

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

const COLOR_PALETTE = [
    { label: 'سفید', value: '#ffffff' },
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

    // Mode: 'preview' (default, just preview and send) vs 'draw' (drawing tool active)
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [selectedColor, setSelectedColor] = useState<string>('#ef4444');
    const [selectedThickness, setSelectedThickness] = useState<number>(10);
    const [sizePreset, setSizePreset] = useState<ImageSizePreset>('original');

    // Drawing state
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Load Image
    useEffect(() => {
        const objectUrl = URL.createObjectURL(imageFile);
        const img = new Image();
        img.onload = () => {
            setImgElement(img);
            setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
            setImageLoaded(true);
        };
        img.src = objectUrl;

        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [imageFile]);

    // Redraw Canvas
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
    }, [imgElement, imgNaturalSize, strokes]);

    useEffect(() => {
        if (imageLoaded) {
            redrawCanvas();
        }
    }, [imageLoaded, redrawCanvas]);

    // Convert screen coordinates to canvas coordinates
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

    // Pointer event handlers for drawing
    const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingMode) return;
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

    const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingMode || !currentStrokeRef.current) return;
        e.preventDefault();
        const pt = getCanvasCoordinates(e);
        if (!pt) return;

        currentStrokeRef.current.points.push(pt);
        redrawCanvas();
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingMode || !currentStrokeRef.current) return;
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
    const handleClear = () => {
        if (strokes.length === 0) return;
        triggerHaptic();
        setStrokes([]);
    };

    // Toggle drawing mode
    const toggleDrawingMode = () => {
        triggerHaptic();
        setIsDrawingMode((prev) => !prev);
    };

    // Keyboard Shortcuts: Esc to close, Ctrl+Z to undo
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

        // 1. If not edited and size is original, send raw file directly (preserves 100% original quality)
        const hasDrawn = strokes.length > 0;
        if (!hasDrawn && sizePreset === 'original') {
            onSend(imageFile);
            return;
        }

        // 2. Otherwise, export canvas at target preset dimensions
        if (!imgElement || !canvasRef.current) {
            onSend(imageFile);
            return;
        }

        let targetWidth = imgNaturalSize.width;
        let targetHeight = imgNaturalSize.height;

        if (sizePreset === '1080p') {
            const maxDim = 1080;
            if (targetWidth > maxDim || targetHeight > maxDim) {
                if (targetWidth > targetHeight) {
                    targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
                    targetWidth = maxDim;
                } else {
                    targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
                    targetHeight = maxDim;
                }
            }
        } else if (sizePreset === '720p') {
            const maxDim = 720;
            if (targetWidth > maxDim || targetHeight > maxDim) {
                if (targetWidth > targetHeight) {
                    targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
                    targetWidth = maxDim;
                } else {
                    targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
                    targetHeight = maxDim;
                }
            }
        }

        // Create export canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = targetWidth;
        exportCanvas.height = targetHeight;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) {
            onSend(imageFile);
            return;
        }

        // Draw current full canvas onto export canvas
        ctx.drawImage(canvasRef.current, 0, 0, targetWidth, targetHeight);

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

    return (
        <div className="image-editor-overlay" role="dialog" aria-modal="true">
            {/* Top Bar */}
            <div className="image-editor-header">
                <div className="image-editor-header__right">
                    <button
                        className="image-editor-btn"
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
                                {toPersianDigits(imgNaturalSize.width)} × {toPersianDigits(imgNaturalSize.height)} •{' '}
                                {toPersianDigits(formattedFileSize)} MB
                            </span>
                        )}
                    </div>
                </div>

                <div className="image-editor-header__left">
                    {/* Brush Toggle Button */}
                    <button
                        className={`image-editor-btn ${isDrawingMode ? 'image-editor-btn--active' : ''}`}
                        onClick={toggleDrawingMode}
                        title={isDrawingMode ? 'خروج از حالت نقاشی' : 'نقاشی روی عکس'}
                    >
                        <Paintbrush size={18} />
                    </button>

                    {/* Undo */}
                    <button
                        className="image-editor-btn"
                        onClick={handleUndo}
                        disabled={strokes.length === 0}
                        title="بازگشت حرکت آخر (Ctrl+Z)"
                    >
                        <RotateCcw size={18} />
                    </button>

                    {/* Clear All */}
                    <button
                        className="image-editor-btn"
                        onClick={handleClear}
                        disabled={strokes.length === 0}
                        title="پاک کردن همه خطوط"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Canvas Viewport */}
            <div className="image-editor-body" ref={containerRef}>
                <div className="image-editor-canvas-container">
                    <canvas
                        ref={canvasRef}
                        className={`image-editor-canvas ${isDrawingMode ? 'image-editor-canvas--drawable' : ''}`}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                    />
                </div>
            </div>

            {/* Floating Drawing Toolbar (visible only in drawing mode) */}
            {isDrawingMode && (
                <div className="image-editor-drawing-bar">
                    {/* Colors */}
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

                    {/* Thickness Presets */}
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

            {/* Bottom Bar */}
            <div className="image-editor-bottom-bar">
                {/* Size / Quality Presets */}
                <div className="image-editor-bottom-bar__right">
                    <div className="image-editor-size-pills">
                        <button
                            className={`image-editor-size-pill ${sizePreset === 'original' ? 'image-editor-size-pill--active' : ''}`}
                            onClick={() => {
                                triggerHaptic();
                                setSizePreset('original');
                            }}
                        >
                            اصلی
                        </button>
                        <button
                            className={`image-editor-size-pill ${sizePreset === '1080p' ? 'image-editor-size-pill--active' : ''}`}
                            onClick={() => {
                                triggerHaptic();
                                setSizePreset('1080p');
                            }}
                        >
                            ۱۰۸۰p
                        </button>
                        <button
                            className={`image-editor-size-pill ${sizePreset === '720p' ? 'image-editor-size-pill--active' : ''}`}
                            onClick={() => {
                                triggerHaptic();
                                setSizePreset('720p');
                            }}
                        >
                            ۷۲۰p
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div className="image-editor-bottom-bar__left">
                    <button className="image-editor-cancel-btn" onClick={onCancel}>
                        انصراف
                    </button>
                    <button className="image-editor-send-btn" onClick={handleSend}>
                        <span>ارسال</span>
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
