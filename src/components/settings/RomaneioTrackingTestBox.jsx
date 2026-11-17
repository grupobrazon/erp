import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";

// Teste do aviso de rastreio: manda a mensagem real para o número informado, sem tocar em
// nenhum cliente nem no acompanhamento das OS.
export default function RomaneioTrackingTestBox() {
  const [phone, setPhone] = useState("");
  const [enviando, setEnviando] = useState(null);
  const [resultado, setResultado] = useState(null);

  const enviar = async (tipo) => {
    setEnviando(tipo);
    setResultado(null);
    try {
      const res = await base44.functions.invoke("sendRomaneioTracking", { mode: "test", phone, tipo });
      setResultado({ ...(res.data || { ok: false, motivo: "sem resposta do sistema" }), tipo });
    } catch (err) {
      setResultado({ ok: false, tipo, motivo: err?.message || "falha ao enviar o teste" });
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div>
        <p className="font-medium text-sm">Testar o aviso agora</p>
        <p className="text-xs text-muted-foreground">
          Envia a mensagem real de rastreio para o número abaixo, usando como exemplo a OS em transporte mais recente.
          Nenhum cliente recebe nada e nada é registrado no acompanhamento.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>WhatsApp de teste (com DDD)</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ex: 31999998888"
            className="min-w-[160px] flex-1"
          />
          <Button
            onClick={() => enviar("codigo")}
            disabled={!!enviando || !phone.trim()}
            variant="outline"
            className="gap-2 shrink-0"
          >
            <Send className="h-4 w-4" />
            {enviando === "codigo" ? "Enviando..." : "Testar aviso"}
          </Button>
          <Button
            onClick={() => enviar("pergunta")}
            disabled={!!enviando || !phone.trim()}
            variant="outline"
            className="gap-2 shrink-0"
          >
            <Send className="h-4 w-4" />
            {enviando === "pergunta" ? "Enviando..." : "Testar pergunta"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>Testar aviso</strong> manda o código de rastreio — a Meta só aceita mensagem livre se a pessoa falou
          com a Brazon nas últimas 24 horas, então mande um "oi" para o WhatsApp da empresa antes.{" "}
          <strong>Testar pergunta</strong> manda o modelo aprovado conversar_agora, que é o que o sistema usa quando a
          janela está fechada.
        </p>
      </div>

      {resultado && (
        <div className={`rounded-md p-3 text-xs ${resultado.ok ? "bg-green-50 text-green-900" : "bg-rose-50 text-rose-900"}`}>
          {resultado.ok ? (
            resultado.tipo === "pergunta" ? (
              <p className="font-medium">
                Modelo enviado para {phone} — o sistema usou o modelo {resultado.modelo}.
              </p>
            ) : (
              <>
                <p className="font-medium">
                  Mensagem enviada — exemplo da OS {resultado.os}
                  {resultado.codigos?.length ? ` (rastreio ${resultado.codigos.join(", ")})` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{resultado.mensagem}</p>
              </>
            )
          ) : (
            <p className="font-medium">
              Não foi possível enviar: {resultado.motivo || resultado.erro || "sem detalhes"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}