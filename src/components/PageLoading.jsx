import React from "react";

// Aparece enquanto o código de uma tela é baixado (só na primeira vez que ela abre).
export default function PageLoading() {
  return (
    <div role="status" aria-label="Carregando" className="flex min-h-[40vh] items-center justify-center">
      <div className="h-7 w-7 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}
