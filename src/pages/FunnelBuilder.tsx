import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ArrowLeft, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FunnelConfigDialog } from "@/components/FunnelConfigDialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Funnel {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  stages?: any[];
}

const FunnelBuilder = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<Funnel | null>(null);
  const [deletingFunnel, setDeletingFunnel] = useState<Funnel | null>(null);

  useEffect(() => {
    loadFunnels();
  }, []);

  const loadFunnels = async () => {
    try {
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (!orgData) return;

      const { data, error } = await supabase
        .from("sales_funnels")
        .select(`
          *,
          stages:funnel_stages(count)
        `)
        .eq("organization_id", orgData.organization_id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFunnels(data || []);
    } catch (error) {
      console.error("Erro ao carregar funis:", error);
      toast.error("Erro ao carregar funis");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingFunnel) return;

    try {
      // Verificar se há leads usando este funil
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("funnel_id", deletingFunnel.id);

      if (count && count > 0) {
        toast.error(`Não é possível excluir. Existem ${count} leads usando este funil.`);
        setDeletingFunnel(null);
        return;
      }

      // Deletar stages primeiro
      await supabase
        .from("funnel_stages")
        .delete()
        .eq("funnel_id", deletingFunnel.id);

      // Deletar funil
      const { error } = await supabase
        .from("sales_funnels")
        .delete()
        .eq("id", deletingFunnel.id);

      if (error) throw error;

      toast.success("Funil excluído com sucesso!");
      loadFunnels();
    } catch (error) {
      console.error("Erro ao excluir funil:", error);
      toast.error("Erro ao excluir funil");
    } finally {
      setDeletingFunnel(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghostIcon"
            size="icon"
            onClick={() => navigate("/pipeline")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Construtor de Funis
            </h1>
            <p className="text-muted-foreground mt-1">
              Crie e personalize seus funis de vendas com etapas e automações
            </p>
          </div>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Funil
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {funnels.map((funnel) => (
            <Card key={funnel.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{funnel.name}</h3>
                      {funnel.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          Padrão
                        </Badge>
                      )}
                    </div>
                    {funnel.description && (
                      <p className="text-sm text-muted-foreground">
                        {funnel.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {funnel.stages?.[0]?.count || 0} etapas
                  </span>
                  <span>•</span>
                  <Badge 
                    variant={funnel.is_active ? "default" : "secondary"}
                    style={funnel.is_active ? { backgroundColor: '#66ee78', color: '#000' } : undefined}
                  >
                    {funnel.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEditingFunnel(funnel);
                      setShowDialog(true);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {funnel.is_default ? "Configurar" : "Editar"}
                  </Button>
                  {!funnel.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeletingFunnel(funnel)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <FunnelConfigDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setEditingFunnel(null);
        }}
        funnel={editingFunnel}
        onSuccess={() => {
          loadFunnels();
          setShowDialog(false);
          setEditingFunnel(null);
        }}
      />

      <AlertDialog open={!!deletingFunnel} onOpenChange={() => setDeletingFunnel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funil?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O funil "{deletingFunnel?.name}" será
              permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FunnelBuilder;
