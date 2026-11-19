// Gerado de base44/functions/parsePurchaseXml/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";
import { XMLParser } from 'npm:fast-xml-parser@4.5.0';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { file_url } = body;
    if (!file_url) return Response.json({ error: 'file_url é obrigatório' }, { status: 400 });

    const xmlRes = await fetch(file_url);
    const xmlText = await xmlRes.text();
    const parser = new XMLParser({ ignoreAttributes: true });
    const parsed = parser.parse(xmlText);

    const infNFe = parsed?.nfeProc?.NFe?.infNFe || parsed?.NFe?.infNFe || parsed?.infNFe;
    if (!infNFe) return Response.json({ error: 'XML não possui estrutura NF-e válida' }, { status: 400 });

    const emit = infNFe.emit || {};
    const ide = infNFe.ide || {};
    const det = infNFe.det ? (Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det]) : [];

    const items = det.map(d => {
      const p = d.prod || {};
      return {
        external_code: String(p.cProd || ''),
        name: String(p.xProd || ''),
        quantity: parseFloat(p.qCom || 0),
        unit_cost: parseFloat(p.vUnCom || 0),
        total: parseFloat(p.vProd || 0),
        ncm: String(p.NCM || ''),
        cfop: String(p.CFOP || ''),
        unit: String(p.uCom || ''),
      };
    });

    const total = infNFe.total?.ICMSTot || {};
    const chave = String(parsed?.nfeProc?.protNFe?.infProt?.chNFe || '');

    return Response.json({
      supplier: {
        document: String(emit.CNPJ || emit.CPF || ''),
        name: String(emit.xNome || ''),
      },
      invoice: {
        number: String(ide.nNF || ''),
        serie: String(ide.serie || ''),
        date: String(ide.dEmi || ''),
        chave,
      },
      items,
      total: {
        products: parseFloat(total.vProd || 0),
        freight: parseFloat(total.vFrete || 0),
        discount: parseFloat(total.vDesc || 0),
        grand_total: parseFloat(total.vNF || 0),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});