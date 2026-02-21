import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { TaskAlertProvider } from "@/contexts/TaskAlertContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { SuperAdminRoute } from "@/components/SuperAdminRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AssetPreloader } from "@/components/AssetPreloader";
import { LoadingAnimation } from "@/components/LoadingAnimation";

// Páginas críticas - carregadas imediatamente
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";

// Páginas carregadas sob demanda (lazy)
const Index = lazy(() => import("./pages/Index"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const FunnelBuilder = lazy(() => import("./pages/FunnelBuilder"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadDetails = lazy(() => import("./pages/LeadDetails"));
const LeadMetrics = lazy(() => import("./pages/LeadMetrics"));
const LeadDistribution = lazy(() => import("./pages/LeadDistribution"));
const Chat = lazy(() => import("./pages/Chat"));
const Ranking = lazy(() => import("./pages/Ranking"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Settings = lazy(() => import("./pages/Settings"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Colaboradores = lazy(() => import("./pages/Colaboradores"));
const Equipes = lazy(() => import("./pages/Equipes"));
const Atividades = lazy(() => import("./pages/Atividades"));
const Producao = lazy(() => import("./pages/Producao"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUserDetails = lazy(() => import("./pages/AdminUserDetails"));
const FacebookWebhookLogs = lazy(() => import("./pages/FacebookWebhookLogs"));
const WhatsAppWebhookLogs = lazy(() => import("./pages/WhatsAppWebhookLogs"));
const FormWebhookLogs = lazy(() => import("./pages/FormWebhookLogs"));
const MetaPixelLogs = lazy(() => import("./pages/MetaPixelLogs"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Componente para rotas bloqueadas ("Em breve") - redireciona para dashboard
const BlockedFeatureRedirect = () => <Navigate to="/dashboard" replace />;

// QueryClient otimizado com cache
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      gcTime: 1000 * 60 * 30, // 30 minutos
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Componente de fallback para Suspense
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <LoadingAnimation text="Carregando..." />
  </div>
);

// Wrapper para páginas lazy com Suspense
const LazyPage = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>
    {children}
  </Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AssetPreloader />
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <TaskAlertProvider>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Index /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/pipeline" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Pipeline /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/funnel-builder" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><FunnelBuilder /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/leads" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Leads /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/leads/:id" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><LeadDetails /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                {/* Features bloqueadas - "Em breve" */}
                <Route path="/lead-metrics" element={<ProtectedRoute><SubscriptionGate><BlockedFeatureRedirect /></SubscriptionGate></ProtectedRoute>} />
                <Route path="/lead-distribution" element={<ProtectedRoute><SubscriptionGate><BlockedFeatureRedirect /></SubscriptionGate></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><SubscriptionGate><BlockedFeatureRedirect /></SubscriptionGate></ProtectedRoute>} />
                <Route path="/ranking" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Ranking /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/administrativo/colaboradores" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Colaboradores /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/administrativo/producao" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Producao /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/administrativo/equipes" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Equipes /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/administrativo/atividades" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Atividades /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Tasks /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/integrations" element={<ProtectedRoute><SubscriptionGate><BlockedFeatureRedirect /></SubscriptionGate></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><Settings /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/facebook-webhook-logs" element={<ProtectedRoute><SubscriptionGate><LazyPage><FacebookWebhookLogs /></LazyPage></SubscriptionGate></ProtectedRoute>} />
                <Route path="/whatsapp-webhook-logs" element={<ProtectedRoute><SubscriptionGate><LazyPage><WhatsAppWebhookLogs /></LazyPage></SubscriptionGate></ProtectedRoute>} />
                <Route path="/form-webhook-logs" element={<ProtectedRoute><SubscriptionGate><LazyPage><FormWebhookLogs /></LazyPage></SubscriptionGate></ProtectedRoute>} />
                <Route path="/meta-pixel-logs" element={<ProtectedRoute><SubscriptionGate><DashboardLayout><LazyPage><MetaPixelLogs /></LazyPage></DashboardLayout></SubscriptionGate></ProtectedRoute>} />
                <Route path="/admin" element={<SuperAdminRoute><LazyPage><AdminDashboard /></LazyPage></SuperAdminRoute>} />
                <Route path="/admin/user/:userId" element={<SuperAdminRoute><LazyPage><AdminUserDetails /></LazyPage></SuperAdminRoute>} />
                <Route path="/privacy-policy" element={<LazyPage><PrivacyPolicy /></LazyPage>} />
                <Route path="/terms-of-service" element={<LazyPage><TermsOfService /></LazyPage>} />
                <Route path="/data-deletion" element={<LazyPage><DataDeletion /></LazyPage>} />
                {/* Pricing e Success ficam FORA do SubscriptionGate */}
                <Route path="/pricing" element={<ProtectedRoute><LazyPage><Pricing /></LazyPage></ProtectedRoute>} />
                <Route path="/success" element={<ProtectedRoute><LazyPage><PaymentSuccess /></LazyPage></ProtectedRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
              </Routes>
            </TaskAlertProvider>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
