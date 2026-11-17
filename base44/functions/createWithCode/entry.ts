import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Cria um registro de entidade gerando seu código sequencial no momento do salvamento
 * (server-side), evitando duplicidade quando múltiplas abas "novo" são usadas simultaneamente.
 *
 * Parâmetros (body JSON):
 *  - entity_name: nome da entidade (ex: Client, Sale, Product, Equipment, TechnicianRoute)
 *  - prefix:     prefixo do código (ex: "B", "P", "EQ", "R") — para Product, o prefixo do grupo
 *  - code_field: campo onde o código é gravado (ex: new_code, order_number, code)
 *  - pad_length: tamanho do preenchimento com zeros (default 6)
 *  - data:       objeto com os dados do registro a ser criado
 *  - filter:     filtro opcional para restringir a busca do código máximo (ex: { group_id } para Product)
 *  - dry_run:    se true, apenas devolve o próximo código sem criar o registro (para testes/preview)
 *
 * Retorna: { record, code }
 *
 * OBS: se duas gravações simultâneas lerem o mesmo "maior código" e gerarem o mesmo número,
 * a duplicidade é detectada logo após a criação e o registro mais recente é renumerado
 * automaticamente para o próximo número livre — o código nunca fica repetido no banco.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      entity_name,
      prefix,
      code_field,
      pad_length = 6,
      data,
      filter = {},
      dry_run = false,
    } = await req.json();

    if (!entity_name || !prefix || !code_field || !data) {
      return Response.json(
        { error: 'entity_name, prefix, code_field e data são obrigatórios' },
        { status: 400 }
      );
    }

    const entity = base44.entities[entity_name];
    if (!entity || typeof entity.filter !== 'function' || typeof entity.create !== 'function') {
      return Response.json(
        { error: `Entidade "${entity_name}" não encontrada ou sem operações filter/create` },
        { status: 400 }
      );
    }

    // A verificação de duplicidade roda como serviço para não ser limitada por RLS.
    const checkEntity = base44.asServiceRole.entities[entity_name];

    // Calcula o próximo número livre a partir do maior código existente (opcionalmente filtrado),
    // nunca menor que o número mínimo informado (garante progresso a cada tentativa).
    const computeNext = async (minNum = 0) => {
      const existing = await checkEntity.filter(filter, '-created_date', 5000);
      const maxNum = existing.reduce((max, rec) => {
        const code = rec[code_field];
        if (!code || !String(code).startsWith(prefix)) return max;
        const num = parseInt(String(code).slice(prefix.length), 10) || 0;
        return num > max ? num : max;
      }, 0);
      const base = Math.max(maxNum, minNum);
      return { code: `${prefix}${String(base + 1).padStart(pad_length, '0')}`, num: base + 1 };
    };

    const first = await computeNext();

    if (dry_run) {
      return Response.json({ record: null, code: first.code });
    }

    // Cria com o código calculado (created_by é do usuário autenticado)
    let record = await entity.create({ ...data, [code_field]: first.code });
    let myCode = first.code;
    let myNum = first.num;

    // Corrige eventual duplicidade gerada por gravações simultâneas:
    // o registro mais recente que ficou com o código repetido assume o próximo número livre.
    for (let attempt = 0; attempt < 8; attempt++) {
      const same = await checkEntity.filter({ ...filter, [code_field]: myCode }, 'created_date', 50);
      if (same.length <= 1) break;

      const loser = same[same.length - 1];
      const next = await computeNext(myNum);
      myNum = next.num;
      await checkEntity.update(loser.id, { [code_field]: next.code });

      if (loser.id === record.id) {
        myCode = next.code;
        record = { ...record, [code_field]: next.code };
      }
    }

    return Response.json({ record, code: myCode });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});