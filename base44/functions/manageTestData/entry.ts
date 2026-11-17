import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TEST_MARKER = 'DADOS-TESTE-BRAZON';
const TEST_CLIENT_NAME = 'CLIENTE TESTE - BRAZON';
const RECEIPT_URL = 'https://placehold.co/600x400/ffffff/000000.png?text=COMPROVANTE+DE+PAGAMENTO+TESTE';

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

Deno.serve(async (req) => {
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
    const today = new Date().toISOString().slice(0, 10);
    const testAddress = {
      zip_code: '01310-100', street: 'Av. Paulista', number: '1000',
      neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP',
    };

    // ─── CREATE ───────────────────────────────────────────────
    if (action === 'create') {
      // Find or create test client
      let testClient;
      const existingClients = await svc.entities.Client.filter({
        name: { $regex: TEST_CLIENT_NAME, $options: 'i' },
      });
      if (existingClients.length > 0) {
        testClient = existingClients[0];
      } else {
        const clientCode = await generateCode(svc.entities.Client, 'B', 'new_code', 6);
        testClient = await svc.entities.Client.create({
          new_code: clientCode,
          name: TEST_CLIENT_NAME,
          person_type: 'Física',
          document: '111.111.111-11',
          email: 'teste@brazon.com.br',
          phone1: '(11) 99999-9999',
          zip_code: testAddress.zip_code,
          street: testAddress.street,
          number: testAddress.number,
          neighborhood: testAddress.neighborhood,
          city: testAddress.city,
          state: testAddress.state,
          status: 'Novo',
          base_type: 'Novo',
          notes: TEST_MARKER,
        });
      }

      // Fetch supporting data
      const products = await svc.entities.Product.list('-created_date', 20);
      const activeProducts = products.filter(p => p.is_active !== false);
      const sellers = await svc.entities.Seller.list('-created_date', 50);
      const billingLocations = await svc.entities.BillingLocation.list('-created_date', 10);
      const stockLocations = await svc.entities.StockLocation.list('-created_date', 10);
      const paymentConditions = await svc.entities.PaymentCondition.list('-created_date', 50);

      // Pick payment conditions: one à vista, one parcelado
      const vistaCond = paymentConditions.find(c => c.payment_type === 'À Vista') || null;
      const parcCond = paymentConditions.find(c => c.payment_type === 'Parcelado') || null;

      const product = activeProducts[0] || { id: null, name: 'Purificador Teste', sale_price: 500 };
      const seller = sellers[0];
      const billingLoc = billingLocations[0];
      const stockLoc = stockLocations[0];

      const created = { sales: [] };

      // Helper: create a sale at "Confirmada" with realistic payment data
      const createSale = async (opts) => {
        const { modality, confirmationType, basePrice, freight = 0 } = opts;
        const orderNumber = await generateCode(svc.entities.Sale, 'P', 'order_number', 3);
        const quantity = 1;
        const itemTotal = basePrice * quantity;
        const grandTotal = itemTotal + freight;

        // Build payments array based on confirmation type
        let payments = [];
        if (confirmationType === 'Total') {
          // Full payment antecipated with receipt
          payments = [{
            condition_id: vistaCond?.id || null,
            condition_name: vistaCond?.name || 'PIX',
            amount: grandTotal,
            receipt_url: RECEIPT_URL,
            payment_status: 'Realizada',
            payment_moment: 'Antecipada',
          }];
        } else {
          // Parcial: 50% antecipated with receipt + 50% pending at delivery/installation
          const antecipated = Math.round(grandTotal * 0.5);
          const pending = grandTotal - antecipated;
          const pendingMoment = modality === 'Entrega + Instalação' ? 'Na Instalação' : 'Na Entrega';
          payments = [
            {
              condition_id: parcCond?.id || null,
              condition_name: parcCond?.name || 'Faturado 2x',
              amount: antecipated,
              receipt_url: RECEIPT_URL,
              payment_status: 'Realizada',
              payment_moment: 'Antecipada',
            },
            {
              condition_id: parcCond?.id || null,
              condition_name: parcCond?.name || 'Faturado 2x',
              amount: pending,
              receipt_url: null,
              payment_status: 'Pendente',
              payment_moment: pendingMoment,
            },
          ];
        }

        const receivedAmount = payments
          .filter(p => p.payment_status === 'Realizada')
          .reduce((sum, p) => sum + p.amount, 0);

        const saleData = {
          order_number: orderNumber,
          client_id: testClient.id,
          client_name: testClient.name,
          date: today,
          items: [{
            product_id: product.id || undefined,
            product_name: product.name,
            quantity,
            unit_price: basePrice,
            total: itemTotal,
            generate_equipment: false,
          }],
          total: itemTotal,
          grand_total: grandTotal,
          additions: 0,
          discount: 0,
          freight,
          delivery_modality: modality,
          delivery_address: testAddress,
          billing_address: testAddress,
          stage: 'Confirmada',
          confirmation_type: confirmationType,
          status: 'Confirmada',
          received_amount: receivedAmount,
          change_amount: 0,
          payments,
          notes: `${TEST_MARKER} - Venda teste (${modality} / ${confirmationType})`,
        };

        // Envio modality requires freight quote data
        if (modality === 'Envio') {
          saleData.quote_completed = true;
          saleData.selected_service = 'SEDEX';
          saleData.selected_carrier = 'Correios';
          saleData.shipping_quote_history = [{
            company_name: 'Correios',
            service_name: 'SEDEX',
            service_id: '03298',
            price: freight,
            delivery_time: '3 dias',
            date: new Date().toISOString(),
            selected: true,
          }];
        }

        if (seller) { saleData.seller_id = seller.id; saleData.seller_name = seller.name; }
        if (billingLoc) { saleData.billing_location_id = billingLoc.id; saleData.billing_location_name = billingLoc.name; }
        if (stockLoc) { saleData.stock_location_id = stockLoc.id; saleData.stock_location_name = stockLoc.name; }

        const sale = await svc.entities.Sale.create(saleData);
        created.sales.push({
          order_number: sale.order_number,
          modality,
          stage: sale.stage,
          confirmation_type: confirmationType,
          grand_total: grandTotal,
          received_amount: receivedAmount,
          has_receipt: true,
        });
        return sale;
      };

      // ── Sale 1: Entrega Própria, Total (antecipado) → "Confirmada"
      //    Fluxo: deve ir para aprovação financeira → após aprovação, gerar OS
      await createSale({ modality: 'Entrega Própria', confirmationType: 'Total', basePrice: 500 });

      // ── Sale 2: Envio, Total → "Confirmada"
      //    Envio só aceita pagamento integral (antecipado) → aguarda aprovação financeira → OS (Expedição)
      await createSale({ modality: 'Envio', confirmationType: 'Total', basePrice: 600, freight: 35 });

      // ── Sale 3: Entrega + Instalação, Parcial → "Confirmada"
      //    Fluxo: OS liberada imediatamente → aguardando rota → agendamento → técnico
      await createSale({ modality: 'Entrega + Instalação', confirmationType: 'Parcial', basePrice: 800 });

      return Response.json({
        ok: true,
        created,
        client: { name: testClient.name, new_code: testClient.new_code },
        note: 'Vendas criadas em "Confirmada" com comprovante e condição de pagamento. Percorra o fluxo real pelo sistema: Confirmações de Venda → Aprovação Financeira → Geração de OS → Produção/Expedição → Rotas/Técnico.',
      });
    }

    // ─── CLEANUP (test data only) ─────────────────────────────
    if (action === 'cleanup') {
      const deleted = { sales: 0, serviceOrders: 0, remessas: 0, routes: 0, clients: 0 };

      // 1. Find test sales first (so we can trace linked OSs by sale_id)
      const testSales = await svc.entities.Sale.filter({
        notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      const testSaleIds = testSales.map(s => s.id);

      // 2. Delete OSs linked to test sales (by sale_id) OR with test marker
      const osToDelete = [];
      if (testSaleIds.length > 0) {
        const osBySale = await svc.entities.ServiceOrder.filter({ sale_id: { $in: testSaleIds } });
        for (const o of osBySale) {
          if (!osToDelete.find(x => x.id === o.id)) osToDelete.push(o);
        }
      }
      const osByNotes = await svc.entities.ServiceOrder.filter({
        notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      for (const o of osByNotes) {
        if (!osToDelete.find(x => x.id === o.id)) osToDelete.push(o);
      }
      for (const o of osToDelete) {
        await svc.entities.ServiceOrder.delete(o.id);
        deleted.serviceOrders++;
      }

      // 3. Delete test remessas
      const testRemessas = await svc.entities.Remessa.filter({
        notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      for (const r of testRemessas) {
        await svc.entities.Remessa.delete(r.id);
        deleted.remessas++;
      }

      // 4. Delete test routes
      const testRoutes = await svc.entities.TechnicianRoute.filter({
        notes: { $regex: TEST_MARKER, $options: 'i' },
      });
      for (const r of testRoutes) {
        await svc.entities.TechnicianRoute.delete(r.id);
        deleted.routes++;
      }

      // 5. Delete test sales (now that linked OSs are gone)
      for (const s of testSales) {
        await svc.entities.Sale.delete(s.id);
        deleted.sales++;
      }

      // 6. Delete test clients
      const testClients = await svc.entities.Client.filter({
        name: { $regex: TEST_CLIENT_NAME, $options: 'i' },
      });
      for (const c of testClients) {
        await svc.entities.Client.delete(c.id);
        deleted.clients++;
      }

      return Response.json({ ok: true, deleted });
    }

    // ─── CLEAN ALL (wipe all transactional data) ──────────────
    if (action === 'clean_all') {
      const deleted = { sales: 0, serviceOrders: 0, remessas: 0, routes: 0 };

      // Delete all service orders (includes invoicing, NF-e, production data)
      const allOS = await svc.entities.ServiceOrder.list('-created_date', 5000);
      if (allOS.length > 0) {
        await svc.entities.ServiceOrder.deleteMany({ id: { $in: allOS.map(o => o.id) } });
        deleted.serviceOrders = allOS.length;
      }

      // Delete all remessas (includes invoicing, NF-e data)
      const allRemessas = await svc.entities.Remessa.list('-created_date', 5000);
      if (allRemessas.length > 0) {
        await svc.entities.Remessa.deleteMany({ id: { $in: allRemessas.map(r => r.id) } });
        deleted.remessas = allRemessas.length;
      }

      // Delete all technician routes
      const allRoutes = await svc.entities.TechnicianRoute.list('-created_date', 5000);
      if (allRoutes.length > 0) {
        await svc.entities.TechnicianRoute.deleteMany({ id: { $in: allRoutes.map(r => r.id) } });
        deleted.routes = allRoutes.length;
      }

      // Delete all sales (includes receivables / payment data)
      const allSales = await svc.entities.Sale.list('-created_date', 5000);
      if (allSales.length > 0) {
        await svc.entities.Sale.deleteMany({ id: { $in: allSales.map(s => s.id) } });
        deleted.sales = allSales.length;
      }

      return Response.json({ ok: true, deleted, wiped: 'all' });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});