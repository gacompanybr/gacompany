import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAdmin } from "@/components/RequireAdmin";
import { RequirePortfolioAccess } from "@/components/RequirePortfolioAccess";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

// Code-splitting: tudo abaixo do landing entra sob demanda
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const PainelAuth = lazy(() => import("./pages/PainelAuth.tsx"));
const PainelAdminAuth = lazy(() => import("./pages/PainelAdminAuth.tsx"));
const PainelHome = lazy(() => import("./pages/PainelHome.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Workspace = lazy(() => import("./pages/Workspace.tsx"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="animate-spin text-primary" size={24} />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />

              {/* Painel do CLIENTE */}
              <Route path="/painel" element={<PainelAuth />} />
              <Route path="/painel/app" element={<PainelHome />} />

              {/* Painel ADMIN */}
              <Route path="/paineladmin" element={<PainelAdminAuth />} />
              <Route path="/paineladmin/app" element={<RequireAdmin><Admin /></RequireAdmin>} />

              {/* Workspace por cliente */}
              <Route
                path="/workspace/:portfolioId"
                element={<RequirePortfolioAccess><Workspace /></RequirePortfolioAccess>}
              />

              {/* Compatibilidade com rotas antigas */}
              <Route path="/auth" element={<Navigate to="/painel" replace />} />
              <Route path="/admin" element={<Navigate to="/paineladmin/app" replace />} />
              <Route path="/dashboard" element={<RequireAdmin><Dashboard /></RequireAdmin>} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
