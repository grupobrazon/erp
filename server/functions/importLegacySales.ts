// Gerado de base44/functions/importLegacySales/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { dry_run = true, report = false } = await req.json();

    // === REPORT MODE: query already-imported sales and return mapping + failures ===
    if (report) {
      const csvUrl = 'https://docs.google.com/spreadsheets/d/1G5zPIExbf4uTFEXFfYOljNA6AB7YJr5rdm4r00Wu2zo/export?format=csv&gid=0';
      const csvRes = await fetch(csvUrl);
      const csvText = await csvRes.text();
      const csvRows = parseCSV(csvText);
      const csvDataRows = csvRows.slice(1).filter(r => r.length > 10 && (r[0] || '').trim());

      // Extract all pedidos from CSV
      const allPedidos = csvDataRows.map(r => ({
        pedido: (r[0] || '').trim().split(/\s+/)[0],
        old_client_code: (r[2] || '').trim(),
        client_name_spreadsheet: (r[3] || '').trim(),
        nf: (r[1] || '').trim(),
        is_faturado: (r[1] || '').trim() !== 'Não está faturado' && /\d/.test(r[1] || ''),
        transportadora: (r[7] || '').trim().toUpperCase(),
        texto: (r[18] || '').trim()
      }));

      // Fetch all sales (paginate to get all imported ones)
      let allSales = [];
      for (let page = 0; page < 5; page++) {
        const batch = await base44.asServiceRole.entities.Sale.list("-created_date", 500);
        allSales = allSales.concat(batch);
        if (batch.length < 500) break;
        break; // list doesn't support skip, one page is enough if < 500
      }

      // Build map of imported sales by old pedido number (from notes)
      const importedMap = {};
      for (const s of allSales) {
        if (s.notes && s.notes.includes('Pedido antigo:')) {
          const match = s.notes.match(/Pedido antigo:\s*(\S+)/);
          if (match) importedMap[match[1]] = s;
        }
      }

      // Fetch OS to check which sales have OS
      const allOS = await base44.asServiceRole.entities.ServiceOrder.list("-created_date", 500);
      const osBySaleId = {};
      for (const os of allOS) {
        if (os.sale_id) osBySaleId[os.sale_id] = os;
      }

      // Build report
      const importedList = [];
      const failedList = [];
      for (const p of allPedidos) {
        const sale = importedMap[p.pedido];
        if (sale) {
          const os = osBySaleId[sale.id];
          importedList.push({
            pedido: p.pedido,
            order_number: sale.order_number,
            client_name: sale.client_name,
            is_faturado: p.is_faturado,
            delivery_modality: sale.delivery_modality,
            stage: sale.stage,
            grand_total: sale.grand_total,
            items_count: sale.items?.length || 0,
            has_os: !!os,
            os_code: os?.code || '',
            os_status: os?.status || ''
          });
        } else {
          failedList.push({
            pedido: p.pedido,
            client_name: p.client_name_spreadsheet,
            old_client_code: p.old_client_code,
            is_faturado: p.is_faturado,
            error: p.old_client_code ? 'Cliente não encontrado no sistema' : 'Sem código de cliente'
          });
        }
      }

      return Response.json({
        total: allPedidos.length,
        imported: importedList.length,
        failed: failedList.length,
        faturados: allPedidos.filter(p => p.is_faturado).length,
        imported_list: importedList,
        failed_list: failedList
      });
    }

    // === 1. FETCH CSV ===
    const csvUrl = 'https://docs.google.com/spreadsheets/d/1G5zPIExbf4uTFEXFfYOljNA6AB7YJr5rdm4r00Wu2zo/export?format=csv&gid=0';
    const csvRes = await fetch(csvUrl);
    const csvText = await csvRes.text();

    // === 2. FETCH ALL DATA ===
    const [products, sellers, payConds, existingSales] = await Promise.all([
      base44.asServiceRole.entities.Product.list("-created_date", 500),
      base44.asServiceRole.entities.Seller.list("-created_date", 200),
      base44.asServiceRole.entities.PaymentCondition.list("-created_date", 200),
      base44.asServiceRole.entities.Sale.list("-created_date", 500)
    ]);

    // === 3. BUILD LOOKUP MAPS ===
    // Client lookup: parse CSV first to extract all old_client_codes, then query individually
    const csvRows = parseCSV(csvText);
    const csvDataRows = csvRows.slice(1).filter(r => r.length > 10 && (r[0] || '').trim());
    const oldClientCodes = [...new Set(csvDataRows.map(r => (r[2] || '').trim()).filter(c => c))];

    const clientByOldCode = {};
    // Batch query: 20 codes at a time
    for (let i = 0; i < oldClientCodes.length; i += 20) {
      const batch = oldClientCodes.slice(i, i + 20);
      const results = await Promise.all(
        batch.map(code => base44.asServiceRole.entities.Client.filter({ old_code: code }).then(r => ({ code, client: r[0] })).catch(() => ({ code, client: null })))
      );
      for (const { code, client } of results) {
        if (client) clientByOldCode[code] = client;
      }
    }

    const productByShortDesc = {};
    for (const p of products) {
      if (p.short_description) {
        productByShortDesc[p.short_description.toUpperCase().trim()] = p;
      }
    }

    const mariaEduarda = sellers.find(s => s.name.toUpperCase().includes('MARIA EDUARDA'));

    // === 4. ENSURE ENTITIES ===
    let brazonLinkPay = payConds.find(p => p.name.includes('Brazon Link'));
    let pixPay = payConds.find(p => p.modality === 'PIX');
    let siteBrazonSeller = sellers.find(s => s.name.toUpperCase().includes('SITE BRAZON'));

    if (!dry_run) {
      if (!brazonLinkPay) {
        brazonLinkPay = await base44.asServiceRole.entities.PaymentCondition.create({
          name: 'Brazon Link Crédito Parcelado (Legado)',
          payment_type: 'Parcelado',
          modality: 'Cartão de Crédito',
          installments: 1,
          financial_fee: 0,
          is_legacy: true
        });
      }
      if (!siteBrazonSeller) {
        siteBrazonSeller = await base44.asServiceRole.entities.Seller.create({ name: 'Site Brazon' });
      }
    }

    // === 4.5 IDEMPOTENCY GUARD — skip pedidos already imported (by "Pedido antigo:" marker in notes) ===
    const importedPedidoSet = new Set();
    for (const s of existingSales) {
      if (s.notes) {
        const match = s.notes.match(/Pedido antigo:\s*(\S+)/);
        if (match) importedPedidoSet.add(match[1]);
      }
    }

    // === 5. ORDER NUMBER & OS CODE GENERATION ===
    const maxOrderNum = existingSales.reduce((max, s) => {
      const num = parseInt(s.order_number?.replace('P', '')) || 0;
      return num > max ? num : max;
    }, 0);
    let nextOrderNum = maxOrderNum + 1;

    const allOS = dry_run ? [] : await base44.asServiceRole.entities.ServiceOrder.list("-created_date", 1000);
    const maxOSCode = allOS.reduce((max, o) => {
      const num = parseInt(o.code?.replace('OS', '')) || 0;
      return num > max ? num : max;
    }, 0);
    let nextOSNum = maxOSCode + 1;

    // === 6. PROCESS ROWS ===
    const results = [];
    const salesToCreate = [];
    const addressesToCreate = [];
    const osToCreate = [];

    for (const row of csvDataRows) {
      const result = { pedido: '', imported: false, order_number: '', client_name: '', errors: [], warnings: [], is_faturado: false, delivery_modality: '', os_type: '', items_count: 0, unmatched_products: [] };

      try {
        // Parse columns (0-indexed)
        // A(0)=Pedido B(1)=NF C(2)=Cód.Client D(3)=Nome E(4)=Cond.Pag F(5)=Natureza G(6)=Status
        // H(7)=Transportadora I(8)=TipoFrete J(9)=Endereço K(10)=Bairro L(11)=Cidade M(12)=Representante
        // N(13)=Produto(codes) O(14)=Descrição P(15)=Qtd Q(16)=ValorUnit R(17)=ValorTotal S(18)=Texto
        const pedidoStr = (row[0] || '').trim();
        const pedidoNum = pedidoStr.split(/\s+/)[0];
        result.pedido = pedidoNum;

        if (importedPedidoSet.has(pedidoNum)) {
          result.errors.push('Pedido já importado (ignorado)');
          results.push(result);
          continue;
        }

        const nfStr = (row[1] || '').trim();
        const isFaturado = nfStr !== 'Não está faturado' && nfStr !== '' && /\d/.test(nfStr);
        result.is_faturado = isFaturado;

        const oldClientCode = (row[2] || '').trim();
        const clientName = (row[3] || '').trim();
        const payCondition = (row[4] || '').trim().toUpperCase();
        const statusStr = (row[6] || '').trim();
        const transportadoraStr = (row[7] || '').trim().toUpperCase();
        const productCodesStr = (row[13] || '').trim();
        const productDescStr = (row[14] || '').trim();
        const quantityStr = (row[15] || '').trim();
        const unitPriceStr = (row[16] || '').trim();
        const totalStr = (row[17] || '').trim();
        const textoStr = (row[18] || '').trim();

        // Find client
        const client = clientByOldCode[oldClientCode];
        if (!client) {
          result.errors.push(`Cliente não encontrado (cód antigo: ${oldClientCode})`);
          results.push(result);
          continue;
        }
        result.client_name = client.name || clientName;

        // Determine delivery modality from transportadora (column H)
        let deliveryModality, osType;
        if (transportadoraStr.includes('MELHOR ENVIO')) {
          deliveryModality = 'Envio';
          osType = 'Expedição';
        } else if (transportadoraStr.includes('NOSSO CARRO') || transportadoraStr.includes('LUIZ CLAUDIO')) {
          deliveryModality = 'Entrega + Instalação';
          osType = 'Entrega + Instalação';
        } else {
          deliveryModality = 'Envio';
          osType = 'Expedição';
        }
        result.delivery_modality = deliveryModality;
        result.os_type = osType;

        // Determine payment condition
        let payCondId = '', payCondName = '';
        if (payCondition.includes('PIX') || payCondition.includes('TRANSFERÊNCIA')) {
          payCondId = pixPay?.id || '';
          payCondName = pixPay?.name || 'PIX';
        } else {
          payCondId = brazonLinkPay?.id || '';
          payCondName = brazonLinkPay?.name || 'Brazon Link Crédito Parcelado (Legado)';
        }

        // Match seller
        const repStr = (row[12] || '').trim();
        const repName = repStr.replace(/\[.*?\]/, '').trim();
        const repUpper = repName.toUpperCase();
        let sellerId = '', sellerName = '', sellerNote = '';

        if (repUpper.includes('SITE BRAZON')) {
          sellerId = siteBrazonSeller?.id || '';
          sellerName = siteBrazonSeller?.name || 'Site Brazon';
        } else {
          let matchedSeller = sellers.find(s => s.name.toUpperCase() === repUpper);
          if (!matchedSeller) {
            matchedSeller = sellers.find(s =>
              s.name.toUpperCase().includes(repUpper) || repUpper.includes(s.name.toUpperCase())
            );
          }
          if (matchedSeller) {
            sellerId = matchedSeller.id;
            sellerName = matchedSeller.name;
          } else if (mariaEduarda) {
            sellerId = mariaEduarda.id;
            sellerName = mariaEduarda.name;
            sellerNote = `Vendedora original: ${repName}`;
          }
        }

        // Parse products
        const productCodes = productCodesStr.split(',').map(s => s.trim()).filter(s => s);
        const productDescs = splitBySlashExcludingParens(productDescStr);
        const unitPrices = unitPriceStr.split('/').map(s => parseBrazilianNumber(s));
        const quantity = parseBrazilianNumber(quantityStr);

        const items = [];
        const unmatchedProducts = [];

        for (let i = 0; i < productCodes.length; i++) {
          const code = productCodes[i];
          const desc = (productDescs[i] || productDescStr || '').trim();
          const price = unitPrices[i] !== undefined ? unitPrices[i] : (unitPrices[0] || 0);
          const qty = productCodes.length > 1 ? 1 : quantity;

          const product = matchProduct(code, desc, products, productByShortDesc);

          if (product) {
            items.push({
              product_id: product.id,
              product_name: product.name,
              quantity: qty,
              unit_price: price,
              total: Math.round(price * qty * 100) / 100
            });
          } else {
            unmatchedProducts.push({ code, desc });
            items.push({
              product_id: '',
              product_name: desc || code,
              quantity: qty,
              unit_price: price,
              total: Math.round(price * qty * 100) / 100
            });
          }
        }

        if (unmatchedProducts.length > 0) {
          result.warnings.push(`${unmatchedProducts.length} produto(s) não localizado(s): ${unmatchedProducts.map(p => p.code).join(', ')}`);
          result.unmatched_products = unmatchedProducts.map(p => p.code);
        }
        result.items_count = items.length;

        // Parse delivery address
        const deliveryAddr = parseAddress(row[9], row[10], row[11]);

        // Compare with client's registered address
        const clientStreet = (client.street || '').toUpperCase().trim();
        const deliveryStreet = (deliveryAddr.street || '').toUpperCase().trim();
        const isDifferentAddress = deliveryStreet && (
          (clientStreet && clientStreet !== deliveryStreet) ||
          ((client.city || '').toUpperCase() !== (deliveryAddr.city || '').toUpperCase())
        );

        // Extract sale date from Status (for faturado) or use today
        let saleDate = new Date().toISOString().split('T')[0];
        const dateMatch = statusStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (dateMatch) {
          saleDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        }

        // Build notes
        let notes = `Pedido antigo: ${pedidoNum}`;
        if (sellerNote) notes += ` | ${sellerNote}`;
        if (textoStr) notes += ` | ${textoStr}`;

        // Build sale object
        const totalValue = parseBrazilianNumber(totalStr);
        const itemsTotal = items.reduce((sum, i) => sum + (i.total || 0), 0);

        const saleData = {
          order_number: `P${String(nextOrderNum).padStart(3, '0')}`,
          client_id: client.id,
          client_name: client.name || clientName,
          date: saleDate,
          seller_id: sellerId,
          seller_name: sellerName,
          items,
          total: Math.round(itemsTotal * 100) / 100,
          grand_total: totalValue,
          freight: Math.max(0, Math.round((totalValue - itemsTotal) * 100) / 100),
          delivery_modality: deliveryModality,
          delivery_different: isDifferentAddress,
          delivery_address: deliveryAddr,
          billing_address: {
            zip_code: client.zip_code || '',
            street: client.street || '',
            number: client.number || '',
            neighborhood: client.neighborhood || '',
            city: client.city || '',
            state: client.state || ''
          },
          payments: [{
            condition_id: payCondId,
            condition_name: payCondName,
            amount: totalValue,
            payment_status: isFaturado ? 'Realizada' : 'Pendente',
            payment_moment: isFaturado ? 'Antecipada' : 'Na Entrega'
          }],
          stage: isFaturado ? 'Pagamento Aprovado' : 'Confirmada',
          confirmation_type: isFaturado ? 'Total' : 'Parcial',
          notes
        };

        result.order_number = saleData.order_number;
        result.imported = true;

        if (!dry_run) {
          if (isDifferentAddress && deliveryAddr.street && deliveryAddr.city) {
            addressesToCreate.push({
              client_id: client.id,
              label: 'Entrega',
              street: deliveryAddr.street,
              number: deliveryAddr.number,
              complement: deliveryAddr.complement,
              neighborhood: deliveryAddr.neighborhood,
              city: deliveryAddr.city,
              state: deliveryAddr.state
            });
          }

          const saleIndex = salesToCreate.length;
          salesToCreate.push(saleData);

          if (isFaturado) {
            osToCreate.push({
              saleIndex,
              osType,
              deliveryModality,
              deliveryAddr,
              client_id: client.id,
              client_name: client.name || clientName,
              notes,
              sale_order_number: saleData.order_number
            });
          }
        }

        nextOrderNum++;

      } catch (err) {
        result.errors.push(err.message || String(err));
      }

      results.push(result);
    }

    // === 7. BULK CREATE (if not dry_run) ===
    let createdCount = 0;
    let osCount = 0;

    if (!dry_run && salesToCreate.length > 0) {
      // Create addresses
      if (addressesToCreate.length > 0) {
        await base44.asServiceRole.entities.Address.bulkCreate(addressesToCreate);
      }

      // Create sales
      const createdSales = await base44.asServiceRole.entities.Sale.bulkCreate(salesToCreate);
      createdCount = createdSales.length;

      // Create OS for faturado sales — match by order_number (not array index)
      if (osToCreate.length > 0) {
        const saleMap = {};
        for (const s of createdSales) {
          if (s.order_number) saleMap[s.order_number] = s;
        }

        const osData = [];
        const saleUpdates = [];
        for (const o of osToCreate) {
          const sale = saleMap[o.sale_order_number];
          if (!sale) continue;
          const code = `OS${String(nextOSNum++).padStart(6, '0')}`;
          osData.push({
            code,
            client_id: o.client_id,
            client_name: o.client_name,
            sale_id: sale.id,
            sale_order_number: o.sale_order_number,
            type: o.osType,
            delivery_modality: o.deliveryModality,
            delivery_address: o.deliveryAddr,
            date: new Date().toISOString().split('T')[0],
            status: 'Produção/Expedição',
            has_pending_payment: false,
            pending_payment_amount: 0,
            technician_notes: '',
            service_description: `OS de ${o.osType} — Pedido ${o.sale_order_number}`
          });
          saleUpdates.push({ id: sale.id, stage: 'Em OS' });
        }

        if (osData.length > 0) {
          await base44.asServiceRole.entities.ServiceOrder.bulkCreate(osData);
          osCount = osData.length;
        }
        if (saleUpdates.length > 0) {
          await base44.asServiceRole.entities.Sale.bulkUpdate(saleUpdates);
        }
      }
    }

    // === 8. RETURN REPORT ===
    const imported = results.filter(r => r.imported).length;
    const failed = results.filter(r => !r.imported).length;
    const faturados = results.filter(r => r.is_faturado).length;
    const withWarnings = results.filter(r => r.warnings.length > 0).length;

    return Response.json({
      dry_run,
      total_rows: csvDataRows.length,
      imported,
      failed,
      faturados,
      with_warnings: withWarnings,
      created_sales: createdCount,
      created_os: osCount,
      results
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});

// === HELPER FUNCTIONS ===

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\r') {
        // skip
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function parseBrazilianNumber(str) {
  if (!str) return 0;
  str = String(str).trim().replace(/\s/g, '').replace(/R\$/g, '').replace(/"/g, '');
  if (!str || str === '-' || !/[\d]/.test(str)) return 0;
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  return parseFloat(str) || 0;
}

function splitBySlashExcludingParens(str) {
  if (!str) return [''];
  const parts = [];
  let current = '';
  let parenDepth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (ch === '/' && parenDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.length > 0 ? parts : [str || ''];
}

function parseAddress(addressStr, neighborhood, cityState) {
  addressStr = (addressStr || '').trim();
  let street = addressStr;
  let number = '';
  let complement = '';

  const commaIdx = addressStr.indexOf(',');
  if (commaIdx >= 0) {
    street = addressStr.substring(0, commaIdx).trim();
    const rest = addressStr.substring(commaIdx + 1).trim();
    const dashIdx = rest.indexOf(' - ');
    if (dashIdx >= 0) {
      number = rest.substring(0, dashIdx).trim();
      complement = rest.substring(dashIdx + 3).trim();
    } else {
      number = rest;
    }
  }

  let city = '';
  let state = '';
  if (cityState) {
    const parts = cityState.split(' - ');
    if (parts.length >= 2) {
      city = parts[0].trim();
      state = parts[1].trim();
    } else {
      city = cityState.trim();
    }
  }

  return {
    zip_code: '',
    street,
    number,
    complement,
    neighborhood: (neighborhood || '').trim(),
    city,
    state
  };
}

function matchProduct(code, description, allProducts, byShortDesc) {
  const codeUpper = (code || '').toUpperCase().trim();

  // Try 1: exact short_description match
  if (byShortDesc[codeUpper]) return byShortDesc[codeUpper];

  // Try 2: short_description contains code
  const partialSd = allProducts.find(p =>
    p.short_description &&
    p.short_description.toUpperCase().trim() === codeUpper
  );
  if (partialSd) return partialSd;

  const desc = (description || '').toUpperCase().trim();
  if (!desc) return null;

  // Try 3: capsule code (A2010, A1040, A2020, N2010, etc.)
  const capsuleMatch = desc.match(/(A\d{4}|N\d{4})/);
  if (capsuleMatch) {
    const capsuleCode = capsuleMatch[1];
    const match = allProducts.find(p =>
      (p.name || '').toUpperCase().includes(capsuleCode)
    );
    if (match) return match;
  }

  // Try 4: purifier model match
  const modelMatch = desc.match(/(IPURE|FITZON|ICEZON|\bICE\b)/);
  if (modelMatch) {
    const model = modelMatch[1];
    const color = desc.match(/(BRANCO|PRETO|CINZA)/)?.[1] || '';
    const voltage = desc.match(/(127V|220V)/)?.[1] || '';
    const type = desc.match(/(ALCALINO|NEUTRO)/)?.[1] || '';

    const keywords = [model];
    if (color) keywords.push(color);
    if (voltage) keywords.push(voltage);

    const matches = allProducts.filter(p => {
      const pname = (p.name || '').toUpperCase();
      return keywords.every(kw => pname.includes(kw));
    });

    if (matches.length >= 1) {
      if (type && matches.length > 1) {
        const withType = matches.filter(p => (p.name || '').toUpperCase().includes(type));
        if (withType.length >= 1) return withType[0];
      }
      return matches[0];
    }
  }

  // Try 5: torneira
  if (desc.includes('TORNEIRA')) {
    const matches = allProducts.filter(p => {
      const pname = (p.name || '').toUpperCase();
      return pname.includes('TORNEIRA') && (pname.includes('GOURMET') || pname.includes('BANCADA'));
    });
    if (matches.length >= 1) return matches[0];
  }

  // Try 6: generic keyword match
  const stopWords = ['PUR', 'BRAZON', 'DE', 'PARA', 'C', 'COM', 'A', 'O', 'E', 'DA', 'DO', 'EM', 'SEM'];
  const words = desc.split(/\s+/).filter(w =>
    w.length > 2 && !stopWords.includes(w)
  );

  if (words.length > 0) {
    const matches = allProducts.filter(p => {
      const pname = (p.name || '').toUpperCase();
      return words.every(w => pname.includes(w));
    });
    if (matches.length === 1) return matches[0];

    if (matches.length > 1 && words.length > 1) {
      const firstWordMatch = matches.filter(p =>
        (p.name || '').toUpperCase().includes(words[0])
      );
      if (firstWordMatch.length >= 1) return firstWordMatch[0];
    }

    if (words.length > 1) {
      const matches2 = allProducts.filter(p => {
        const pname = (p.name || '').toUpperCase();
        return words.slice(0, 2).every(w => pname.includes(w));
      });
      if (matches2.length >= 1) return matches2[0];
    }
  }

  return null;
}