// Integração Core.extractDataFromUploadedFile chamada pelo navegador (base44.integrations.Core).
// Só para usuários liberados no ERP; a lógica fica em server/integrations.ts.
import { createClientFromRequest } from "../b44.ts";
import { extractDataFromUploadedFile } from "../integrations.ts";

export default async function handler(req: Request) {
  const base44 = createClientFromRequest(req);
  await base44.auth.me();
  const params = await req.json().catch(() => ({}));
  return Response.json(await extractDataFromUploadedFile(params));
}
