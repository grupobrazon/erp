import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, PhoneCall } from "lucide-react";

export default function ZooxPhonesSection({ form, update }) {
  const [open, setOpen] = useState(false);
  const filled = [1, 2, 3, 4, 5, 6, 7].filter(n => form[`zoox_phone${n}`]).length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-muted-foreground" />
          <span className="text-base font-semibold">Mailing / Contatos Antigos (Zoox)</span>
          {filled > 0 && (
            <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{filled}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-0">
          {[1, 2, 3, 4, 5, 6, 7].map(n => (
            <div key={n}>
              <Label>Telefone Zoox {n}</Label>
              <Input
                value={form[`zoox_phone${n}`] || ""}
                onChange={e => update(`zoox_phone${n}`, e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}