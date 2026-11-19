import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";

import Login from "@/pages/Login";
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ExpedicaoPublic = lazy(() => import("@/pages/ExpedicaoPublic"));
const SalesRulesGuide = lazy(() => import("@/pages/SalesRulesGuide"));
const AgendarRefil = lazy(() => import("@/pages/AgendarRefil"));
const PromotionAdhesionPublic = lazy(() => import("@/pages/PromotionAdhesionPublic"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));

const AppLayout = lazy(() => import("@/components/layout/AppLayout"));
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import PublicPageFallback from "@/components/PublicPageFallback";
import { Toaster } from "@/components/ui/toaster";
import { isOAuthPopupReturn } from "@/api/base44Client";

// Tela mostrada dentro do popup do Google enquanto ele fecha sozinho.
const OAuthPopupScreen = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    <p className="text-sm text-muted-foreground">Concluindo o login… esta janela fecha sozinha.</p>
    <button type="button" onClick={() => window.close()} className="text-sm text-primary hover:underline">
      Fechar janela
    </button>
  </div>
);

const FullScreenSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
    isAuthenticated,
    user,
  } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <FullScreenSpinner />;
  }

  if (authError) {
    if (authError.type === "user_not_registered") {
      return <UserNotRegisteredError />;
    }
    if (authError.type === "auth_required") {
      navigateToLogin();
      return null;
    }
  }

  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isPublicExpedicao = pathname.startsWith("/expedicao/");
  const isPublicGuide = pathname === "/guia-regras";
  const isPublicAgendamento = pathname.startsWith("/agendar-refil");
  const isPublicPrograma = pathname.startsWith("/programa/");
  const isOauthConsent = pathname === "/oauth/consent";

  // Not authenticated, or visiting a public page → browser router with auth/public routes
  if (!isAuthenticated || isPublicExpedicao || isPublicGuide || isPublicAgendamento || isPublicPrograma || isOauthConsent) {
    return (
      <BrowserRouter>
        <ErrorBoundary fallback={<PublicPageFallback />}>
          <Suspense fallback={<FullScreenSpinner />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/expedicao/:id" element={<ExpedicaoPublic />} />
            <Route path="/guia-regras" element={<SalesRulesGuide />} />
            <Route path="/agendar-refil/:token" element={<AgendarRefil />} />
            <Route path="/programa/:token" element={<PromotionAdhesionPublic />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    );
  }

  // Authenticated regular user → tab workspace.
  // Each tab runs in its own top-level MemoryRouter (siblings, NOT nested in a BrowserRouter),
  // so state is preserved per tab without triggering the "Router inside Router" error.
  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <AppLayout />
    </Suspense>
  );
};

function App() {
  if (isOAuthPopupReturn) return <OAuthPopupScreen />;
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <AuthenticatedApp />
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;