import React from "react";
import { Button } from "@/components/ui/button";
import { Printer, FileDown } from "lucide-react";

const LOGO_URL = "https://media.base44.com/images/public/6a1f6fc98b44d834e281aa51/851be8c4e_logobrazon.jpg";

function Card({ children, variant = "" }) {
  const variants = {
    highlight: "border-amber-300 bg-amber-50",
    success: "border-green-300 bg-green-50",
    danger: "border-red-300 bg-red-50",
    "": "border-slate-200 bg-white",
  };
  return (
    <div className={`border rounded-xl px-5 py-4 mb-3 ${variants[variant]}`}>
      {children}
    </div>
  );
}

function Tag({ children, color = "blue" }) {
  const colors = {
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ml-1.5 ${colors[color]}`}>{children}</span>;
}

function Section({ icon, title, children }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="text-base font-bold text-slate-900 mb-3.5 pl-3 border-l-4 border-sky-500 flex items-center gap-2">
        <span className="text-lg">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

export default function SalesRulesGuide() {
  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Print button bar */}
      <div className="no-print sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between max-w-3xl mx-auto">
        <span className="text-sm font-semibold text-slate-700">Guia de Regras de Venda</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto bg-white px-8 py-10 print:p-6 shadow-sm print:shadow-none">
        {/* HEADER */}
        <div className="flex items-center gap-5 border-b-[3px] border-sky-500 pb-5 mb-7">
          <img src={LOGO_URL} alt="Brazon" className="w-36 h-12 object-contain" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Guia de Regras de Venda</h1>
            <p className="text-sm text-slate-500 mt-0.5">Parcelamento · Desconto · Frete · Taxa de Deslocamento</p>
          </div>
        </div>

        {/* INTRO */}
        <div className="bg-gradient-to-br from-sky-50 to-sky-100 border border-sky-200 rounded-xl px-6 py-5 mb-7 break-inside-avoid">
          <h2 className="text-base font-bold text-sky-800 mb-2 flex items-center gap-2">📍 Onde encontrar a Tabela de Preços</h2>
          <p className="text-sm text-sky-700">
            A tabela de preços oficial fica no menu <strong>Precificação → Tabela de Preços</strong>. Nela você encontra o preço à vista, 6x e 12x de cada produto, separados por "Dentro de MG" e "Fora de MG".
          </p>
          <div className="inline-flex items-center gap-1.5 bg-white border border-sky-300 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-sky-900 mt-2.5">
            📁 Menu Lateral → Precificação → Tabela de Preços
          </div>
          <p className="text-sm text-sky-700 mt-2.5">
            Use a tabela como referência para precificar suas vendas. O sistema calcula os preços automaticamente a partir do custo, impostos, custos de venda e margem. Você também pode definir um preço direto (à vista) no próprio produto.
          </p>
        </div>

        {/* REGRA 1: PARCELAMENTO */}
        <Section icon="💳" title="Regra de Parcelamento por Valor">
          <p className="text-sm text-slate-600 mb-3">
            O número máximo de parcelas permitido depende do valor total da venda. O sistema filtra automaticamente as condições de pagamento disponíveis conforme o total do pedido.
          </p>
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="bg-sky-500 text-white">
                <th className="text-left px-3 py-2.5 font-semibold text-xs rounded-l-lg">Valor Total da Venda</th>
                <th className="text-center px-3 py-2.5 font-semibold text-xs">Parcelamento Máximo</th>
                <th className="text-center px-3 py-2.5 font-semibold text-xs rounded-r-lg">Tabela de Referência (Desconto)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="even:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-200 font-bold text-slate-900">Abaixo de R$ 300,00</td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center font-bold">Até 4x <Tag color="amber">6x</Tag></td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center">Tabela 6x</td>
              </tr>
              <tr className="even:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-200 font-bold text-slate-900">R$ 300,00 a R$ 500,00</td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center font-bold">Até 6x <Tag color="blue">6x</Tag></td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center">Tabela 6x</td>
              </tr>
              <tr className="even:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-200 font-bold text-slate-900">R$ 501,00 a R$ 999,00</td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center font-bold">Até 8x <Tag color="blue">12x</Tag></td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center">Tabela 12x</td>
              </tr>
              <tr className="even:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-200 font-bold text-slate-900">Acima de R$ 1.000,00</td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center font-bold">Até 12x <Tag color="green">12x</Tag></td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center">Tabela 12x</td>
              </tr>
            </tbody>
          </table>
          <div className="bg-green-50 border-l-4 border-green-500 rounded-r-lg px-4 py-3">
            <strong className="text-green-800">💡 Dica:</strong>
            <p className="text-sm text-green-700">O desconto à vista nunca pode fazer o preço cair abaixo da tabela de referência (6x ou 12x, conforme a faixa). O sistema calcula o desconto máximo automaticamente e exibe o limite na aba de Pagamento.</p>
          </div>
        </Section>

        {/* REGRA 2: DESCONTO À VISTA */}
        <Section icon="🏷️" title="Desconto à Vista">
          <Card variant="success">
            <h3 className="text-sm font-bold mb-1.5 text-slate-900">✅ Permitido por padrão</h3>
            <p className="text-sm text-slate-600">O desconto à vista é liberado na maioria dos cenários. O sistema calcula o <strong>desconto máximo</strong> com base na diferença entre o preço praticado e a tabela de referência (6x ou 12x).</p>
          </Card>
          <Card variant="danger">
            <h3 className="text-sm font-bold mb-1.5 text-slate-900">🚫 Bloqueado em vendas abaixo de R$ 300,00 (Entrega/Instalação)</h3>
            <p className="text-sm text-slate-600">Vendas abaixo de <strong>R$ 300,00</strong> nas modalidades <strong>Entrega Própria</strong> ou <strong>Entrega + Instalação</strong> <strong>não podem</strong> ter desconto à vista — deve-se trabalhar com a <strong>tabela de 6x</strong>.</p>
            <p className="text-sm text-slate-600 mt-1.5"><Tag color="red">Bloqueado</Tag> Modalidade Envio está liberada para desconto à vista.</p>
          </Card>
          <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-lg px-4 py-3">
            <strong className="text-amber-800">⚠️ Atenção:</strong>
            <p className="text-sm text-amber-700">Ao tentar salvar uma venda com desconto acima do limite, o sistema bloqueia e exibe o valor máximo permitido. Ajuste o desconto e tente novamente.</p>
          </div>
        </Section>

        {/* REGRA 3: ISENÇÃO DE FRETE */}
        <Section icon="🚚" title="Isenção de Frete">
          <p className="text-sm text-slate-600 mb-3">
            A isenção de frete (conceder o frete como desconto para o cliente) só é permitida quando existe <strong>margem financeira disponível</strong> para absorver o custo.
          </p>
          <div className="space-y-3 mb-3">
            <div className="flex gap-3.5">
              <div className="flex-shrink-0 w-7 h-7 bg-sky-500 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
              <p className="text-sm text-slate-600 pt-1">O sistema compara a <strong>taxa financeira da tabela cobrada</strong> (6x para produtos até R$ 500, 12x para produtos acima de R$ 500) com a <strong>taxa da condição de pagamento escolhida</strong> pelo cliente.</p>
            </div>
            <div className="flex gap-3.5">
              <div className="flex-shrink-0 w-7 h-7 bg-sky-500 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
              <p className="text-sm text-slate-600 pt-1">A diferença entre essas taxas, multiplicada pelo valor dos itens, gera a <strong>margem financeira disponível</strong> para absorver o frete.</p>
            </div>
            <div className="flex gap-3.5">
              <div className="flex-shrink-0 w-7 h-7 bg-sky-500 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
              <p className="text-sm text-slate-600 pt-1">Se o valor do frete for <strong>menor ou igual</strong> à margem disponível, a isenção é liberada. Caso contrário, o sistema bloqueia e mostra a margem calculada.</p>
            </div>
          </div>
          <Card variant="highlight">
            <h3 className="text-sm font-bold mb-1 text-slate-900">⚠️ Modalidade Envio à Vista</h3>
            <p className="text-sm text-slate-600">Na modalidade <strong>Envio</strong> com pagamento <strong>à vista</strong> (menor valor), se não houver margem financeira (produtos também cobrados à vista), a isenção é <strong>bloqueada</strong> — não é possível absorver o frete.</p>
          </Card>
          <Card variant="danger">
            <h3 className="text-sm font-bold mb-1 text-slate-900">🚫 Vendas abaixo de R$ 150,00</h3>
            <p className="text-sm text-slate-600">Nestas vendas, o frete <strong>não pode ser isentado</strong> — deve-se cobrar a taxa de deslocamento (ver próxima regra).</p>
          </Card>
        </Section>

        {/* REGRA 4: TAXA DE DESLOCAMENTO */}
        <Section icon="📍" title="Taxa de Deslocamento">
          <Card variant="highlight">
            <h3 className="text-sm font-bold mb-1 text-slate-900">💰 R$ 30,00 automático</h3>
            <p className="text-sm text-slate-600">Vendas com valor total <strong>abaixo de R$ 150,00</strong> nas modalidades <strong>Entrega Própria</strong> ou <strong>Entrega + Instalação</strong> recebem automaticamente uma <strong>taxa de deslocamento de R$ 30,00</strong>.</p>
          </Card>
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="bg-sky-500 text-white">
                <th className="text-left px-3 py-2.5 font-semibold text-xs rounded-l-lg">Modalidade</th>
                <th className="text-center px-3 py-2.5 font-semibold text-xs">Venda &lt; R$ 150</th>
                <th className="text-center px-3 py-2.5 font-semibold text-xs rounded-r-lg">Venda ≥ R$ 150</th>
              </tr>
            </thead>
            <tbody>
              <tr className="even:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-200 font-bold text-slate-900">Envio</td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center"><Tag color="green">Sem taxa</Tag></td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center"><Tag color="green">Sem taxa</Tag></td>
              </tr>
              <tr className="even:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-200 font-bold text-slate-900">Entrega Própria</td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center"><Tag color="amber">+ R$ 30,00</Tag></td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center"><Tag color="green">Sem taxa</Tag></td>
              </tr>
              <tr className="even:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-200 font-bold text-slate-900">Entrega + Instalação</td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center"><Tag color="amber">+ R$ 30,00</Tag></td>
                <td className="px-3 py-2.5 border-b border-slate-200 text-center"><Tag color="green">Sem taxa</Tag></td>
              </tr>
            </tbody>
          </table>
          <div className="bg-green-50 border-l-4 border-green-500 rounded-r-lg px-4 py-3">
            <strong className="text-green-800">💡 Como funciona:</strong>
            <p className="text-sm text-green-700">A taxa é adicionada automaticamente ao total geral da venda. Você verá um aviso amarelo nos totais do pedido indicando a cobrança da taxa de deslocamento.</p>
          </div>
        </Section>

        {/* REGRA 5: PRODUTOS FORA DA TABELA */}
        <Section icon="❓" title="Produtos Fora da Tabela de Preços">
          <Card variant="highlight">
            <h3 className="text-sm font-bold mb-1.5 text-slate-900">📋 Produto sem preço cadastrado na tabela</h3>
            <p className="text-sm text-slate-600">Quando um produto <strong>não estiver na Tabela de Preços</strong> (sem preço à vista definido), o vendedor deve <strong>consultar o valor junto à supervisão</strong> antes de precificar a venda.</p>
            <p className="text-sm text-slate-600 mt-2">Após a confirmação do valor com a supervisão, o vendedor pode <strong>lançar o preço de forma livre</strong> diretamente no item da venda, digitando o valor unitário acordado.</p>
          </Card>
          <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-lg px-4 py-3">
            <strong className="text-amber-800">⚠️ Importante:</strong>
            <p className="text-sm text-amber-700">Nunca invente ou chute um preço. Sempre confirme com a supervisão primeiro para garantir que o valor cubra os custos e a margem mínima da empresa.</p>
          </div>
        </Section>

        {/* RESUMO RÁPIDO */}
        <Section icon="📋" title="Resumo Rápido">
          <Card>
            <p className="text-sm text-slate-600 mb-1.5"><strong>1.</strong> Tabela de preços → Menu <strong>Precificação → Tabela de Preços</strong></p>
            <p className="text-sm text-slate-600 mb-1.5"><strong>2.</strong> Parcelamento filtrado automaticamente pelo valor total da venda</p>
            <p className="text-sm text-slate-600 mb-1.5"><strong>3.</strong> Desconto à vista limitado pela tabela de referência (6x ou 12x)</p>
            <p className="text-sm text-slate-600 mb-1.5"><strong>4.</strong> Abaixo de R$ 300 (Entrega/Instalação): sem desconto à vista, usar tabela 6x</p>
            <p className="text-sm text-slate-600 mb-1.5"><strong>5.</strong> Isenção de frete só com margem financeira disponível</p>
            <p className="text-sm text-slate-600 mb-1.5"><strong>6.</strong> Abaixo de R$ 150 (Entrega/Instalação): + R$ 30,00 de deslocamento</p>
            <p className="text-sm text-slate-600"><strong>7.</strong> Produto fora da tabela: consultar supervisão e lançar o preço livre na venda</p>
          </Card>
        </Section>

        {/* FOOTER */}
        <div className="border-t-2 border-slate-200 mt-8 pt-4 text-center text-xs text-slate-400">
          Grupo Brazon &nbsp;|&nbsp; Guia de Regras de Venda &nbsp;|&nbsp; Documento gerado em {new Date().toLocaleString("pt-BR")}
        </div>
      </div>
    </div>
  );
}