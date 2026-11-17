import React from "react";
import { AlertCircle, RotateCw } from "lucide-react";

// Proteção das páginas públicas (links de adesão, agendamento, expedição).
// Se algo inesperado falhar na tela, o cliente vê um aviso claro com opção de
// recarregar — nunca uma tela branca.
export default function PublicPageFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="text-center max-w-sm">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
        <p className="font-medium text-foreground mb-1">Não conseguimos abrir esta página agora.</p>
        <p className="text-sm text-muted-foreground mb-4">
          Toque em recarregar para tentar novamente. Se o problema continuar, fale com a nossa equipe.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <RotateCw className="h-4 w-4" /> Recarregar página
        </button>
      </div>
    </div>
  );
}