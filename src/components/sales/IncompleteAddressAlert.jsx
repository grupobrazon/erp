import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Alerta obrigatório exibido na venda quando o endereço (vindo do cadastro do cliente
 * ou digitado) está sem Número e/ou Complemento. Bloqueia a conclusão da venda até
 * que o endereço seja completado.
 */
export default function IncompleteAddressAlert({ label, onFix }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-medium text-destructive">Endereço de {label} incompleto</p>
        <p className="text-xs text-muted-foreground">
          Está faltando o Número e/ou o Complemento. Atualize o endereço para poder concluir a venda.
        </p>
      </div>
      {onFix && (
        <Button type="button" size="sm" variant="destructive" onClick={onFix}>
          Atualizar endereço
        </Button>
      )}
    </div>
  );
}