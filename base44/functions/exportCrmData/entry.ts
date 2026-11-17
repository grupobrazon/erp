import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Exporta todos os Clientes, Contatos (telefones extraídos dos clientes) e
 * Vendas Canceladas para uma planilha Excel (.xlsx) e devolve a URL pública.
 *
 * Body: {} (sem parâmetros)
 */
Deno.serve(async (req) => {
  const log = [];
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    log.push('auth ok');

    let body = {};
    try { body = await req.json(); } catch (_) {}
    const limit = body.limit || 0; // 0 = todos
    const part = body.part || 0; // 0 = tudo, 1 = primeira metade, 2 = segunda metade

    // ---------------------------------------------------------------
    // 1. Buscar todos os clientes (segmentado para contornar o limite de 5000)
    // ---------------------------------------------------------------
    const segs = await Promise.all([
      base44.entities.Client.filter({ base_type: 'Lsoft', person_type: 'Física' }, '-id', 5000),
      base44.entities.Client.filter({ base_type: 'Lsoft', person_type: 'Jurídica' }, '-id', 5000),
      base44.entities.Client.filter({ base_type: 'Ótimo', person_type: 'Física', status: 'Ótimo - Cliente Brazon' }, '-id', 5000),
      base44.entities.Client.filter({ base_type: 'Ótimo', person_type: 'Física', status: 'Ótimo' }, '-id', 5000),
      base44.entities.Client.filter({ base_type: 'Ótimo', person_type: 'Física', status: 'Ótimo Recorrente' }, '-id', 5000),
      base44.entities.Client.filter({ base_type: 'Ótimo', person_type: 'Jurídica' }, '-id', 5000),
      base44.entities.Client.filter({ base_type: 'Novo', person_type: 'Física' }, '-id', 5000),
      base44.entities.Client.filter({ base_type: 'Novo', person_type: 'Jurídica' }, '-id', 5000),
    ]);
    let clients = [].concat(...segs);
    const seen = new Set();
    clients = clients.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    if (limit > 0) clients = clients.slice(0, limit);
    if (part === 1) clients = clients.slice(0, Math.ceil(clients.length / 2));
    if (part === 2) clients = clients.slice(Math.ceil(clients.length / 2));
    log.push('clients fetched: ' + clients.length + ' (part ' + part + ')');

    // ---------------------------------------------------------------
    // 2. Buscar vendas canceladas
    // ---------------------------------------------------------------
    const sales = await base44.entities.Sale.filter({ stage: 'Cancelada' }, '-created_date', 5000);
    log.push('sales fetched: ' + sales.length);

    // ---------------------------------------------------------------
    // 3. Aba Clientes — todos os campos
    // ---------------------------------------------------------------
    const clientCols = [
      'id','new_code','old_code','base_type','is_active','person_type','client_type','name','fantasy_name',
      'document','state_registration','ie_exempt','email','birth_date',
      'phone1','phone1_name','phone1_whatsapp','phone2','phone2_name','phone2_whatsapp',
      'phone3','phone3_name','phone3_whatsapp','phone4','phone4_name','phone4_whatsapp',
      'phone5','phone5_name','phone5_whatsapp',
      'zoox_phone1','zoox_phone2','zoox_phone3','zoox_phone4','zoox_phone5','zoox_phone6','zoox_phone7',
      'zip_code','street','number','complement','neighborhood','city','state',
      'status','last_purchase_date','last_product','registration_date','notes',
      'created_date','updated_date','created_by_id'
    ];
    const clientRows = clients.map((c) => {
      const r = {};
      clientCols.forEach((k) => r[k] = c[k] ?? '');
      return r;
    });

    // ---------------------------------------------------------------
    // 4. Aba Contatos — explodir telefones dos clientes
    // ---------------------------------------------------------------
    const contatoRows = [];
    clients.forEach((c) => {
      const baseEmail = c.email || '';
      let added = false;
      for (let i = 1; i <= 5; i++) {
        const ph = c['phone' + i];
        if (ph) {
          contatoRows.push({
            client_id: c.id, client_name: c.name, person_type: c.person_type, document: c.document,
            client_type: c.client_type || '', city: c.city || '', state: c.state || '',
            contact_name: c['phone' + i + '_name'] || '', phone: ph,
            whatsapp: c['phone' + i + '_whatsapp'] ? 'Sim' : 'Não', email: baseEmail,
            source: 'phone' + i
          });
          added = true;
        }
      }
      for (let i = 1; i <= 7; i++) {
        const ph = c['zoox_phone' + i];
        if (ph) {
          contatoRows.push({
            client_id: c.id, client_name: c.name, person_type: c.person_type, document: c.document,
            client_type: c.client_type || '', city: c.city || '', state: c.state || '',
            contact_name: '', phone: ph, whatsapp: '', email: baseEmail, source: 'zoox_phone' + i
          });
          added = true;
        }
      }
      if (!added && baseEmail) {
        contatoRows.push({
          client_id: c.id, client_name: c.name, person_type: c.person_type, document: c.document,
          client_type: c.client_type || '', city: c.city || '', state: c.state || '',
          contact_name: '', phone: '', whatsapp: '', email: baseEmail, source: 'email_only'
        });
      }
    });

    // ---------------------------------------------------------------
    // 5. Aba Vendas Canceladas — todos os campos (arrays como JSON)
    // ---------------------------------------------------------------
    const saleCols = [
      'id','order_number','client_id','client_name','date','seller_id','seller_name',
      'billing_location_id','billing_location_name','stock_location_id','stock_location_name',
      'total','total_services','additions','discount','freight','freight_exempt','freight_exempt_value',
      'displacement_fee','grand_total','received_amount','change_amount',
      'delivery_modality','delivery_different','billing_address','delivery_address',
      'billing_forecast','stage','confirmation_type','status','is_counter_sale','notes',
      'cr_preferred_date','cr_scheduling_type','cr_week_start','cr_period','cr_weekdays','cr_time_range',
      'cr_shipping_deadline','cr_delivery_deadline','cr_notes',
      'cancellation_status','cancellation_requested_by','cancellation_requested_date','cancellation_reason',
      'cancellation_approved_by','cancellation_approved_date','cancellation_dispatched',
      'cancellation_needs_stock_return','cancellation_reverse_tracking_code','cancellation_reverse_carrier',
      'cancellation_collection_type','cancellation_stock_received_date','cancellation_stock_received_by',
      'cancellation_refund_forecast_date','cancellation_refund_completed_date','cancellation_refund_amount',
      'cancellation_refund_method','cancellation_refund_details','cancellation_refund_completed_by',
      'cancellation_refund_receipt_url','cancellation_refund_receipt_urls',
      'cancellation_equipment_reverted','cancellation_equipment_revert_notes',
      'cancellation_nfe_requested_date','cancellation_nfe_completed_date','cancellation_completed_date',
      'cancellation_history','supervisor_logs',
      'linked_equipment_id','linked_equipment_code',
      'items','services','payments','shipping_volumes','shipping_quote_history',
      'quote_completed','selected_service','selected_carrier','packing_mode','item_packing',
      'created_date','updated_date','created_by_id'
    ];
    const saleRows = sales.map((s) => {
      const r = {};
      saleCols.forEach((k) => {
        let v = s[k];
        if (v === null || v === undefined) v = '';
        else if (Array.isArray(v) || typeof v === 'object') v = JSON.stringify(v);
        r[k] = v;
      });
      return r;
    });

    // ---------------------------------------------------------------
    // 6. Aba Itens das Vendas Canceladas
    // ---------------------------------------------------------------
    const itemRows = [];
    sales.forEach((s) => {
      (s.items || []).forEach((it, idx) => {
        itemRows.push({
          sale_id: s.id, order_number: s.order_number, client_name: s.client_name,
          tipo: 'Produto', item_index: idx + 1, product_id: it.product_id || '',
          product_name: it.product_name || '', quantity: it.quantity || 0,
          unit_price: it.unit_price || 0, total: it.total || 0,
          generate_equipment: it.generate_equipment ? 'Sim' : 'Não',
          purifier_model: it.purifier_model || ''
        });
      });
      (s.services || []).forEach((sv, idx) => {
        itemRows.push({
          sale_id: s.id, order_number: s.order_number, client_name: s.client_name,
          tipo: 'Serviço', item_index: idx + 1, product_id: sv.service_id || '',
          product_name: sv.service_name || '', quantity: sv.quantity || 0,
          unit_price: sv.unit_price || 0, total: sv.total || 0,
          generate_equipment: '', purifier_model: ''
        });
      });
    });

    // ---------------------------------------------------------------
    // 7. Aba Pagamentos das Vendas Canceladas
    // ---------------------------------------------------------------
    const payRows = [];
    sales.forEach((s) => {
      (s.payments || []).forEach((p, idx) => {
        payRows.push({
          sale_id: s.id, order_number: s.order_number, client_name: s.client_name,
          payment_index: idx + 1, condition_id: p.condition_id || '',
          condition_name: p.condition_name || '', amount: p.amount || 0,
          payment_status: p.payment_status || '', payment_moment: p.payment_moment || '',
          receipt_url: p.receipt_url || ''
        });
      });
    });

    // ---------------------------------------------------------------
    // 8. Gerar CSVs e compactar em ZIP (CSV é muito mais leve em memória
    //    que xlsx, permitindo todos os 8000+ clientes numa única execução)
    // ---------------------------------------------------------------
    function csvEscape(v) {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }
    function toCSV(rows, cols) {
      if (!rows.length) return cols.join(',') + '\n';
      const header = cols.join(',');
      const lines = rows.map((r) => cols.map((k) => csvEscape(r[k])).join(','));
      return header + '\n' + lines.join('\n') + '\n';
    }
    // Adiciona BOM UTF-8 para o Excel reconhecer acentos corretamente
    const BOM = '\uFEFF';
    const csvs = {
      'Clientes.csv': BOM + toCSV(clientRows, clientCols),
      'Contatos.csv': BOM + toCSV(contatoRows, ['client_id','client_name','person_type','document','client_type','city','state','contact_name','phone','whatsapp','email','source']),
      'Vendas_Canceladas.csv': BOM + toCSV(saleRows, saleCols),
      'Itens_Vendas_Canceladas.csv': BOM + toCSV(itemRows, ['sale_id','order_number','client_name','tipo','item_index','product_id','product_name','quantity','unit_price','total','generate_equipment','purifier_model']),
      'Pagamentos_Vendas_Canceladas.csv': BOM + toCSV(payRows, ['sale_id','order_number','client_name','payment_index','condition_id','condition_name','amount','payment_status','payment_moment','receipt_url']),
    };

    log.push('rows built: clients=' + clientRows.length + ' contatos=' + contatoRows.length + ' sales=' + saleRows.length);

    const JSZip = (await import('npm:jszip@3.10.1')).default;
    const zip = new JSZip();
    Object.entries(csvs).forEach(([name, content]) => zip.file(name, content));
    const zipBuf = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    log.push('zip generated: ' + zipBuf.length + ' bytes');

    const fname = 'CRM_Completo_Brazon.zip';
    const blob = new Blob([zipBuf], { type: 'application/zip' });
    const file = new File([blob], fname, { type: blob.type });
    const up = await base44.integrations.Core.UploadFile({ file });
    log.push('uploaded: ' + up.file_url);

    return Response.json({
      status: 'ok',
      file_url: up.file_url,
      filename: fname,
      log,
      stats: {
        clientes: clientRows.length,
        contatos: contatoRows.length,
        vendas_canceladas: saleRows.length,
        itens: itemRows.length,
        pagamentos: payRows.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack, log }, { status: 500 });
  }
});