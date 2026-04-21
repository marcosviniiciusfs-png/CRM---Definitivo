import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, ShoppingBag, MessageSquare, Globe } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getInitials } from "@/lib/image-utils";
import { LoadingAnimation } from "./LoadingAnimation";
import { LeadDetailsDialog } from "./LeadDetailsDialog";

interface Sale {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  source: string;
  valor: number;
  data_conclusao: string;
  responsavel: string;
  responsavel_user_id?: string;
}

interface ProductionSalesTableProps {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function getSourceIcon(source: string) {
  const lower = source?.toLowerCase() || '';
  if (lower.includes('whatsapp')) return <MessageSquare className="h-4 w-4 text-green-500" />;
  if (lower.includes('facebook')) return <span className="text-blue-500 font-bold text-sm">f</span>;
  if (lower.includes('webhook') || lower.includes('url')) return <Globe className="h-4 w-4 text-sky-500" />;
  return <span className="text-muted-foreground text-xs">✏️</span>;
}

function getSourceLabel(source: string) {
  const lower = source?.toLowerCase() || '';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('facebook')) return 'Facebook';
  if (lower.includes('webhook') || lower.includes('url')) return 'Webhook';
  return 'Manual';
}

export function ProductionSalesTable({ organizationId, startDate, endDate }: ProductionSalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState<string>("");

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['production-sales', organizationId, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, source, valor, data_conclusao, responsavel, responsavel_user_id, funnel_stages(stage_type)")
        .eq("organization_id", organizationId)
        .gte("data_conclusao", startDate.toISOString())
        .lte("data_conclusao", endDate.toISOString())
        .order("data_conclusao", { ascending: false });

      if (error) throw error;
      const wonSales = data?.filter(s => (s.funnel_stages as any)?.stage_type === 'won') || [];
      return wonSales as Sale[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: profilesMap = {} } = useQuery({
    queryKey: ['sales-profiles', sales.map(s => s.responsavel_user_id).join(',')],
    queryFn: async () => {
      const userIds = [...new Set(sales.map(s => s.responsavel_user_id).filter(Boolean))] as string[];
      if (userIds.length === 0) return {};
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      const map: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      profiles?.forEach(p => { map[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
      return map;
    },
    enabled: sales.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const filteredSales = searchTerm
    ? sales.filter(s =>
        s.nome_lead?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.responsavel?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : sales;

  const totalValue = filteredSales.reduce((sum, s) => sum + (s.valor || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Vendas do Período</h3>
        <span className="text-xs text-muted-foreground">{filteredSales.length} vendas</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Buscar (nome, responsável)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-9 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingAnimation /></div>
      ) : filteredSales.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold">Cliente</TableHead>
                <TableHead className="text-xs font-semibold hidden sm:table-cell">Canal</TableHead>
                <TableHead className="text-xs font-semibold">Responsável</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Data</TableHead>
                <TableHead className="text-xs font-semibold text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.map((sale) => (
                <TableRow
                  key={sale.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => { setSelectedLeadId(sale.id); setSelectedLeadName(sale.nome_lead); }}
                >
                  <TableCell className="font-medium text-sm">{sale.nome_lead}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      {getSourceIcon(sale.source)}
                      <span className="text-sm">{getSourceLabel(sale.source)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 ring-1 ring-border">
                        <AvatarImage
                          src={profilesMap[sale.responsavel_user_id || '']?.avatar_url || undefined}
                          alt={sale.responsavel || ''}
                        />
                        <AvatarFallback className="text-[8px] bg-muted text-muted-foreground">
                          {getInitials(sale.responsavel)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{sale.responsavel || '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                    {sale.data_conclusao
                      ? format(new Date(sale.data_conclusao), "dd/MM/yyyy", { locale: ptBR })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                    {fmt(sale.valor)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 hover:bg-muted/30 border-t-2 border-border">
                <TableCell colSpan={4} className="font-semibold text-sm text-right">
                  Total
                </TableCell>
                <TableCell className="text-right font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  {fmt(totalValue)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-dashed border-border bg-muted/10">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Nenhuma venda registrada neste período</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Vendas fechadas aparecerão aqui automaticamente</p>
        </div>
      )}

      {selectedLeadId && (
        <LeadDetailsDialog
          open={!!selectedLeadId}
          onOpenChange={(open) => { if (!open) { setSelectedLeadId(null); setSelectedLeadName(''); } }}
          leadId={selectedLeadId}
          leadName={selectedLeadName}
        />
      )}
    </div>
  );
}
