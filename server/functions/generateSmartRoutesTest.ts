// Gerado de base44/functions/generateSmartRoutesTest/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (e) { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Invoke the main routing engine in test mode (all delivery OS regardless of status)
    const result = await base44.functions.invoke('generateSmartRoutes', {
      ...body,
      test_mode: true,
    });
    const data = result?.data ?? result;

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});