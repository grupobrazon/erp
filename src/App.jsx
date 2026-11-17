import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import ExpedicaoPublic from "@/pages/ExpedicaoPublic";
import SalesRulesGuide from "@/pages/SalesRulesGuide";
import AgendarRefil from "@/pages/AgendarRefil";
import PromotionAdhesionPublic from "@/pages/PromotionAdhesionPublic";
import OAuthConsent from "@/pages/OAuthConsent";

import AppLayout from "@/components/layout/AppLayout";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import PublicPageFallback from "@/components/PublicPageFallback";
import { Toaster } from "@/components/ui/toaster";

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
        </ErrorBoundary>
      </BrowserRouter>
    );
  }

  // Authenticated regular user → tab workspace.
  // Each tab runs in its own top-level MemoryRouter (siblings, NOT nested in a BrowserRouter),
  // so state is preserved per tab without triggering the "Router inside Router" error.
  return <AppLayout />;
};

function App() {
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