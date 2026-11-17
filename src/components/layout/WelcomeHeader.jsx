import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { User as UserIcon, Pencil, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

export default function WelcomeHeader() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const { data: seller } = useQuery({
    queryKey: ["seller", user?.seller_id],
    queryFn: async () => {
      const list = await base44.entities.Seller.filter({ id: user.seller_id });
      return list[0];
    },
    enabled: !!user?.seller_id,
  });

  const linkedToSeller = !!user?.seller_id;
  const photoUrl = user?.photo_url || seller?.photo_url;
  const canEdit = true;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.auth.updateMe({ photo_url: file_url });
      window.location.reload();
    } catch (err) {
      console.error("Erro ao enviar foto", err);
    } finally {
      setUploading(false);
    }
  };

  const displayName = user?.display_name || user?.full_name || "Usuário";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent mb-8">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white" />
        <div className="absolute -left-12 -bottom-12 w-40 h-40 rounded-full bg-white" />
      </div>
      <div className="relative flex items-center gap-5 p-6 md:p-8">
        <div className="relative shrink-0">
          <div className="h-20 w-20 md:h-24 md:w-24 rounded-full overflow-hidden bg-white/20 border-4 border-white/30 flex items-center justify-center shadow-lg">
            {photoUrl ? (
              <img src={photoUrl} alt={firstName} className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-10 w-10 text-white/80" />
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-white/90 transition-colors border-2 border-primary/10"
              title="Editar foto"
            >
              {uploading ? (
                <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : (
                <Camera className="h-4 w-4 text-primary" />
              )}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
        <div className="text-white">
          <p className="text-sm md:text-base text-white/80 font-medium">Olá, bem-vindo,</p>
          <h2 className="text-2xl md:text-3xl font-heading font-bold tracking-tight">{firstName} 👋</h2>
          {linkedToSeller && !user?.photo_url && (
            <p className="text-xs text-white/60 mt-1">Foto do vendedor — clique para personalizar</p>
          )}
        </div>
      </div>
    </div>
  );
}