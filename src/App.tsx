import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Pipeline from "./pages/Pipeline";
import Leads from "./pages/Leads";
import LeadDetails from "./pages/LeadDetails";
import Chat from "./pages/Chat";
import Tasks from "./pages/Tasks";
import Settings from "./pages/Settings";
import Colaboradores from "./pages/Colaboradores";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/pipeline" element={<ProtectedRoute><DashboardLayout><Pipeline /></DashboardLayout></ProtectedRoute>} />
            <Route path="/leads" element={<ProtectedRoute><DashboardLayout><Leads /></DashboardLayout></ProtectedRoute>} />
            <Route path="/leads/:id" element={<ProtectedRoute><DashboardLayout><LeadDetails /></DashboardLayout></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><DashboardLayout><Chat /></DashboardLayout></ProtectedRoute>} />
            <Route path="/administrativo/colaboradores" element={<ProtectedRoute><Colaboradores /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><DashboardLayout><Tasks /></DashboardLayout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><DashboardLayout><Settings /></DashboardLayout></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
