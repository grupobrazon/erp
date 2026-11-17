import React, { useState, useEffect, useRef, useCallback } from "react";
import { ScanLine, Camera, CameraOff, Check, X, Package, PackageCheck, AlertCircle, Keyboard, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

/**
 * Diálogo de digitalização de romaneio.
 * Usa a câmera do celular para ler códigos de barras das etiquetas (rastreios)
 * e seleciona automaticamente as OS cujos volumes correspondem aos códigos lidos.
 *
 * @param {boolean} open - controla abertura do diálogo
 * @param {function} onClose - fecha o diálogo
 * @param {array} orders - lista de OS pendentes (com melhor_envio_labels)
 * @param {function} onConfirm - callbackrecebe Set de IDs de OS correspondentes
 */
export default function ScanRomaneioDialog({ open, onClose, orders = [], onConfirm }) {
  const [scannedCodes, setScannedCodes] = useState([]);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [starting, setStarting] = useState(false);
  const scannerRef = useRef(null);
  const containerRef = useRef(null);
  const lastScanRef = useRef({ code: "", time: 0 });
  const { toast } = useToast();

  // Mapa de rastreio → OS para matching rápido
  const trackingMap = React.useMemo(() => {
    const map = new Map();
    for (const os of orders) {
      const labels = os.melhor_envio_labels || [];
      for (const lbl of labels) {
        if (lbl.tracking_code) {
          map.set(lbl.tracking_code.toLowerCase(), os.id);
        }
      }
      if (os.tracking_code) {
        map.set(os.tracking_code.toLowerCase(), os.id);
      }
    }
    return map;
  }, [orders]);

  // IDs de OS que já foram encontrados pelos códigos escaneados
  const matchedOsIds = React.useMemo(() => {
    const ids = new Set();
    for (const entry of scannedCodes) {
      if (entry.matchedOsId) ids.add(entry.matchedOsId);
    }
    return ids;
  }, [scannedCodes]);

  const addScannedCode = useCallback(
    (rawCode) => {
      const code = rawCode.trim();
      if (!code) return;

      // Dedupe: evita leitura duplicada do mesmo código em menos de 2s
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.time < 2000) return;
      lastScanRef.current = { code, time: now };

      // Verifica se já foi escaneado
      setScannedCodes((prev) => {
        if (prev.some((e) => e.code === code)) return prev;
        const matchedOsId = trackingMap.get(code.toLowerCase());
        return [...prev, { code, matchedOsId: matchedOsId || null, scannedAt: new Date().toISOString() }];
      });
    },
    [trackingMap]
  );

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        // ignore
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError(null);
    setStarting(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '<div id="qr-reader" style="width:100%;"></div>';

      const scanner = new Html5Qrcode("qr-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
        ],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 180 },
          aspectRatio: 1.4,
        },
        (decodedText) => addScannedCode(decodedText),
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setCameraError(
        err?.message || "Não foi possível acessar a câmera. Verifique as permissões do navegador."
      );
    } finally {
      setStarting(false);
    }
  }, [addScannedCode]);

  // Inicia a câmera ao abrir o diálogo
  useEffect(() => {
    if (open) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => stopScanner();
  }, [open, startScanner, stopScanner]);

  // Limpa ao fechar
  const handleClose = () => {
    stopScanner();
    setScannedCodes([]);
    setManualCode("");
    onClose();
  };

  const handleManualAdd = () => {
    if (!manualCode.trim()) return;
    addScannedCode(manualCode);
    setManualCode("");
  };

  const handleRemoveCode = (code) => {
    setScannedCodes((prev) => prev.filter((e) => e.code !== code));
  };

  const handleClearAll = () => {
    setScannedCodes([]);
  };

  const handleConfirm = () => {
    if (matchedOsIds.size === 0) {
      toast({
        title: "Nenhuma OS correspondente",
        description: "Os códigos escaneados não coincidem com os rastreios das OS pendentes.",
        variant: "destructive",
      });
      return;
    }
    onConfirm(matchedOsIds);
    stopScanner();
    setScannedCodes([]);
    setManualCode("");
  };

  const matchedCount = scannedCodes.filter((e) => e.matchedOsId).length;
  const unmatchedCount = scannedCodes.length - matchedCount;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-sky-600" />
            Digitalizar Romaneio
          </DialogTitle>
        </DialogHeader>

        {/* Área da câmera */}
        <div className="space-y-3">
          <div
            ref={containerRef}
            className="relative rounded-lg overflow-hidden bg-slate-900 border-2 border-slate-200"
            style={{ minHeight: scanning ? "auto" : "220px" }}
          >
            {!scanning && !starting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                <CameraOff className="h-10 w-10" />
                <span className="text-sm">Câmera desligada</span>
              </div>
            )}
            {starting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm">Iniciando câmera...</span>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Controles da câmera */}
          <div className="flex gap-2">
            {!scanning ? (
              <Button onClick={startScanner} disabled={starting} variant="outline" size="sm" className="gap-2">
                <Camera className="h-4 w-4" />
                {starting ? "Iniciando..." : "Ligar Câmera"}
              </Button>
            ) : (
              <Button onClick={stopScanner} variant="outline" size="sm" className="gap-2">
                <CameraOff className="h-4 w-4" />
                Desligar Câmera
              </Button>
            )}
            {scanning && (
              <Badge variant="secondary" className="gap-1.5 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Escaneando...
              </Badge>
            )}
          </div>

          {/* Entrada manual */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Digite o código de rastreio manualmente..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualAdd()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleManualAdd} disabled={!manualCode.trim()} size="sm">
              Adicionar
            </Button>
          </div>

          {/* Resumo */}
          {scannedCodes.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="gap-1.5 bg-emerald-100 text-emerald-700 border-emerald-200">
                <PackageCheck className="h-3.5 w-3.5" />
                {matchedCount} OS encontrada(s)
              </Badge>
              {unmatchedCount > 0 && (
                <Badge className="gap-1.5 bg-amber-100 text-amber-700 border-amber-200">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {unmatchedCount} sem correspondência
                </Badge>
              )}
              <Badge variant="outline" className="gap-1.5">
                <Package className="h-3.5 w-3.5" />
                {scannedCodes.length} código(s) lido(s)
              </Badge>
              <Button onClick={handleClearAll} variant="ghost" size="sm" className="gap-1.5 text-red-600 ml-auto">
                <Trash2 className="h-3.5 w-3.5" />
                Limpar tudo
              </Button>
            </div>
          )}

          {/* Lista de códigos escaneados */}
          {scannedCodes.length > 0 && (
            <div className="rounded-lg border max-h-[260px] overflow-y-auto">
              {scannedCodes.map((entry, idx) => {
                const os = orders.find((o) => o.id === entry.matchedOsId);
                return (
                  <div
                    key={entry.code}
                    className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 ${
                      entry.matchedOsId ? "bg-emerald-50/40" : "bg-amber-50/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-medium truncate">{entry.code}</div>
                      {entry.matchedOsId ? (
                        <div className="text-xs text-emerald-700 truncate">
                          {os?.code} — {os?.client_name} ({os?.delivery_address?.city}/{os?.delivery_address?.state})
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700">Código não encontrado nas OS pendentes</div>
                      )}
                    </div>
                    {entry.matchedOsId ? (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    <Button
                      onClick={() => handleRemoveCode(entry.code)}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {scannedCodes.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">
              Aponte a câmera para o código de barras da etiqueta ou digite o rastreio manualmente.
              <br />
              As OS correspondentes serão selecionadas automaticamente.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={matchedOsIds.size === 0} className="gap-2">
            <Check className="h-4 w-4" />
            Selecionar {matchedOsIds.size} OS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}