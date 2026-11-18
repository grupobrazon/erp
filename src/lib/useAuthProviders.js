import { useEffect, useState } from "react";

// Lê no Supabase quais formas de login estão ligadas (Google, Microsoft…).
// Assim o botão aparece sozinho quando o provedor é ativado no painel, sem nova publicação.
let cache = null;

export function useAuthProviders() {
  const [providers, setProviders] = useState(cache || {});
  useEffect(() => {
    if (cache) return;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.external) return;
        cache = d.external;
        setProviders(cache);
      })
      .catch(() => {});
  }, []);
  return providers;
}
