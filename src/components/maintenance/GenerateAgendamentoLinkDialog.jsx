import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Copy, MessageCircle, Loader2, Check, Link2 } from "lucide-react";

export default function GenerateAgendamentoLinkDialog({ open, onOpenChange, equipment }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !equipment) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const user = await base44.auth.me().catch(() => null);
        const client = await base44.entities.Client.get(equipment.client_id).catch(() => null);
        const token = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random());
        const ag = await base44.entities.Agendamento.create({
          token,
          client_id: equipment.client_id,
          client_name: equipment.client_name || client?.name || "",
          client_phone: client?.phone1 || client?.phone2 || "",
          equipment_id: equipment.id,
          equipment_code: equipment.patrimony_code || equipment.code || "",
          purifier_model: equipment.product_name || [equipment.brand, equipment.model].filter(Boolean).join(" · "),
          seller_id: user?.id || "",
          seller_name: user?.full_name || "",
          status: "Pendente",
        });
        if (cancelled) return;
        const origin = typeof window !== "undefined" ? window.location.origin : "https://brazon-flow-erp.base44.app";
        setLink(`${origin}/agendar-refil/${token}`);
        setPhone((client?.phone1 || client?.phone2 || "").replace(/\D/g, ""));
      } catch (err) {
        toast({ title: "Erro ao gerar link", description: err?.message, variant: "destructive" });
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, equipment]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copiado!" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const openWhats = () => {
    const msg = `Olá${equipment?.client_name ? `, ${equipment.client_name.split(" ")[0]}` : ""}! 👋\n\nEstá na hora de trocar o refil do seu purificador${equipment?.product_name ? ` ${equipment.product_name}` : ""}.\n\nAgende o melhor dia e horário para a visita do técnico clicando no link abaixo:\n\n${link}\n\n— Brazon`;
    const num = phone ? `55${phone}` : "";
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Link de Agendamento</DialogTitle>
          <DialogDescription>
            Envie este link ao cliente pelo WhatsApp. Ele mesmo escolhe o dia e o período da troca de refil.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Link de agendamento</label>
              <div className="flex gap-2">
                <Input readOnly value={link} className="text-xs font-mono" />
                <Button size="icon" variant="outline" onClick={copy} title="Copiar">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button className="w-full gap-2" onClick={openWhats}>
              <MessageCircle className="h-4 w-4" /> {phone ? "Abrir WhatsApp" : "Abrir WhatsApp (sem número)"}
            </Button>

            <p className="text-xs text-muted-foreground">
              O agendamento ficará como "Pendente" no Painel de Manutenções até o cliente marcar o horário.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}