"use client";

import { useEffect, useRef, useState } from "react";

type Arrow = { startX: number; startY: number; endX: number; endY: number; normalized?: boolean };

interface ImageAnnotatorProps {
  imageUrl: string;
  existingArrows?: Arrow[];
  onClose: () => void;
  onSave: (imageDataUrl: string, arrows: Arrow[]) => void;
}

function drawArrow(ctx: CanvasRenderingContext2D, arrow: Arrow, width: number, height: number, sourceWidth = width, sourceHeight = height) {
  const scaleX = arrow.normalized ? width : width / sourceWidth;
  const scaleY = arrow.normalized ? height : height / sourceHeight;
  const startX = arrow.startX * scaleX;
  const startY = arrow.startY * scaleY;
  const endX = arrow.endX * scaleX;
  const endY = arrow.endY * scaleY;
  const angle = Math.atan2(endY - startY, endX - startX);
  const visualScale = width / sourceWidth;
  const headLength = 16 * visualScale;

  ctx.strokeStyle = "#e04444";
  ctx.lineWidth = Math.max(3 * visualScale, 2);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

export function ImageAnnotator({ imageUrl, existingArrows = [], onClose, onSave }: ImageAnnotatorProps) {
  const [arrows, setArrows] = useState<Arrow[]>(existingArrows);
  const [currentArrow, setCurrentArrow] = useState<Arrow | null>(null);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    arrows.forEach(arrow => drawArrow(ctx, arrow, canvas.width, canvas.height));
    if (currentArrow) drawArrow(ctx, currentArrow, canvas.width, canvas.height);
  };

  const sizeCanvas = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    canvas.width = image.clientWidth;
    canvas.height = image.clientHeight;
    redraw();
  };

  useEffect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [arrows, currentArrow]);

  const coordinates = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const finishDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !currentArrow) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const dx = currentArrow.endX - currentArrow.startX;
    const dy = currentArrow.endY - currentArrow.startY;
    if (Math.hypot(dx * event.currentTarget.clientWidth, dy * event.currentTarget.clientHeight) > 10) setArrows(previous => [...previous, currentArrow]);
    setDrawing(false);
    setCurrentArrow(null);
  };

  const save = () => {
    const image = imageRef.current;
    if (!image) return;
    const output = document.createElement("canvas");
    output.width = image.naturalWidth;
    output.height = image.naturalHeight;
    const ctx = output.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, output.width, output.height);
    const sourceWidth = canvasRef.current?.clientWidth || output.width;
    const sourceHeight = canvasRef.current?.clientHeight || output.height;
    arrows.forEach(arrow => drawArrow(ctx, arrow, output.width, output.height, sourceWidth, sourceHeight));
    const normalizedArrows = arrows.map(arrow => arrow.normalized ? arrow : {
      startX: arrow.startX / sourceWidth,
      startY: arrow.startY / sourceHeight,
      endX: arrow.endX / sourceWidth,
      endY: arrow.endY / sourceHeight,
      normalized: true,
    });
    onSave(output.toDataURL("image/jpeg", 0.92), normalizedArrows);
    onClose();
  };

  return <div className="annotator-overlay" role="dialog" aria-modal="true" dir="rtl">
    <div className="annotator-modal">
      <div className="annotator-header"><h3>کشیدن فلش روی تصویر</h3><button type="button" onClick={onClose} aria-label="بستن">×</button></div>
      <div className="annotator-canvas-container">
        <img ref={imageRef} src={imageUrl} alt="تصویر برای علامت‌گذاری" onLoad={sizeCanvas}/>
        <canvas ref={canvasRef} onPointerDown={event => { const point = coordinates(event); event.currentTarget.setPointerCapture(event.pointerId); setDrawing(true); setCurrentArrow({ startX: point.x, startY: point.y, endX: point.x, endY: point.y, normalized: true }); }} onPointerMove={event => { if (!drawing) return; const point = coordinates(event); setCurrentArrow(previous => previous ? { ...previous, endX: point.x, endY: point.y } : null); }} onPointerUp={finishDrawing} onPointerCancel={finishDrawing}/>
      </div>
      {arrows.length > 0 && <div className="arrow-list"><strong>فلش‌های تصویر</strong>{arrows.map((_, index) => <div key={index}><span>فلش {index + 1}</span><button type="button" onClick={() => setArrows(previous => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={`حذف فلش ${index + 1}`} title="حذف این فلش"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 16H6L5 6M10 11v6M14 11v6"/></svg></button></div>)}</div>}
      <div className="annotator-toolbar"><button type="button" className="secondary" onClick={() => setArrows(previous => previous.slice(0, -1))} disabled={!arrows.length}>بازگشت</button><button type="button" className="secondary" onClick={() => setArrows([])} disabled={!arrows.length}>حذف همه</button><button type="button" className="primary" onClick={save}>ذخیره تصویر نهایی</button></div>
    </div>
  </div>;
}
