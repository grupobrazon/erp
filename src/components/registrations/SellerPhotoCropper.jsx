import React, { useRef, useState, useEffect } from "react";
import { Upload, Trash2, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const PREVIEW_SIZE = 256;

export default function SellerPhotoCropper({ photoUrl, onCropFile, onClear, inputId = "seller-photo-input" }) {
  const containerRef = useRef(null);
  const imgInstanceRef = useRef(null);
  const dragging = useRef(false);
  const [pendingUrl, setPendingUrl] = useState(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, r: 0 });
  const [previewUrl, setPreviewUrl] = useState(photoUrl || null);

  useEffect(() => { if (!pendingUrl) setPreviewUrl(photoUrl || null); }, [photoUrl]);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgInstanceRef.current = img;
      const maxW = 320;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setDisplay({ w: dw, h: dh });
      const r = Math.min(dw, dh) / 3;
      setCrop({ x: dw / 2, y: dh / 2, r });
      setPendingUrl(url);
    };
    img.src = url;
  };

  const relPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onPointerDown = (e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); };
  const onPointerMove = (e) => { if (dragging.current) move(e); };
  const onPointerUp = () => { dragging.current = false; };
  const move = (e) => {
    const { x, y } = relPos(e);
    setCrop(p => ({ ...p, x: Math.max(p.r, Math.min(display.w - p.r, x)), y: Math.max(p.r, Math.min(display.h - p.r, y)) }));
  };

  const confirmCrop = () => {
    const img = imgInstanceRef.current;
    if (!img) return;
    const scale = natural.w / display.w;
    const sx = (crop.x - crop.r) * scale;
    const sy = (crop.y - crop.r) * scale;
    const sSize = crop.r * 2 * scale;
    const canvas = document.createElement("canvas");
    canvas.width = PREVIEW_SIZE; canvas.height = PREVIEW_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    canvas.toBlob((blob) => {
      const file = new File([blob], "seller-photo.jpg", { type: "image/jpeg" });
      setPreviewUrl(URL.createObjectURL(blob));
      onCropFile(file);
      setPendingUrl(null);
    }, "image/jpeg", 0.9);
  };

  const clearAll = () => { setPendingUrl(null); setPreviewUrl(null); onClear(); };
  const maxR = Math.min(display.w, display.h) / 2;

  return (
    <div className="space-y-3">
      {pendingUrl ? (
        <div className="flex flex-wrap items-start gap-4">
          <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative touch-none cursor-move select-none"
            style={{ width: display.w, height: display.h }}
          >
            <img src={pendingUrl} alt="" className="block w-full h-full object-cover rounded-md" />
            <div
              className="absolute pointer-events-none rounded-full border-2 border-white"
              style={{
                left: crop.x - crop.r, top: crop.y - crop.r,
                width: crop.r * 2, height: crop.r * 2,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)"
              }}
            />
          </div>
          <div className="space-y-3 min-w-[180px]">
            <div className="flex flex-col items-center gap-1">
              <div className="h-20 w-20 rounded-full overflow-hidden bg-muted border">
                {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : <User className="h-8 w-8 m-auto mt-5 text-muted-foreground" />}
              </div>
              <span className="text-xs text-muted-foreground">Prévia</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tamanho do recorte</label>
              <input type="range" min={30} max={Math.floor(maxR)} value={crop.r}
                onChange={e => { const r = Number(e.target.value); setCrop(p => ({ x: Math.max(r, Math.min(display.w - r, p.x)), y: Math.max(r, Math.min(display.h - r, p.y)), r })); }}
                className="w-full" />
            </div>
            <Button type="button" size="sm" onClick={confirmCrop} className="w-full gap-2"><Check className="h-4 w-4" /> Confirmar recorte</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-full overflow-hidden bg-muted border flex items-center justify-center">
            {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : <User className="h-8 w-8 text-muted-foreground" />}
          </div>
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => document.getElementById(inputId).click()}>
              <Upload className="h-4 w-4" /> {previewUrl ? "Trocar foto" : "Enviar foto"}
            </Button>
            {previewUrl && (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-destructive" onClick={clearAll}>
                <Trash2 className="h-4 w-4" /> Remover
              </Button>
            )}
            <input id={inputId} type="file" accept="image/*" className="hidden" onChange={onFile} />
          </div>
        </div>
      )}
    </div>
  );
}