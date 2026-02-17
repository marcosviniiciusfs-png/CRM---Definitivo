import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DollarSign, Settings, CheckCircle, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Commission {
  id: string;
  user_id: string;
  lead_id: string | null;
  sale_value: number;
  commission_value: number;
  commission_rate: number;
  commission_type: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
  lead_name?: string;
}

interface CommissionConfig {
  id: string;
  commission_type: string;
  commission_value: number;
  is_active: boolean;
}

interface CommissionsTabProps {
  organizationId: string;
  userRole: string | null;
}

export function CommissionsTab({ organizationId, userRole }: CommissionsTabProps) {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [config, setConfig] = useState<CommissionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editType, setEditType] = useState("percentage");
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (organizationId) loadData();
  }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [commissionsResult, configResult] = await Promise.all([
        supabase
          .from("commissions")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("commission_configs")
          .select("*")
          .eq("organization_id", organizationId)
          .maybeSingle(),
      ]);

      // Enrich commissions with user/lead names
      const rawCommissions = commissionsResult.data || [];
      const userIds = [...new Set(rawCommissions.map((c) => c.user_id))];
      const leadIds = [...new Set(rawCommissions.filter((c) => c.lead_id).map((c) => c.lead_id!))];

      const [profilesResult, leadsResult] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds)
          : Promise.resolve({ data: [] }),
        leadIds.length > 0
          ? supabase.from("leads").select("id, nome_lead").in("id", leadIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profilesMap = new Map((profilesResult.data || []).map((p) => [p.user_id, p]));
      const leadsMap = new Map((leadsResult.data || []).map((l) => [l.id, l]));

      const enriched: Commission[] = rawCommissions.map((c) => ({
        ...c,
        user_name: profilesMap.get(c.user_id)?.full_name || "Colaborador",
        user_avatar: profilesMap.get(c.user_id)?.avatar_url || undefined,
        lead_name: c.lead_id ? leadsMap.get(c.lead_id)?.nome_lead || "Lead" : undefined,
      }));

      setCommissions(enriched);
      if (configResult.data) {
        setConfig(configResult.data);
        setEditType(configResult.data.commission_type);
        setEditValue(configResult.data.commission_value.toString());
      }
    } catch (error) {
      console.error("Error loading commissions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (commissionId: string) => {
    const { error } = await supabase
      .from("commissions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", commissionId);
    if (error) {
      toast.error("Erro ao marcar como paga");
    } else {
      toast.success("Comissão marcada como paga");
      loadData();
    }
  };

  const handleSaveConfig = async () => {
    const value = parseFloat(editValue);
    if (isNaN(value) || value <= 0) {
      toast.error("Insira um valor válido");
      return;
    }

    if (config) {
      const { error } = await supabase
        .from("commission_configs")
        .update({ commission_type: editType, commission_value: value })
        .eq("id", config.id);
      if (error) {
        toast.error("Erro ao atualizar configuração");
        return;
      }
    } else {
      const { error } = await supabase.from("commission_configs").insert({
        organization_id: organizationId,
        commission_type: editType,
        commission_value: value,
      });
      if (error) {
        toast.error("Erro ao criar configuração");
        return;
      }
    }

    toast.success("Configuração salva");
    setConfigModalOpen(false);
    loadData();
  };

  const pendingTotal = commissions
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + c.commission_value, 0);
  const paidTotal = commissions
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + c.commission_value, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Comissões Pendentes</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {pendingTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Comissões Pagas</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {paidTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Regra Atual</p>
                <p className="text-2xl font-bold text-foreground">
                  {config
                    ? config.commission_type === "percentage"
                      ? `${config.commission_value}%`
                      : `R$ ${config.commission_value.toFixed(2)}`
                    : "Não configurada"}
                </p>
              </div>
              <Settings className="h-8 w-8 text-blue-500" />
            </div>
            {(userRole === "owner" || userRole === "admin") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setConfigModalOpen(true)}
              >
                <Settings className="h-4 w-4 mr-1" />
                Configurar
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Commissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Histórico de Comissões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Valor Venda</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  {(userRole === "owner" || userRole === "admin") && <TableHead>Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={userRole === "owner" || userRole === "admin" ? 6 : 5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Nenhuma comissão registrada
                    </TableCell>
                  </TableRow>
                ) : (
                  commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={c.user_avatar} />
                            <AvatarFallback className="text-xs">
                              {(c.user_name || "C")[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{c.user_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{c.lead_name || "—"}</TableCell>
                      <TableCell className="text-sm">
                        R$ {c.sale_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-green-600">
                        R$ {c.commission_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            c.status === "paid"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }
                        >
                          {c.status === "paid" ? "Paga" : "Pendente"}
                        </Badge>
                      </TableCell>
                      {(userRole === "owner" || userRole === "admin") && (
                        <TableCell>
                          {c.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => handleMarkPaid(c.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Pagar
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Config Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurar Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual (%)</SelectItem>
                  <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder={editType === "percentage" ? "Ex: 10" : "Ex: 50.00"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
