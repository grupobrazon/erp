import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { findClientConflicts } from '../../shared/clientDuplicates.ts';

// Validação de contatos do cadastro de cliente: avisa quando CPF/CNPJ, e-mail ou
// telefone já existem em outro cadastro. Nunca bloqueia — só devolve os candidatos.
export default async function (req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { conflicts } = await findClientConflicts(base44.asServiceRole.entities, {
      clientId: body.client_id || null,
      document: body.document || '',
      email: body.email || '',
      phones: Array.isArray(body.phones) ? body.phones : [],
    });

    return Response.json({ ok: true, conflicts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}