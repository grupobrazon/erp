// Gera um PDF didático com as regras de parcelamento, desconto, frete e taxa de deslocamento.
// Usa a mesma abordagem do SalePdfExport: HTML em nova aba → imprimir/salvar PDF.

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";

function buildHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Guia de Regras de Venda — Grupo Brazon</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #f1f5f9; line-height: 1.6; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 48px 56px; }
  @media print {
    body { background: #fff; }
    .page { padding: 24px 28px; }
    .no-print { display: none !important; }
    .section { break-inside: avoid; }
  }

  /* HEADER */
  .header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 28px; }
  .header img { width: 140px; height: 48px; object-fit: contain; }
  .header h1 { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
  .header p { font-size: 13px; color: #64748b; margin-top: 2px; }

  /* INTRO */
  .intro { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 1px solid #bae6fd; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
  .intro h2 { font-size: 15px; font-weight: 700; color: #0369a1; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  .intro p { font-size: 13px; color: #075985; }
  .intro .path { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: #0c4a6e; margin-top: 10px; }

  /* SECTION */
  .section { margin-bottom: 26px; }
  .section-title { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 14px; padding-left: 12px; border-left: 4px solid #0ea5e9; display: flex; align-items: center; gap: 8px; }
  .section-title .icon { font-size: 18px; }

  /* CARDS */
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; background: #fff; }
  .card.highlight { border-color: #fcd34d; background: #fffbeb; }
  .card.success { border-color: #86efac; background: #f0fdf4; }
  .card.danger { border-color: #fca5a5; background: #fef2f2; }
  .card h3 { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #1e293b; }
  .card p { font-size: 13px; color: #475569; margin-bottom: 6px; }
  .card p:last-child { margin-bottom: 0; }
  .card .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; margin-left: 6px; }
  .tag-green { background: #dcfce7; color: #166534; }
  .tag-amber { background: #fef3c7; color: #92400e; }
  .tag-red { background: #fee2e2; color: #991b1b; }
  .tag-blue { background: #dbeafe; color: #1e40af; }

  /* TABLE */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px; }
  th { background: #0ea5e9; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; }
  th:first-child { border-radius: 8px 0 0 0; }
  th:last-child { border-radius: 0 8px 0 0; }
  td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .td-bold { font-weight: 700; color: #0f172a; }
  .td-center { text-align: center; }

  /* STEPS */
  .steps { counter-reset: step; }
  .step { display: flex; gap: 14px; margin-bottom: 12px; }
  .step-num { flex-shrink: 0; width: 28px; height: 28px; background: #0ea5e9; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
  .step-content { flex: 1; padding-top: 4px; }
  .step-content p { font-size: 13px; color: #475569; }

  /* TIP BOX */
  .tip { background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 12px; }
  .tip strong { color: #166534; }
  .tip p { font-size: 13px; color: #15803d; }
  .warn { background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 12px; }
  .warn strong { color: #92400e; }
  .warn p { font-size: 13px; color: #b45309; }

  /* FOOTER */
  .footer { border-top: 2px solid #e2e8f0; margin-top: 32px; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; }

  /* PRINT BUTTON */
  .no-print { position: fixed; top: 20px; right: 20px; display: flex; gap: 8px; z-index: 999; }
  .no-print button { border: none; padding: 10px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-print { background: #0ea5e9; color: #fff; }
  .btn-close { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0 !important; }
</style>
</head>
<body>

<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>

<div class="page">

  <!-- HEADER -->
  <div class="header">
    <img src="${LOGO_URL}" alt="Brazon" />
    <div>
      <h1>Guia de Regras de Venda</h1>
      <p>Parcelamento · Desconto · Frete · Taxa de Deslocamento</p>
    </div>
  </div>

  <!-- INTRO: ONDE FICA A TABELA DE PREÇOS -->
  <div class="intro section">
    <h2>📍 Onde encontrar a Tabela de Preços</h2>
    <p>A tabela de preços oficial fica no menu <strong>Precificação → Tabela de Preços</strong>. Nela você encontra o preço à vista, 6x e 12x de cada produto, separados por "Dentro de MG" e "Fora de MG".</p>
    <div class="path">📁 Menu Lateral → Precificação → Tabela de Preços</div>
    <p style="margin-top:10px;">Use a tabela como referência para precificar suas vendas. O sistema calcula os preços automaticamente a partir do custo, impostos, custos de venda e margem. Você também pode definir um preço direto (à vista) no próprio produto.</p>
  </div>

  <!-- REGRA 1: PARCELAMENTO -->
  <div class="section">
    <div class="section-title"><span class="icon">💳</span> Regra de Parcelamento por Valor</div>
    <p style="font-size:13px;color:#475569;margin-bottom:12px;">O número máximo de parcelas permitido depende do valor total da venda. O sistema filtra automaticamente as condições de pagamento disponíveis conforme o total do pedido.</p>
    <table>
      <thead>
        <tr>
          <th>Valor Total da Venda</th>
          <th class="td-center">Parcelamento Máximo</th>
          <th class="td-center">Tabela de Referência (Desconto)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="td-bold">Abaixo de R$ 300,00</td>
          <td class="td-center td-bold">Até 4x <span class="tag tag-amber">6x</span></td>
          <td class="td-center">Tabela 6x</td>
        </tr>
        <tr>
          <td class="td-bold">R$ 300,00 a R$ 500,00</td>
          <td class="td-center td-bold">Até 6x <span class="tag tag-blue">6x</span></td>
          <td class="td-center">Tabela 6x</td>
        </tr>
        <tr>
          <td class="td-bold">R$ 501,00 a R$ 999,00</td>
          <td class="td-center td-bold">Até 8x <span class="tag tag-blue">12x</span></td>
          <td class="td-center">Tabela 12x</td>
        </tr>
        <tr>
          <td class="td-bold">Acima de R$ 1.000,00</td>
          <td class="td-center td-bold">Até 12x <span class="tag tag-green">12x</span></td>
          <td class="td-center">Tabela 12x</td>
        </tr>
      </tbody>
    </table>
    <div class="tip">
      <strong>💡 Dica:</strong>
      <p>O desconto máximo é calculado com base na condição de pagamento selecionada. Para pagamentos <strong>parcelados</strong>, o piso é a tabela de referência (6x ou 12x, conforme a faixa). Para pagamento <strong>à vista</strong>, o piso é o preço à vista (1x) — permitindo o desconto à vista. O sistema exibe o limite na aba de Pagamento.</p>
    </div>
  </div>

  <!-- REGRA 2: DESCONTO À VISTA -->
  <div class="section">
    <div class="section-title"><span class="icon">🏷️</span> Desconto à Vista</div>
    <div class="card success">
      <h3>✅ Permitido por padrão</h3>
      <p>Para vendas <strong>100% à vista</strong>, o sistema permite aplicar o <strong>desconto de pagamento à vista</strong> — o preço pode ser reduzido do valor da tabela cobrada (6x ou 12x) até o <strong>preço à vista (1x)</strong>. O desconto máximo é calculado automaticamente.</p>
    </div>
    <div class="card danger">
      <h3>🚫 Bloqueado em vendas abaixo de R$ 300,00 (Entrega/Instalação)</h3>
      <p>Vendas abaixo de <strong>R$ 300,00</strong> nas modalidades <strong>Entrega Própria</strong> ou <strong>Entrega + Instalação</strong> <strong>não podem</strong> ter desconto à vista — deve-se trabalhar com a <strong>tabela de 6x</strong>.</p>
      <p style="margin-top:6px;"><span class="tag tag-red">Bloqueado</span> Modalidade Envio está liberada para desconto à vista.</p>
    </div>
    <div class="warn">
      <strong>⚠️ Atenção:</strong>
      <p>Ao tentar salvar uma venda com desconto acima do limite, o sistema bloqueia e exibe o valor máximo permitido. Ajuste o desconto e tente novamente.</p>
    </div>
  </div>

  <!-- REGRA 3: ISENÇÃO DE FRETE -->
  <div class="section">
    <div class="section-title"><span class="icon">🚚</span> Isenção de Frete</div>
    <p style="font-size:13px;color:#475569;margin-bottom:12px;">A isenção de frete (conceder o frete como desconto para o cliente) só é permitida quando existe <strong>margem financeira disponível</strong> para absorver o custo.</p>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-content">
          <p>O sistema compara a <strong>taxa financeira da tabela cobrada</strong> (6x para produtos até R$ 500, 12x para produtos acima de R$ 500) com a <strong>taxa da condição de pagamento escolhida</strong> pelo cliente.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-content">
          <p>A diferença entre essas taxas, multiplicada pelo valor dos itens, gera a <strong>margem financeira disponível</strong> para absorver o frete.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-content">
          <p>Se o valor do frete for <strong>menor ou igual</strong> à margem disponível, a isenção é liberada. Caso contrário, o sistema bloqueia e mostra a margem calculada.</p>
        </div>
      </div>
    </div>
    <div class="card highlight">
      <h3>⚠️ Modalidade Envio à Vista</h3>
      <p>Na modalidade <strong>Envio</strong> com pagamento <strong>à vista</strong> (menor valor), se não houver margem financeira (produtos também cobrados à vista), a isenção é <strong>bloqueada</strong> — não é possível absorver o frete.</p>
    </div>
    <div class="card danger">
      <h3>🚫 Vendas abaixo de R$ 150,00</h3>
      <p>Nestas vendas, o frete <strong>não pode ser isentado</strong> — deve-se cobrar a taxa de deslocamento (ver próxima regra).</p>
    </div>
  </div>

  <!-- REGRA 4: TAXA DE DESLOCAMENTO -->
  <div class="section">
    <div class="section-title"><span class="icon">📍</span> Taxa de Deslocamento</div>
    <div class="card highlight">
      <h3>💰 R$ 30,00 automático</h3>
      <p>Vendas com valor total <strong>abaixo de R$ 150,00</strong> nas modalidades <strong>Entrega Própria</strong> ou <strong>Entrega + Instalação</strong> recebem automaticamente uma <strong>taxa de deslocamento de R$ 30,00</strong>.</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>Modalidade</th>
          <th class="td-center">Venda &lt; R$ 150</th>
          <th class="td-center">Venda ≥ R$ 150</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="td-bold">Envio</td>
          <td class="td-center"><span class="tag tag-green">Sem taxa</span></td>
          <td class="td-center"><span class="tag tag-green">Sem taxa</span></td>
        </tr>
        <tr>
          <td class="td-bold">Entrega Própria</td>
          <td class="td-center"><span class="tag tag-amber">+ R$ 30,00</span></td>
          <td class="td-center"><span class="tag tag-green">Sem taxa</span></td>
        </tr>
        <tr>
          <td class="td-bold">Entrega + Instalação</td>
          <td class="td-center"><span class="tag tag-amber">+ R$ 30,00</span></td>
          <td class="center"><span class="tag tag-green">Sem taxa</span></td>
        </tr>
      </tbody>
    </table>
    <div class="tip">
      <strong>💡 Como funciona:</strong>
      <p>A taxa é adicionada automaticamente ao total geral da venda. Você verá um aviso amarelo nos totais do pedido indicando a cobrança da taxa de deslocamento.</p>
    </div>
  </div>

  <!-- REGRA 5: PRODUTOS FORA DA TABELA -->
  <div class="section">
    <div class="section-title"><span class="icon">❓</span> Produtos Fora da Tabela de Preços</div>
    <div class="card highlight">
      <h3>📋 Produto sem preço cadastrado na tabela</h3>
      <p>Quando um produto <strong>não estiver na Tabela de Preços</strong> (sem preço à vista definido), o vendedor deve <strong>consultar o valor junto à supervisão</strong> antes de precificar a venda.</p>
      <p style="margin-top:8px;">Após a confirmação do valor com a supervisão, o vendedor pode <strong>lançar o preço de forma livre</strong> diretamente no item da venda, digitando o valor unitário acordado.</p>
    </div>
    <div class="warn">
      <strong>⚠️ Importante:</strong>
      <p>Nunca invente ou chute um preço. Sempre confirme com a supervisão primeiro para garantir que o valor cubra os custos e a margem mínima da empresa.</p>
    </div>
  </div>

  <!-- RESUMO RÁPIDO -->
  <div class="section">
    <div class="section-title"><span class="icon">📋</span> Resumo Rápido</div>
    <div class="card">
      <p><strong>1.</strong> Tabela de preços → Menu <strong>Precificação → Tabela de Preços</strong></p>
      <p><strong>2.</strong> Parcelamento filtrado automaticamente pelo valor total da venda</p>
      <p><strong>3.</strong> Desconto à vista limitado pela tabela de referência (6x ou 12x)</p>
      <p><strong>4.</strong> Abaixo de R$ 300 (Entrega/Instalação): sem desconto à vista, usar tabela 6x</p>
      <p><strong>5.</strong> Isenção de frete só com margem financeira disponível</p>
      <p><strong>6.</strong> Abaixo de R$ 150 (Entrega/Instalação): + R$ 30,00 de deslocamento</p>
      <p><strong>7.</strong> Produto fora da tabela: consultar supervisão e lançar o preço livre na venda</p>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    Grupo Brazon &nbsp;|&nbsp; Guia de Regras de Venda &nbsp;|&nbsp; Documento gerado em ${new Date().toLocaleString("pt-BR")}
  </div>

</div>

</body>
</html>`;
}

export function openSalesRulesPdf() {
  const html = buildHtml();
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}