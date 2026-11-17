// Funções já migradas. Cada entrada: nome usado em base44.functions.invoke -> módulo.
// O módulo exporta `default async (req: Request) => Response`.
// As funções originais estão em base44/functions/<nome>/entry.ts.
export const registry: Record<string, () => Promise<{ default: (req: Request) => Promise<Response> | Response }>> = {
};
