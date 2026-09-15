import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { MigrationMaintenance } from "@/components/MigrationMaintenance";

// Páginas carregadas sob demanda (lazy)
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const Index = lazy(() => import("./pages/Index"));
const OrganizationAppScope = lazy(() => import("@/components/OrganizationAppScope"));
const ProtectedRoute = lazy(() => import("@/components/ProtectedRoute").then((module) => ({
  default: module.ProtectedRoute,
})));
const SectionGate = lazy(() => import("@/components/SectionGate").then((module) => ({
  default: module.SectionGate,
})));
const SuperAdminRoute = lazy(() => import("@/components/SuperAdminRoute").then((module) => ({
  default: module.SuperAdminRoute,
})));
const DashboardLayout = lazy(() => import("@/components/DashboardLayout").then((module) => ({
  default: module.DashboardLayout,
})));
const AuthenticatedAppProviders = lazy(() => import("@/components/AuthenticatedAppProviders"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const FunnelBuilder = lazy(() => import("./pages/FunnelBuilder"));
const LeadDetails = lazy(() => import("./pages/LeadDetails"));
const LeadMetrics = lazy(() => import("./pages/LeadMetrics"));
const LeadDistribution = lazy(() => import("./pages/LeadDistribution"));
const Chat = lazy(() => import("./pages/Chat"));
const Ranking = lazy(() => import("./pages/Ranking"));
const Reunioes = lazy(() => import("./pages/Reunioes"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Settings = lazy(() => import("./pages/Settings"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Colaboradores = lazy(() => import("./pages/Colaboradores"));
const Equipes = lazy(() => import("./pages/Equipes"));
const Atividades = lazy(() => import("./pages/Atividades"));
const Producao = lazy(() => import("./pages/Producao"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUserDetails = lazy(() => import("./pages/AdminUserDetails"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const FacebookWebhookLogs = lazy(() => import("./pages/FacebookWebhookLogs"));
const WhatsAppWebhookLogs = lazy(() => import("./pages/WhatsAppWebhookLogs"));
const FormWebhookLogs = lazy(() => import("./pages/FormWebhookLogs"));
const MetaPixelLogs = lazy(() => import("./pages/MetaPixelLogs"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const DemoDashboard = lazy(() => import("./pages/DemoDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));

// QueryClient otimizado com cache
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      gcTime: 1000 * 60 * 30, // 30 minutos
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

// Componente de fallback para Suspense
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-live="polite">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-500/25 border-t-red-500" aria-hidden="true" />
    <span className="sr-only">Carregando...</span>
  </div>
);

// Wrapper para páginas lazy com Suspense
const LazyPage = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>
    {children}
  </Suspense>
);

const App = () => {
  if (import.meta.env.VITE_MAINTENANCE_MODE === "true") {
    return <MigrationMaintenance />;
  }

  return (
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AdminAuthProvider>
          <AuthProvider>
            <Routes>
                    <Route path="/" element={<LazyPage><Landing /></LazyPage>} />
                    <Route path="/auth" element={<LazyPage><Auth /></LazyPage>} />
                    <Route path="/admin-login" element={<LazyPage><AdminLogin /></LazyPage>} />
                    <Route element={<LazyPage><OrganizationAppScope /></LazyPage>}>
                      <Route element={<LazyPage><AuthenticatedAppProviders /></LazyPage>}>
                        <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><LazyPage><Index /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/demo-dashboard" element={<ProtectedRoute><DashboardLayout><LazyPage><DemoDashboard /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/pipeline" element={<ProtectedRoute><DashboardLayout><LazyPage><Pipeline /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/funnel-builder" element={<ProtectedRoute><DashboardLayout><LazyPage><FunnelBuilder /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/leads" element={<Navigate to="/pipeline" replace />} />
                        <Route path="/leads/:id" element={<ProtectedRoute><DashboardLayout><LazyPage><LeadDetails /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        {/* Features controladas por SectionGate - acessiveis quando liberadas via admin */}
                        <Route path="/lead-metrics" element={<ProtectedRoute><SectionGate><DashboardLayout><LazyPage><LeadMetrics /></LazyPage></DashboardLayout></SectionGate></ProtectedRoute>} />
                        <Route path="/lead-distribution" element={<ProtectedRoute><SectionGate><DashboardLayout><LazyPage><LeadDistribution /></LazyPage></DashboardLayout></SectionGate></ProtectedRoute>} />
                        <Route path="/chat" element={<ProtectedRoute><SectionGate><DashboardLayout><LazyPage><Chat /></LazyPage></DashboardLayout></SectionGate></ProtectedRoute>} />
                        <Route path="/ranking" element={<ProtectedRoute><DashboardLayout><LazyPage><Ranking /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/reunioes" element={<ProtectedRoute><DashboardLayout><LazyPage><Reunioes /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/administrativo/colaboradores" element={<ProtectedRoute><DashboardLayout><LazyPage><Colaboradores /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/administrativo/producao" element={<ProtectedRoute><DashboardLayout><LazyPage><Producao /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/administrativo/equipes" element={<ProtectedRoute><DashboardLayout><LazyPage><Equipes /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/administrativo/atividades" element={<ProtectedRoute><DashboardLayout><LazyPage><Atividades /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/tasks" element={<ProtectedRoute><DashboardLayout><LazyPage><Tasks /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/integrations" element={<ProtectedRoute><SectionGate><DashboardLayout><LazyPage><Integrations /></LazyPage></DashboardLayout></SectionGate></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><DashboardLayout><LazyPage><Settings /></LazyPage></DashboardLayout></ProtectedRoute>} />
                        <Route path="/facebook-webhook-logs" element={<ProtectedRoute><LazyPage><FacebookWebhookLogs /></LazyPage></ProtectedRoute>} />
                        <Route path="/whatsapp-webhook-logs" element={<ProtectedRoute><LazyPage><WhatsAppWebhookLogs /></LazyPage></ProtectedRoute>} />
                        <Route path="/form-webhook-logs" element={<ProtectedRoute><LazyPage><FormWebhookLogs /></LazyPage></ProtectedRoute>} />
                        <Route path="/meta-pixel-logs" element={<ProtectedRoute><DashboardLayout><LazyPage><MetaPixelLogs /></LazyPage></DashboardLayout></ProtectedRoute>} />
                      </Route>

                      {/* Pricing precisa do contexto de organização para verificar o vínculo administrativo. */}
                      <Route path="/pricing" element={<LazyPage><Pricing /></LazyPage>} />
                    </Route>
                    <Route path="/admin" element={<SuperAdminRoute><LazyPage><AdminDashboard /></LazyPage></SuperAdminRoute>} />
                    <Route path="/admin/user/:userId" element={<SuperAdminRoute><LazyPage><AdminUserDetails /></LazyPage></SuperAdminRoute>} />
                    <Route path="/privacy-policy" element={<LazyPage><PrivacyPolicy /></LazyPage>} />
                    <Route path="/terms-of-service" element={<LazyPage><TermsOfService /></LazyPage>} />
                    <Route path="/data-deletion" element={<LazyPage><DataDeletion /></LazyPage>} />

                    {/* Success fica fora do ProtectedRoute para evitar loops de redirecionamento. */}
                    <Route path="/success" element={<LazyPage><PaymentSuccess /></LazyPage>} />

                    <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
            </Routes>
          </AuthProvider>
        </AdminAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
