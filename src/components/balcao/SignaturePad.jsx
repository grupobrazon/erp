import React, { useRef, useImperativeHandle, forwardRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, PenTool, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const SignaturePad = forwardRef(({ label = "Assinatura do cliente", locked = false, onClear, imageUrl }, ref) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [active, setActive] = useState(false);

  const ctx = () => canvasRef.current?.getContext("2d");

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };

  const start = (e) => {
    if (!active || locked) return;
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pos(e);
    const c = ctx();
    c.beginPath();
    c.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const c = ctx();
    c.lineTo(x, y);
    c.stroke();
    setHasInk(true);
  };
  const end = () => { drawing.current = false; };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const cctx = c.getContext("2d");
    if (!cctx) return;
    cctx.lineWidth = 2;
    cctx.lineCap = "round";
    cctx.strokeStyle = "#0f172a";
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, c.width, c.height);
  }, []);

  // Lock when parent says so
  useEffect(() => {
    if (locked) setActive(false);
  }, [locked]);

  const clear = () => {
    const c = canvasRef.current;
    const cctx = c.getContext("2d");
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
    if (!locked) setActive(true);
    onClear?.();
  };

  const finish = () => setActive(false);

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasInk,
    getBlob: () =>
      new Promise((resolve) =>
        canvasRef.current.toBlob((b) => resolve(b), "image/png")
      ),
    clear,
  }));

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium flex items-center gap-1.5">
        {label}
        {locked && hasInk && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-normal">
            <Lock className="h-3 w-3" /> bloqueada
          </span>
        )}
      </div>
      <div className="relative rounded-md border border-input bg-white overflow-hidden">
        {locked && imageUrl ? (
          <img src={imageUrl} alt={label} className="w-full h-[180px] object-contain" />
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={520}
              height={180}
              className={cn(
                "w-full h-[180px]",
                active && !locked ? "touch-none cursor-crosshair" : "pointer-events-none"
              )}
              onMouseDown={start}
              onMouseMove={move}
              onMouseUp={end}
              onMouseLeave={end}
              onTouchStart={start}
              onTouchMove={move}
              onTouchEnd={end}
            />
            {!active && !hasInk && !locked && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-muted-foreground">Toque em "Assinar" para desenhar</span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {!active && !locked && (
          <Button type="button" size="sm" onClick={() => setActive(true)}>
            <PenTool className="h-4 w-4" /> Assinar
          </Button>
        )}
        {active && !locked && (
          <Button type="button" size="sm" variant="default" onClick={finish}>
            <CheckCircle2 className="h-4 w-4" /> Concluir
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasInk}>
          <Eraser className="h-4 w-4" /> Limpar
        </Button>
      </div>
    </div>
  );
});

export default SignaturePad;