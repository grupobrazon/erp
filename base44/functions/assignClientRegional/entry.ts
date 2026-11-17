import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Normalize: lowercase, remove accents, trim
function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// SP capital regionals (fixed spec) with reference neighborhoods for LLM context
const SP_REGIONALS = [
  { name: "SP – Centro", refs: "Sé, República, Bela Vista, Liberdade, Consolação, Santa Cecília, Bom Retiro, Cambuci" },
  { name: "SP – Oeste", refs: "Pinheiros, Jardins, Itaim Bibi, Alto de Pinheiros, Vila Madalena, Lapa, Perdizes, Vila Leopoldina, Butantã, Morumbi e bairros próximos" },
  { name: "SP – Norte 1", refs: "Santana, Tucuruvi, Vila Guilherme, Vila Maria, Jaçanã, Tremembé e bairros próximos" },
  { name: "SP – Norte 2", refs: "Casa Verde, Cachoeirinha, Freguesia do Ó, Brasilândia, Pirituba, Jaraguá, Perus, Anhanguera e bairros próximos" },
  { name: "SP – Sul 1", refs: "Vila Mariana, Moema, Saúde, Ipiranga, Sacomã, Jabaquara e bairros próximos" },
  { name: "SP – Sul 2", refs: "Santo Amaro, Campo Belo, Brooklin, Campo Limpo, Capão Redondo, Cidade Ademar, M'Boi Mirim, Capela do Socorro, Grajaú, Parelheiros e bairros próximos" },
  { name: "SP – Leste 1", refs: "Mooca, Tatuapé, Belém, Água Rasa, Vila Prudente, Penha, Carrão, Aricanduva, Sapopemba e bairros próximos" },
  { name: "SP – Leste 2", refs: "Itaquera, São Mateus, Cidade Tiradentes, Guaianases, São Miguel Paulista, Ermelino Matarazzo, Itaim Paulista e bairros próximos" },
];

// BH capital regionals (9 regional administrativas) with reference neighborhoods for LLM context
const BH_REGIONALS = [
  { name: "BH – Centro-Sul", refs: "Centro, Lourdes, Funcionários, Savassi, Anchieta, Carmo, Boa Viagem, São Pedro, Belvedere, Mangabeiras, Santa Lúcia, Cidade Jardim, Sion" },
  { name: "BH – Barreiro", refs: "Barreiro, Tijipio, Salgado Filho, Califórnia, Dias, Teixeiras, São Vicente, Cinco, Cardoso, Jatobá" },
  { name: "BH – Oeste", refs: "Prado, Gameleira, Carlos Prates, Padre Eustáquio, Bom Pastor, Nova Gameleira, Calafate, Gutierrez, Grajaú, Alto Barroca" },
  { name: "BH – Noroeste", refs: "Glória, Caiçara, São João Batista, Conjunto Santa Maria, Jardim Montanhês, Industrial, Pedro II" },
  { name: "BH – Norte", refs: "Aarão Reis, São Bernardo, Bonfim, São Tomás, Vila dos Montes, Nazaré, Mantiqueira" },
  { name: "BH – Venda Nova", refs: "Venda Nova, Floramar, Santa Mônica, Jardim Leblon, Pindorama, Cidade Nova, Tupi" },
  { name: "BH – Nordeste", refs: "São Benedito, São Caetano, Santa Cruz, São Vicente, Bonsucesso, São Gonçalo" },
  { name: "BH – Leste", refs: "Taquaril, São Geraldo, Santa Tereza, Lucas Teixeira, Santa Inês, Sagrada Família" },
  { name: "BH – Pampulha", refs: "Pampulha, São José, Bandeirantes, Ouro Preto, Castelo, Buritis, Jaraguá" },
];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: require admin when called from UI; allow workflow context (no user)
    let user = null;
    try { user = await base44.auth.me(); } catch (e) {}
    if (user && user.role !== "admin") {
      return Response.json({ error: "Apenas administradores" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dry_run;
    const clientId = body?.client_id || null;
    const onlyUnassigned = !!body?.only_unassigned;
    const filterCities: string[] = Array.isArray(body?.cities)
      ? body.cities.map((c: any) => String(c).trim()).filter(Boolean)
      : [];

    // Load RegionalMapping table → municipality(normalized) → regional
    const mappings = await base44.asServiceRole.entities.RegionalMapping.list("-created_date", 500);
    const mappingByCity: Record<string, string> = {};
    for (const m of mappings) {
      const key = normalize(m.municipality);
      if (key && m.regional) mappingByCity[key] = m.regional;
    }

    // Load clients
    let allClients: any[] = [];
    if (clientId) {
      const client = await base44.asServiceRole.entities.Client.get(clientId);
      if (client) allClients = [client];
    } else if (filterCities.length > 0) {
      // DB filter is exact-match and legacy data often stores city in uppercase
      // without accents (e.g. "SAO PAULO"), so include accent-stripped variants
      // alongside the accented ones in multiple cases.
      const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const variants = new Set<string>();
      for (const c of filterCities) {
        const stripped = stripAccents(c);
        for (const v of [c, stripped]) {
          variants.add(v);
          variants.add(v.toUpperCase());
          variants.add(v.toLowerCase());
          variants.add(v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());
        }
      }
      const cityList = Array.from(variants);
      let lastDate: string | null = null;
      while (true) {
        const query = lastDate
          ? { $and: [{ city: { $in: cityList } }, { created_date: { $lt: lastDate } }] }
          : { city: { $in: cityList } };
        const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 1000);
        if (!batch || batch.length === 0) break;
        allClients = allClients.concat(batch);
        lastDate = batch[batch.length - 1].created_date;
        if (batch.length < 1000) break;
      }
    } else if (onlyUnassigned) {
      let lastDate: string | null = null;
      while (true) {
        const query = lastDate
          ? { $and: [{ $or: [{ regional: "" }, { regional: "NÃO PARAMETRIZADA" }] }, { created_date: { $lt: lastDate } }] }
          : { $or: [{ regional: "" }, { regional: "NÃO PARAMETRIZADA" }] };
        const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 1000);
        if (!batch || batch.length === 0) break;
        allClients = allClients.concat(batch);
        lastDate = batch[batch.length - 1].created_date;
        if (batch.length < 1000) break;
      }
    } else {
      let lastDate: string | null = null;
      while (true) {
        const query = lastDate ? { created_date: { $lt: lastDate } } : {};
        const batch = await base44.asServiceRole.entities.Client.filter(query, "-created_date", 1000);
        if (!batch || batch.length === 0) break;
        allClients = allClients.concat(batch);
        lastDate = batch[batch.length - 1].created_date;
        if (batch.length < 1000) break;
      }
    }

    const stats = { total: allClients.length, assigned: 0, notParametrized: 0, spCapital: 0, spLlm: 0, bhCapital: 0, bhLlm: 0 };
    const updates: any[] = [];
    const spNeighborhoods: string[] = [];
    const spClientByNeighborhood: Map<string, any[]> = new Map();
    const bhNeighborhoods: string[] = [];
    const bhClientByNeighborhood: Map<string, any[]> = new Map();

    for (const client of allClients) {
      const cityNorm = normalize(client.city);
      const city = (client.city || "").trim();

      if (!city) {
        stats.notParametrized++;
        if (!dryRun) updates.push({ id: client.id, regional: "NÃO PARAMETRIZADA" });
        continue;
      }

      // SP capital → classify neighborhood into one of 8 regionals via LLM
      if (cityNorm === "sao paulo") {
        stats.spCapital++;
        const neighborhood = (client.neighborhood || "").trim();
        if (!neighborhood) {
          stats.notParametrized++;
          if (!dryRun) updates.push({ id: client.id, regional: "NÃO PARAMETRIZADA" });
          continue;
        }
        if (!spClientByNeighborhood.has(neighborhood)) {
          spClientByNeighborhood.set(neighborhood, []);
          spNeighborhoods.push(neighborhood);
        }
        spClientByNeighborhood.get(neighborhood).push(client);
        continue;
      }

      // BH capital → classify neighborhood into one of 9 regionals via LLM
      if (cityNorm === "belo horizonte") {
        stats.bhCapital++;
        const neighborhood = (client.neighborhood || "").trim();
        if (!neighborhood) {
          stats.notParametrized++;
          if (!dryRun) updates.push({ id: client.id, regional: "NÃO PARAMETRIZADA" });
          continue;
        }
        if (!bhClientByNeighborhood.has(neighborhood)) {
          bhClientByNeighborhood.set(neighborhood, []);
          bhNeighborhoods.push(neighborhood);
        }
        bhClientByNeighborhood.get(neighborhood).push(client);
        continue;
      }

      // Non-capital → municipality → regional table
      const regional = mappingByCity[cityNorm];
      if (regional) {
        stats.assigned++;
        if (!dryRun) updates.push({ id: client.id, regional });
      } else {
        stats.notParametrized++;
        if (!dryRun) updates.push({ id: client.id, regional: "NÃO PARAMETRIZADA" });
      }
    }

    // LLM classify SP capital neighborhoods in batches of 250
    const regionalByNeighborhood: Map<string, string> = new Map();
    for (let i = 0; i < spNeighborhoods.length; i += 250) {
      const batch = spNeighborhoods.slice(i, i + 250);
      const prompt = `Você é um especialista em geografia urbana de São Paulo (capital). Classifique cada bairro em uma das 8 Regionais de atendimento.

Bairros a classificar:
${batch.map((n, idx) => `${idx + 1}. ${n}`).join('\n')}

Regionais e suas áreas de referência:
${SP_REGIONALS.map((r, idx) => `${idx + 1}. ${r.name} — ${r.refs}`).join('\n')}

Regras:
- Classifique pelo nome do bairro e sua localização geográfica conhecida na cidade de São Paulo.
- Mesmo que o nome esteja em maiúsculas, abreviado ou com erro de digitação, identifique o bairro correto.
- Se o bairro não existir em São Paulo ou não se encaixar em nenhuma Regional, use "SEM REGIONAL".

Retorne um JSON onde a chave é o bairro EXATAMENTE como escrito na lista acima e o valor é o nome da Regional (exatamente como escrito na lista) ou "SEM REGIONAL".`;

      try {
        const resultStr = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          model: "gpt_5_mini"
        });
        const clean = String(resultStr).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(clean);
        for (const [neighborhood, regionalName] of Object.entries(result)) {
          if (regionalName && regionalName !== "SEM REGIONAL") {
            const valid = SP_REGIONALS.find(r => r.name === regionalName);
            if (valid) regionalByNeighborhood.set(neighborhood, regionalName);
          }
        }
      } catch (e) {}
    }

    // Apply SP capital classifications
    for (const [neighborhood, clients] of spClientByNeighborhood.entries()) {
      const regional = regionalByNeighborhood.get(neighborhood);
      for (const client of clients) {
        if (regional) {
          stats.assigned++;
          stats.spLlm++;
          if (!dryRun) updates.push({ id: client.id, regional });
        } else {
          stats.notParametrized++;
          if (!dryRun) updates.push({ id: client.id, regional: "NÃO PARAMETRIZADA" });
        }
      }
    }

    // LLM classify BH capital neighborhoods in batches of 250
    const bhRegionalByNeighborhood: Map<string, string> = new Map();
    for (let i = 0; i < bhNeighborhoods.length; i += 250) {
      const batch = bhNeighborhoods.slice(i, i + 250);
      const prompt = `Você é um especialista em geografia urbana de Belo Horizonte (capital). Classifique cada bairro em uma das 9 Regionais Administrativas de atendimento.

Bairros a classificar:
${batch.map((n, idx) => `${idx + 1}. ${n}`).join('\n')}

Regionais e suas áreas de referência:
${BH_REGIONALS.map((r, idx) => `${idx + 1}. ${r.name} — ${r.refs}`).join('\n')}

Regras:
- Classifique pelo nome do bairro e sua localização geográfica conhecida em Belo Horizonte.
- Mesmo que o nome esteja em maiúsculas, abreviado ou com erro de digitação, identifique o bairro correto.
- Se o bairro não existir em Belo Horizonte ou não se encaixar em nenhuma Regional, use "SEM REGIONAL".

Retorne um JSON onde a chave é o bairro EXATAMENTE como escrito na lista acima e o valor é o nome da Regional (exatamente como escrito na lista) ou "SEM REGIONAL".`;

      try {
        const resultStr = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          model: "gpt_5_mini"
        });
        const clean = String(resultStr).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(clean);
        for (const [neighborhood, regionalName] of Object.entries(result)) {
          if (regionalName && regionalName !== "SEM REGIONAL") {
            const valid = BH_REGIONALS.find(r => r.name === regionalName);
            if (valid) bhRegionalByNeighborhood.set(neighborhood, regionalName);
          }
        }
      } catch (e) {}
    }

    // Apply BH capital classifications
    for (const [neighborhood, clients] of bhClientByNeighborhood.entries()) {
      const regional = bhRegionalByNeighborhood.get(neighborhood);
      for (const client of clients) {
        if (regional) {
          stats.assigned++;
          stats.bhLlm++;
          if (!dryRun) updates.push({ id: client.id, regional });
        } else {
          stats.notParametrized++;
          if (!dryRun) updates.push({ id: client.id, regional: "NÃO PARAMETRIZADA" });
        }
      }
    }

    // Bulk update in batches of 500
    if (!dryRun && updates.length > 0) {
      for (let i = 0; i < updates.length; i += 500) {
        const batch = updates.slice(i, i + 500);
        await base44.asServiceRole.entities.Client.bulkUpdate(batch);
      }
    }

    return Response.json({
      dry_run: dryRun,
      client_id: clientId,
      stats,
      updates_count: updates.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}