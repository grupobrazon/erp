// Gerado de base44/functions/generateTestRouteData/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

const TEST_MARKER = 'DADOS-TESTE-ROTAS';
const TEST_CLIENT_PREFIX = 'CLIENTE TESTE ROTA -';

async function generateCode(entity, prefix, codeField, padLength = 6) {
  const existing = await entity.filter({}, '-created_date', 5000);
  const maxNum = existing.reduce((max, rec) => {
    const code = rec[codeField];
    if (!code || !String(code).startsWith(prefix)) return max;
    const num = parseInt(String(code).slice(prefix.length), 10) || 0;
    return num > max ? num : max;
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(padLength, '0')}`;
}

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allRoles = [user.role, ...(user.additional_roles || [])].filter(Boolean);
    if (!allRoles.includes('admin') && !allRoles.includes('supervisor')) {
      return Response.json({ error: 'Acesso restrito a administradores e supervisores' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;
    const svc = base44.asServiceRole;

    // ─── GENERATE ─────────────────────────────────────────────
    if (action === 'generate') {
      const { calendar_id, date, count = 5, technician_name = '' } = body;
      if (!calendar_id || !date) {
        return Response.json({ error: 'calendar_id e date são obrigatórios' }, { status: 400 });
      }

      // Busca calendário e zona vinculada
      const calendar = await svc.entities.CalendarioRota.get(calendar_id);
      const zones = await svc.entities.RouteZone.filter({ calendar_id });
      const zone = zones[0] || null;

      // Busca produtos ativos para itens
      const products = await svc.entities.Product.list('-created_date', 20);
      const activeProducts = products.filter(p => p.is_active !== false);
      const product = activeProducts[0] || { id: null, name: 'Purificador Teste', sale_price: 500 };

      // Busca vendedor e localizações
      const sellers = await svc.entities.Seller.list('-created_date', 50);
      const seller = sellers[0];
      const billingLocations = await svc.entities.BillingLocation.list('-created_date', 10);
      const billingLoc = billingLocations[0];
      const stockLocations = await svc.entities.StockLocation.list('-created_date', 10);
      const stockLoc = stockLocations[0];
      const paymentConditions = await svc.entities.PaymentCondition.list('-created_date', 50);
      const parcCond = paymentConditions.find(c => c.payment_type === 'Parcelado') || null;

      // Cidade base do calendário ou zona
      const baseCity = zone?.center_city || calendar?.center_city || calendar?.city || 'São Paulo';
      const baseState = zone?.center_state || calendar?.state || 'SP';

      // Ruas de teste variadas
      const testStreets = [
        { street: 'Rua das Acácias', number: '100', neighborhood: 'Centro' },
        { street: 'Av. Brasil', number: '250', neighborhood: 'Jardim Paulista' },
        { street: 'Rua dos Ipês', number: '42', neighborhood: 'Vila Nova' },
        { street: 'Av. Paulista', number: '1500', neighborhood: 'Bela Vista' },
        { street: 'Rua das Palmeiras', number: '78', neighborhood: 'Santa Mônica' },
        { street: 'Rua das Mangueiras', number: '320', neighborhood: 'Pinheiros' },
        { street: 'Av. dos Pinheiros', number: '890', neighborhood: 'Centro' },
        { street: 'Rua das Orquídeas', number: '155', neighborhood: 'Jardim das Flores' },
      ];

      const timeTypes = ['Manhã', 'Tarde', 'Dia Inteiro'];
      const vehicleTypes = ['Moto', 'Carro'];
      const created = { clients: 0, sales: 0, os: 0, appointments: 0, tos: 0 };

      for (let i = 0; i < count; i++) {
        const addr = testStreets[i % testStreets.length];
        const clientName = `${TEST_CLIENT_PREFIX} ${baseCity} ${i + 1}`;

        // 1. Criar cliente de teste
        const clientCode = await generateCode(svc.entities.Client, 'B', 'new_code', 6);
        const client = await svc.entities.Client.create({
          new_code: clientCode,
          name: clientName,
          person_type: 'Física',
          document: `111.111.111-${String(11 + i).padStart(2, '0')}`,
          email: `teste-rota-${i + 1}@brazon.com.br`,
          phone1: `(11) 99999-${String(1000 + i).slice(-4)}`,
          zip_code: '01310-100',
          street: addr.street,
          number: addr.number,
          neighborhood: addr.neighborhood,
          city: baseCity,
          state: baseState,
          status: 'Novo',
          base_type: 'Novo',
          notes: TEST_MARKER,
          route_assignments: zone ? [{
            zone_id: zone.id,
            zone_name: zone.name,
            calendar_id: calendar.id,
            calendar_name: calendar.name,
          }] : [],
        });
        created.clients++;

        // 2. Criar venda de teste (Entrega + Instalação, Parcial)
        const basePrice = 500 + i * 100;
        const itemTotal = basePrice;
        const grandTotal = itemTotal;
        const antecipated = Math.round(grandTotal * 0.5);
        const pending = grandTotal - antecipated;

        const orderNumber = await generateCode(svc.entities.Sale, 'P', 'order_number', 3);
        const saleData = {
          order_number: orderNumber,
          client_id: client.id,
          client_name: client.name,
          date,
          items: [{
            product_id: product.id || undefined,
            product_name: product.name,
            quantity: 1,
            unit_price: basePrice,
            total: itemTotal,
            generate_equipment: false,
          }],
          total: itemTotal,
          grand_total: grandTotal,
          additions: 0,
          discount: 0,
          freight: 0,
          delivery_modality: 'Entrega + Instalação',
          delivery_address: {
            zip_code: '01310-100', street: addr.street, number: addr.number,
            neighborhood: addr.neighborhood, city: baseCity, state: baseState,
          },
          billing_address: {
            zip_code: '01310-100', street: addr.street, number: addr.number,
            neighborhood: addr.neighborhood, city: baseCity, state: baseState,
          },
          stage: 'Confirmada',
          confirmation_type: 'Parcial',
          status: 'Confirmada',
          received_amount: antecipated,
          change_amount: 0,
          payments: [
            {
              condition_id: parcCond?.id || null,
              condition_name: parcCond?.name || 'Faturado 2x',
              amount: antecipated,
              payment_status: 'Realizada',
              payment_moment: 'Antecipada',
            },
            {
              condition_id: parcCond?.id || null,
              condition_name: parcCond?.name || 'Faturado 2x',
              amount: pending,
              payment_status: 'Pendente',
              payment_moment: 'Na Instalação',
            },
          ],
          service_detail_types: [],
          service_detail_notes: 'Instalação de purificador (teste de rota)',
          notes: `${TEST_MARKER} - Venda teste rota`,
        };
        if (seller) { saleData.seller_id = seller.id; saleData.seller_name = seller.name; }
        if (billingLoc) { saleData.billing_location_id = billingLoc.id; saleData.billing_location_name = billingLoc.name; }
        if (stockLoc) { saleData.stock_location_id = stockLoc.id; saleData.stock_location_name = stockLoc.name; }

        const sale = await svc.entities.Sale.create(saleData);
        created.sales++;

        // 3. Criar OS de teste (status "Liberado para Técnico" — pronto para rota)
        const osCode = await generateCode(svc.entities.ServiceOrder, 'OS', 'code', 6);
        const os = await svc.entities.ServiceOrder.create({
          code: osCode,
          client_id: client.id,
          client_name: client.name,
          sale_id: sale.id,
          sale_order_number: sale.order_number,
          type: 'Entrega + Instalação',
          delivery_modality: 'Entrega + Instalação',
          delivery_address: {
            zip_code: '01310-100', street: addr.street, number: addr.number,
            neighborhood: addr.neighborhood, city: baseCity, state: baseState,
          },
          date,
          has_pending_payment: true,
          pending_payment_amount: pending,
          pending_payment_moment: 'Na Instalação',
          technician_notes: 'Teste de rota — instalar purificador',
          notes: TEST_MARKER,
          status: 'Liberado para Técnico',
          route_zone_id: zone?.id || null,
          route_zone_name: zone?.name || null,
          route_region_id: zone?.region_id || null,
          route_region_name: zone?.region_name || null,
        });
        created.os++;

        // 4. Criar agendamento na agenda de rotas
        const timeType = timeTypes[i % timeTypes.length];
        const vehicleType = vehicleTypes[i % vehicleTypes.length];
        const appointment = await svc.entities.AgendamentoRota.create({
          calendar_id: calendar.id,
          calendar_name: calendar.name,
          calendar_color: calendar.color,
          title: client.name,
          client_name: client.name,
          client_phone: client.phone1,
          client_id: client.id,
          address: `${addr.street}, ${addr.number} - ${addr.neighborhood}, ${baseCity}/${baseState}`,
          city: baseCity,
          date,
          time_type: timeType,
          vehicle_type: vehicleType,
          sale_id: sale.id,
          sale_order_number: sale.order_number,
          os_id: os.id,
          os_code: os.code,
          service_detail_notes: 'Instalação de purificador (teste de rota)',
          status: 'Agendado',
          notes: TEST_MARKER,
        });
        created.appointments++;

        // 5. Criar OS do Técnico (TOS) — vinculada à OS e ao agendamento
        const tosCode = await generateCode(svc.entities.TechnicianServiceOrder, 'TOS', 'code', 6);
        const tos = await svc.entities.TechnicianServiceOrder.create({
          code: tosCode,
          parent_os_id: os.id,
          parent_os_code: os.code,
          parent_os_type: 'Entrega + Instalação',
          client_id: client.id,
          client_name: client.name,
          sale_id: sale.id,
          sale_order_number: sale.order_number,
          appointment_id: appointment.id,
          appointment_date: appointment.date,
          appointment_time_type: appointment.time_type,
          technician_name: technician_name || '',
          status: 'Pendente',
          items_to_deliver: [{
            product_id: product.id || '',
            product_name: product.name,
            quantity: 1,
          }],
          service_detail_types: [],
          service_detail_notes: 'Instalação de purificador (teste de rota)',
          pending_payment_amount: pending,
          technician_notes: TEST_MARKER,
          checklist_results: [],
          technician_sale_items: [],
        });
        created.tos++;

        // Atualizar OS com o código da TOS
        await svc.entities.ServiceOrder.update(os.id, {
          technician_os_code: tos.code,
          appointment_date: date,
        });
      }

      return Response.json({
        ok: true,
        created,
        calendar: { name: calendar.name, date },
        note: `${count} registros de teste criados em ${calendar.name} para ${date}. Inclui clientes, vendas, OS, agendamentos e OS do técnico.`,
      });
    }

    // ─── CLEANUP (test route data only) ──────────────────────
    if (action === 'cleanup') {
      const deleted = { tos: 0, appointments: 0, os: 0, sales: 0, clients: 0 };

      // 1. Deletar TOS de teste
      const testTOS = await svc.entities.TechnicianServiceOrder.filter({
        technician_notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      for (const t of testTOS) {
        await svc.entities.TechnicianServiceOrder.delete(t.id);
        deleted.tos++;
      }

      // 2. Deletar agendamentos de teste
      const testAppts = await svc.entities.AgendamentoRota.filter({
        notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      for (const a of testAppts) {
        await svc.entities.AgendamentoRota.delete(a.id);
        deleted.appointments++;
      }

      // 3. Deletar OS de teste
      const testOS = await svc.entities.ServiceOrder.filter({
        notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      for (const o of testOS) {
        await svc.entities.ServiceOrder.delete(o.id);
        deleted.os++;
      }

      // 4. Deletar vendas de teste
      const testSales = await svc.entities.Sale.filter({
        notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      for (const s of testSales) {
        await svc.entities.Sale.delete(s.id);
        deleted.sales++;
      }

      // 5. Deletar clientes de teste
      const testClients = await svc.entities.Client.filter({
        name: { $regex: TEST_CLIENT_PREFIX, $options: 'i' },
      });
      for (const c of testClients) {
        await svc.entities.Client.delete(c.id);
        deleted.clients++;
      }

      return Response.json({ ok: true, deleted });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});