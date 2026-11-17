import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { downloadPdfFromBase64 } from "@/lib/downloadPdf";

/**
 * Histórico de Cartas de Correção (CC-e) da NF-e, com download do PDF de cada carta.
 * source: "os" (Ordem de Serviço) | "remessa"
 */
export default function CceHistory({ source, entityId, history }) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(null);

  if (!history?.length) return null;

  const download = async (index) => {
    setDownloading(index);
    try {
      const res = await base44.functions.invoke("downloadCce", { source, entity_id: entityId, cce_index: index });
      downloadPdfFromBase64(res.data.pdf_base64, res.data.filename);
    } catch (err) {
      toast({
        title: "Erro ao baixar carta de correção",
        description: err?.response?.data?.error || err?.message,
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="border-t pt-3">
      <p className="text-xs font-medium mb-2">Histórico de Cartas de Correção</p>
      <div className="space-y-2">
        {history.map((cce, i) => (
          <div key={i} className="text-xs bg-muted/30 rounded p-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-muted-foreground">{new Date(cce.date).toLocaleString("pt-BR")}</p>
              <p>{cce.correction}</p>
              {cce.protocol && <p className="text-muted-foreground font-mono mt-1">Protocolo: {cce.protocol}</p>}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(i)}
              disabled={downloading === i}
              className="gap-1 shrink-0"
            >
              {downloading === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Baixar PDF
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}