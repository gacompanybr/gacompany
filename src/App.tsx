import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAdmin } from "@/components/RequireAdmin";
import { RequirePortfolioAccess } from "@/components/RequirePortfolioAccess";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import PainelAuth from "./pages/PainelAuth.tsx";
import PainelAdminAuth from "./pages/PainelAdminAuth.tsx";
import PainelHome from "./pages/PainelHome.tsx";
import Admin from "./pages/Admin.tsx";
import Workspace from "./pages/Workspace.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />

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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
