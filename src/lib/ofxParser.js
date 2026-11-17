// Parser para arquivos OFX (Open Financial Exchange) — suporta OFX 1.x (SGML) e OFX 2.x (XML).
// Extrai as transações de <STMTTRN> e normaliza para o formato do BankTransaction.

export function parseOfx(text) {
  const ofxStart = text.indexOf("<OFX>");
  const raw = ofxStart >= 0 ? text.slice(ofxStart) : text;

  // Divide em blocos <STMTTRN> (funciona para SGML e XML)
  const parts = raw.split(/<STMTTRN>/i);
  parts.shift(); // descarta o conteúdo antes do primeiro bloco

  const transactions = [];
  for (const part of parts) {
    const endIdx = part.search(/<\/STMTTRN>/i);
    const block = endIdx >= 0 ? part.slice(0, endIdx) : part;

    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
      return m ? m[1].trim() : "";
    };

    const trnType = get("TRNTYPE");
    const rawDt = get("DTPOSTED");
    const rawAmt = get("TRNAMT");
    const fitid = get("FITID");
    const name = get("NAME");
    const memo = get("MEMO");

    // Data: YYYYMMDD ou YYYYMMDDHHMMSS (pode ter sufixo [0:GMT])
    const cleanDt = (rawDt || "").split("[")[0].trim();
    let date = cleanDt;
    if (cleanDt.length >= 8) {
      date = `${cleanDt.slice(0, 4)}-${cleanDt.slice(4, 6)}-${cleanDt.slice(6, 8)}`;
    }

    // Valor: OFX padrão usa ponto decimal; tolera vírgula
    let trnAmt = parseFloat(rawAmt);
    if (isNaN(trnAmt)) trnAmt = parseFloat((rawAmt || "").replace(",", "."));
    if (isNaN(trnAmt)) trnAmt = 0;

    const direction = trnAmt >= 0 ? "Entrada" : "Saída";
    const description = [name, memo].filter(Boolean).join(" — ").trim() || trnType || "Transação";

    transactions.push({
      date,
      amount: Math.abs(trnAmt),
      direction,
      description,
      fitid,
      trnType,
    });
  }
  return transactions;
}