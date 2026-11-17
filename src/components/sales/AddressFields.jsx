import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AddressFields({ address, onChange, disabled, required }) {
  const update = (field, value) => onChange({ ...address, [field]: value });
  const cls = disabled ? "bg-muted" : "";
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label className="text-xs">CEP</Label>
          <Input value={address?.zip_code || ""} onChange={e => update("zip_code", e.target.value)} disabled={disabled} className={cls} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Logradouro</Label>
          <Input value={address?.street || ""} onChange={e => update("street", e.target.value)} disabled={disabled} className={cls} />
        </div>
        <div>
          <Label className="text-xs">Número {required && "*"}</Label>
          <Input value={address?.number || ""} onChange={e => update("number", e.target.value)} disabled={disabled} className={cls} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-3">
        <div className="md:col-span-2">
          <Label className="text-xs">Complemento {required && "*"}</Label>
          <Input value={address?.complement || ""} onChange={e => update("complement", e.target.value)} disabled={disabled} className={cls} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Bairro</Label>
          <Input value={address?.neighborhood || ""} onChange={e => update("neighborhood", e.target.value)} disabled={disabled} className={cls} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        <div>
          <Label className="text-xs">Cidade</Label>
          <Input value={address?.city || ""} onChange={e => update("city", e.target.value)} disabled={disabled} className={cls} />
        </div>
        <div>
          <Label className="text-xs">UF</Label>
          <Input value={address?.state || ""} onChange={e => update("state", e.target.value)} maxLength={2} disabled={disabled} className={cls} />
        </div>
      </div>
    </>
  );
}