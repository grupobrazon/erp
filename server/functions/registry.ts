// Funções já migradas. Cada entrada: nome usado em base44.functions.invoke -> módulo.
// O módulo exporta `default async (req: Request) => Response`.
// As funções originais estão em base44/functions/<nome>/entry.ts.
type Handler = { default: (req: Request) => Promise<Response> | Response };

// Enquanto a Base44 for o sistema oficial, aqui só entram funções que LEEM dados.
// Funções que gravam ou falam com sistemas de fora (WhatsApp, NF-e, frete, discador)
// ficam na Base44 para não rodar em dobro.
function onlyActions(load: () => Promise<Handler>, allowed: string[]) {
  return async (): Promise<Handler> => {
    const mod = await load();
    return {
      default: async (req: Request) => {
        const body = await req.clone().json().catch(() => ({}));
        if (!allowed.includes(String(body?.action ?? ""))) {
          return Response.json({ error: "Esta ação ainda é feita na Base44 até a virada do sistema." }, { status: 409 });
        }
        return mod.default(req);
      },
    };
  };
}

export const registry: Record<string, () => Promise<Handler>> = {
  legacyLogin: () => import("./legacyLogin.ts"),
  // Painéis e consultas (somente leitura)
  getCommercialDashboard: () => import("./getCommercialDashboard.ts"),
  getCommercialDashboardSales: () => import("./getCommercialDashboardSales.ts"),
  getProductionDashboard: () => import("./getProductionDashboard.ts"),
  getRouteMapData: () => import("./getRouteMapData.ts"),
  checkClientDuplicates: () => import("./checkClientDuplicates.ts"),
  detectDuplicateClients: () => import("./detectDuplicateClients.ts"),
  findUnlinkedMaintenanceSales: () => import("./findUnlinkedMaintenanceSales.ts"),
  checkInvitation: () => import("./checkInvitation.ts"),
  alerts: onlyActions(() => import("./alerts.ts"), ["list"]),
};
