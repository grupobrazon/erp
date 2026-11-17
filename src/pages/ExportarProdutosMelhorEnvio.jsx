import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import * as XLSX from "xlsx";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Loader2, Package } from "lucide-react";

export default function ExportarProdutosMelhorEnvio() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.Product.list("-created_date", 1000);
        setProducts(all || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleExport = () => {
    setExporting(true);
    try {
      const rows = products.map((p) => ({
        "SKU / Código": p.code || "",
        "Descrição": p.name || "",
        "Descrição Curta": p.short_description || "",
        "Marca": p.brand || "",
        "Grupo": p.group_name || "",
        "Subgrupo": p.subgroup_name || "",
        "Tipo de Produto": p.product_type || "",
        "NCM": p.ncm || "",
        "Peso (kg)": p.weight ?? "",
        "Largura (cm)": p.width ?? "",
        "Comprimento (cm)": p.length ?? "",
        "Profundidade/Altura (cm)": p.depth ?? "",
        "Volume (m³)": p.volume ?? "",
        "Embalagem": p.packaging || "",
        "Origem": p.origin || "",
        "Unidade": p.unit || "",
        "Estoque Atual": p.current_stock ?? 0,
        "Ativo": p.is_active ? "Sim" : "Não",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 18 }, { wch: 40 }, { wch: 25 }, { wch: 15 },
        { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 },
        { wch: 14 }, { wch: 8 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Produtos");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `produtos-melhor-envio_${dateStr}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const comDimensoes = products.filter((p) => p.weight || p.width || p.length || p.depth).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Exportar Produtos para Melhor Envio"
        description="Planilha Excel com todos os produtos, SKUs e especificações para cadastro na Melhor Envio."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Resumo
          </CardTitle>
          <CardDescription>
            {loading ? "Carregando produtos..." : `${products.length} produtos encontrados · ${comDimensoes} com dimensões preenchidas`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A planilha contém: SKU/Código, descrição, marca, grupo, NCM, peso, dimensões (largura, comprimento, profundidade), volume, embalagem, origem e estoque.
              </p>
              <Button onClick={handleExport} disabled={exporting || products.length === 0} size="lg">
                {exporting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                ) : (
                  <><Download className="h-4 w-4" /> Baixar Excel</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}