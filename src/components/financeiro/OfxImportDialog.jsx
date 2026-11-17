import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Loader2, ArrowDownCircle, ArrowUpCircle, CheckCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { parseOfx } from "@/lib/ofxParser";

export default function OfxImportDialog({ open, onOpenChange, bankAccountId, bankAccountName }) {
  const [parsed, setParsed] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const fileRef = useRef(null);
  const queryClient = useQueryClient();

  const reset = () => {
    setParsed([]);
    setFileName("");
    setError("");
    setImportedCount(0);
    setSkippedCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file) => {
    if (!file) return;
    setError("");
    setImportedCount(0);
    setSkippedCount(0);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const txs = parseOfx(e.target.result);
        if (txs.length === 0) {
          setError("Nenhuma transação encontrada no arquivo OFX.");
          setParsed([]);
        } else {
          setParsed(txs);
        }
      } catch (err) {
        setError("Erro ao ler o arquivo: " + (err?.message || "formato inválido."));
        setParsed([]);
      }
    };
    reader.onerror = () => setError("Falha ao ler o arquivo.");
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!bankAccountId || parsed.length === 0) return;
    setImporting(true);
    try {
      // Busca transações existentes para evitar duplicidade na reimportação
      const existing = await base44.entities.BankTransaction.filter({ bank_account_id: bankAccountId }, "-date", 500);
      const keyOf = (t) => `${t.date}|${t.amount}|${t.direction}|${t.description}`;
      const existingKeys = new Set(existing.map(keyOf));

      const toCreate = parsed
        .filter((t) => !existingKeys.has(keyOf(t)))
        .map((t) => ({
          bank_account_id: bankAccountId,
          bank_account_name: bankAccountName || "",
          date: t.date,
          amount: t.amount,
          direction: t.direction,
          description: t.description,
          source_type: "Importado",
        }));

      if (toCreate.length > 0) {
        await base44.entities.BankTransaction.bulkCreate(toCreate);
      }
      setImportedCount(toCreate.length);
      setSkippedCount(parsed.length - toCreate.length);
      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      setParsed([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError("Erro ao importar: " + (err?.message || "falha desconhecida."));
    } finally {
      setImporting(false);
    }
  };

  const totalEntradas = parsed.filter((t) => t.direction === "Entrada").reduce((s, t) => s + t.amount, 0);
  const totalSaidas = parsed.filter((t) => t.direction === "Saída").reduce((s, t) => s + t.amount, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Importar Extrato OFX
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {importedCount > 0 ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto" />
              <p className="text-lg font-medium">{importedCount} transação(ões) importada(s) com sucesso.</p>
              {skippedCount > 0 && (
                <p className="text-sm text-muted-foreground">{skippedCount} já existiam e foram ignoradas.</p>
              )}
              <p className="text-sm text-muted-foreground">As transações estão disponíveis na aba "A Conciliar".</p>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione o arquivo <strong>.ofx</strong> exportado pelo banco para a conta <strong>{bankAccountName || "—"}</strong>.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".ofx,.qfx"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" /> {fileName ? "Trocar arquivo" : "Escolher arquivo"}
                </Button>
                {fileName && <p className="text-xs text-muted-foreground mt-2 truncate">{fileName}</p>}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {parsed.length > 0 && (
                <>
                  <div className="flex items-center gap-3 flex-wrap text-sm">
                    <Badge className="bg-emerald-100 text-emerald-700 border-transparent gap-1">
                      <ArrowDownCircle className="h-3 w-3" /> Entradas: R$ {totalEntradas.toFixed(2)}
                    </Badge>
                    <Badge className="bg-rose-100 text-rose-700 border-transparent gap-1">
                      <ArrowUpCircle className="h-3 w-3" /> Saídas: R$ {totalSaidas.toFixed(2)}
                    </Badge>
                    <span className="text-muted-foreground">{parsed.length} transação(ões) detectadas</span>
                  </div>
                  <div className="h-64 overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium">Data</th>
                          <th className="text-left p-2 font-medium">Descrição</th>
                          <th className="text-center p-2 font-medium">Dir.</th>
                          <th className="text-right p-2 font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.map((t, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2 font-mono text-xs whitespace-nowrap">{t.date}</td>
                            <td className="p-2 truncate max-w-xs">{t.description}</td>
                            <td className="p-2 text-center">
                              {t.direction === "Entrada"
                                ? <ArrowDownCircle className="h-4 w-4 text-emerald-600 inline" />
                                : <ArrowUpCircle className="h-4 w-4 text-rose-600 inline" />}
                            </td>
                            <td className={`p-2 text-right font-medium whitespace-nowrap ${t.direction === "Entrada" ? "text-emerald-600" : "text-rose-600"}`}>
                              R$ {t.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {importedCount === 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={parsed.length === 0 || importing || !bankAccountId} className="gap-2">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar{parsed.length > 0 ? ` ${parsed.length} transação(ões)` : ""}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}