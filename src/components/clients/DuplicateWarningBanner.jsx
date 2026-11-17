import React from "react";
import { AlertTriangle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DuplicateWarningBanner({ conflicts = [], onConfirm, onDismiss, saving }) {
  if (!conflicts.length) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">Estes dados já aparecem em outro cadastro</p>
          <p className="text-amber-800">
            Confira antes de salvar para não criar um cliente duplicado. Se for outra pessoa mesmo, pode continuar.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {conflicts.map((conflict, index) => (
          <div key={`${conflict.field}-${index}`} className="rounded-lg border border-amber-200 bg-white/80 p-2.5">
            <p className="text-xs font-semibold text-amber-900">
              {conflict.label}: <span className="font-normal">{conflict.value}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {conflict.clients.slice(0, 5).map((client) => (
                <li key={client.id} className="text-xs text-amber-900 flex items-center gap-1.5">
                  <UserCheck className="h-3 w-3 text-amber-600 shrink-0" />
                  <span>
                    {client.name}
                    {client.new_code ? ` · ${client.new_code}` : ""}
                    {client.old_code ? ` · antigo ${client.old_code}` : ""}
                    {client.city ? ` · ${client.city}/${client.state}` : ""}
                    {client.is_active === false ? " · inativo" : ""}
                  </span>
                </li>
              ))}
              {conflict.clients.length > 5 && (
                <li className="text-xs text-amber-700">+{conflict.clients.length - 5} outro(s) cadastro(s)</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
          Revisar cadastro
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {saving ? "Salvando..." : "Salvar mesmo assim"}
        </Button>
      </div>
    </div>
  );
}