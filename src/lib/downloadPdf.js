/**
 * Dispara o download de um PDF recebido em base64 (retorno das funções de faturamento).
 */
export function downloadPdfFromBase64(pdfBase64, filename) {
  const byteChars = atob(pdfBase64);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteNumbers], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}