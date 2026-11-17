// Extrai e formata o erro de transmissão de NF-e/NFS-e em uma mensagem clara para o usuário.
// O backend (emitNFe/emitNFSe) retorna campos estruturados: motivo, codigo, http_status, campo.
// Fallbacks cobrem respostas antigas e erros de rede genéricos.

const safeStr = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((e) => e?.mensagem || e?.campo || JSON.stringify(e)).join("; ");
  if (typeof v === "object") return v.mensagem || v.error || JSON.stringify(v);
  return String(v);
};

// Monta a orientação de correção quando o campo/motivo permite identificar o problema.
const buildOrientacao = (motivo, campo) => {
  const m = (motivo || "").toLowerCase();
  if (!motivo) return "";
  if (campo) return `Verifique o campo "${campo}" nos dados da NF-e/do cadastro e corrija antes de retransmitir.`;
  if (m.includes("cep") || m.includes("endereço") || m.includes("endereco")) return "Confira o endereço e o CEP do destinatário (e do emitente) no cadastro.";
  if (m.includes("ncm")) return "Confira o NCM do produto (cadastro) — deve ter 8 dígitos válidos.";
  if (m.includes("cfop")) return "Confira o CFOP selecionado para a operação.";
  if (m.includes("cpf") || m.includes("cnpj") || m.includes("documento")) return "Confira o CPF/CNPJ do destinatário no cadastro do cliente.";
  if (m.includes("inscrição estadual") || m.includes("inscricao estadual") || m.includes("ie ")) return "Confira a Inscrição Estadual do destinatário/emitente.";
  if (m.includes("valor") || m.includes("total") || m.includes("zero")) return "Confira os valores dos itens e o total da operação.";
  if (m.includes("certificado")) return "Verifique o certificado digital do emitente no provedor Focus NFe.";
  if (m.includes("emitente")) return "Verifique os dados do emitente (local de faturamento) no cadastro.";
  return "Verifique os dados da NF-e e do cadastro do cliente/emitente e tente novamente.";
};

// Retorna { title, description, motivo, orientacao, codigo, httpStatus } prontos para exibir/toast.
export function parseNfeError(err) {
  const d = err?.response?.data || err?.data || {};
  const motivo =
    safeStr(d.motivo) ||
    safeStr(d.erros) ||
    safeStr(d.error) ||
    safeStr(err?.message) ||
    "";
  const campo = d.campo || (Array.isArray(d.erros) ? d.erros[0]?.campo : "") || "";
  const codigo = d.codigo || (Array.isArray(d.erros) ? d.erros[0]?.codigo : "") || "";
  const httpStatus = d.http_status || err?.response?.status || "";

  // Se só temos "HTTP 400" sem motivo real, não inventar — orientar a verificar os dados.
  const motivoReal = motivo && !/^HTTP \d+$/.test(motivo) ? motivo : "";
  const orientacao = buildOrientacao(motivoReal, campo);

  const description = motivoReal
    ? `Motivo: ${motivoReal}${codigo ? ` (código ${codigo})` : ""}${orientacao ? `\nO que fazer: ${orientacao}` : ""}${httpStatus ? `\nCódigo técnico: HTTP ${httpStatus}` : ""}`
    : `Não foi possível transmitir a NF-e.${httpStatus ? `\nCódigo técnico: HTTP ${httpStatus}` : ""}\nVerifique os dados da NF-e e do cadastro do cliente/emitente.`;

  return {
    title: "Não foi possível transmitir a NF-e",
    description,
    motivo: motivoReal,
    orientacao,
    codigo,
    httpStatus,
  };
}