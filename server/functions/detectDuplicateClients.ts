// Gerado de base44/functions/detectDuplicateClients/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores' }, { status: 403 });

    // Pagina por TODOS os clientes e agrupa por nome normalizado
    const PAGE_SIZE = 500;
    const MAX_CLIENTS = 12000;
    const nameGroups = new Map(); // normalized_name -> [client, ...]
    let offset = 0;
    let totalLoaded = 0;

    while (totalLoaded < MAX_CLIENTS) {
      const batch = await base44.asServiceRole.entities.Client.list('-created_date', PAGE_SIZE, offset);
      if (!batch || batch.length === 0) break;

      for (const c of batch) {
        const norm = (c.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
        if (!norm) continue;
        if (!nameGroups.has(norm)) nameGroups.set(norm, []);
        nameGroups.get(norm).push(c);
      }

      totalLoaded += batch.length;
      offset += batch.length;
      if (batch.length < PAGE_SIZE) break;
    }

    // Normaliza telefone para comparação
    const normPhone = (raw) => {
      if (!raw) return null;
      let d = raw.replace(/\D/g, '');
      if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
      return d.length >= 8 ? d : null;
    };

    const collectPhones = (c) => {
      const phones = new Set();
      for (let i = 1; i <= 5; i++) {
        const p = normPhone(c[`phone${i}`]);
        if (p) phones.add(p);
      }
      for (let i = 1; i <= 7; i++) {
        const p = normPhone(c[`zoox_phone${i}`]);
        if (p) phones.add(p);
      }
      return [...phones];
    };

    // Filtra grupos com 2+ clientes de mesmo nome
    const duplicateGroups = [];
    for (const [normName, clients] of nameGroups) {
      if (clients.length < 2) continue;

      // Coleta telefones de cada cliente
      const withPhones = clients.map(c => ({
        id: c.id,
        new_code: c.new_code,
        old_code: c.old_code,
        name: c.name,
        person_type: c.person_type,
        city: c.city,
        state: c.state,
        is_active: c.is_active,
        phones: collectPhones(c),
      }));

      // Verifica se algum telefone é compartilhado entre dois clientes do grupo
      const allPhones = new Map(); // phone -> count
      for (const cl of withPhones) {
        for (const p of cl.phones) {
          allPhones.set(p, (allPhones.get(p) || 0) + 1);
        }
      }
      const sharedPhone = [...allPhones.values()].some(v => v > 1);

      duplicateGroups.push({
        normalized_name: normName,
        display_name: withPhones[0].name,
        client_count: withPhones.length,
        shares_phone: sharedPhone,
        clients: withPhones,
      });
    }

    // Ordena: grupos sem telefone compartilhado (potenciais duplicados reais) primeiro
    duplicateGroups.sort((a, b) => {
      if (a.shares_phone !== b.shares_phone) return a.shares_phone ? 1 : -1;
      return b.client_count - a.client_count;
    });

    return Response.json({
      summary: {
        total_clients_scanned: totalLoaded,
        total_same_name_groups: duplicateGroups.length,
        potential_duplicates: duplicateGroups.filter(g => !g.shares_phone).length,
        confirmed_duplicates: duplicateGroups.filter(g => g.shares_phone).length,
      },
      groups: duplicateGroups,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});