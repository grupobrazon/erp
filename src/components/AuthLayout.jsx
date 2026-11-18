import React from "react";

// Moldura das telas de acesso (entrar, criar acesso, recuperar senha).
// À esquerda, o painel azul-profundo com a forma do logo da Brazon e ondas de água;
// à direita, o formulário. No celular o painel vira uma faixa no topo.
// `icon` continua aceito por compatibilidade com as páginas, mas não é mais exibido.
// eslint-disable-next-line no-unused-vars
export default function AuthLayout({ icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-background">
      <aside
        className="relative overflow-hidden bg-sidebar text-sidebar-foreground px-6 py-6 lg:px-12 lg:py-12 flex lg:flex-col justify-between items-center lg:items-start"
        aria-label="Brazon Purificadores"
      >
        <BrandWater />
        <div className="relative flex items-center gap-3">
          <img src="/brazon-logo.png" alt="Brazon" className="h-11 w-11 lg:h-14 lg:w-14" />
          <span className="font-heading text-lg lg:text-xl font-semibold text-white">ERP Brazon</span>
        </div>
        <div className="relative hidden lg:block max-w-sm">
          <p className="text-3xl font-semibold leading-tight text-white">
            Vendas, ordens de serviço, rotas e faturamento da Brazon em um só lugar.
          </p>
          <p className="mt-4 text-sidebar-foreground/75">
            Acesso exclusivo da equipe Brazon Purificadores.
          </p>
        </div>
      </aside>

      <main className="flex items-start lg:items-center justify-center px-5 py-10 lg:px-16">
        <div className="w-full max-w-[400px]">
          <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <p className="mt-8 text-sm text-muted-foreground">{footer}</p>}
        </div>
      </main>
    </div>
  );
}

// Forma orgânica do logo em grande, com ondas concêntricas como uma gota na água.
function BrandWater() {
  const blob =
    "M262 18c78-6 157 34 196 104 40 72 34 165-14 232-47 66-131 106-214 100C146 448 66 400 32 326 -2 252 10 160 64 98 113 42 185 24 262 18Z";
  return (
    <svg
      className="pointer-events-none absolute -right-28 -bottom-36 lg:-left-36 lg:right-auto lg:-bottom-64 w-[420px] lg:w-[820px] h-auto"
      viewBox="-110 -110 700 690"
      aria-hidden="true"
    >
      <g className="brazon-ripple brazon-ripple-3" style={{ transformOrigin: "245px 235px" }}>
        <path d={blob} fill="none" stroke="hsl(var(--brand-foam))" strokeOpacity="0.18" strokeWidth="1.5" transform="translate(245 235) scale(1.32) translate(-245 -235)" />
      </g>
      <g className="brazon-ripple brazon-ripple-2" style={{ transformOrigin: "245px 235px" }}>
        <path d={blob} fill="none" stroke="hsl(var(--brand-foam))" strokeOpacity="0.32" strokeWidth="1.5" transform="translate(245 235) scale(1.15) translate(-245 -235)" />
      </g>
      <g className="brazon-ripple" style={{ transformOrigin: "245px 235px" }}>
        <path d={blob} fill="hsl(var(--primary))" />
      </g>
    </svg>
  );
}
