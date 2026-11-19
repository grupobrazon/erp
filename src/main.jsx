import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Depois de uma nova publicação, os arquivos antigos de tela somem.
// Se alguém estava com o ERP aberto, recarrega uma vez para pegar a versão nova.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('erp-reload-at') || 0);
    if (Date.now() - last < 30000) return;
    sessionStorage.setItem('erp-reload-at', String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
