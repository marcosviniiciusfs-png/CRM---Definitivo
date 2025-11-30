import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductionBlockCard } from "./ProductionBlockCard";
import { ProductionBlockDetailModal } from "./ProductionBlockDetailModal";
import { LoadingAnimation } from "./LoadingAnimation";

interface ProductionBlock {
  id: string;
  month: number;
  year: number;
  total_sales: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  previous_month_profit: number | null;
  profit_change_value: number | null;
  profit_change_percentage: number | null;
  is_closed: boolean;
}

export function ProductionDashboard() {
  const [blocks, setBlocks] = useState<ProductionBlock[]>([]);
  const [currentBlock, setCurrentBlock] = useState<ProductionBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadProductionBlocks();
  }, []);

  const loadProductionBlocks = async () => {
    try {
      setLoading(true);
      
      // Get user's organization
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!memberData) return;

      const organizationId = memberData.organization_id;
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Check if current month block exists, if not create it
      await ensureCurrentMonthBlock(organizationId, currentMonth, currentYear);

      // Load all blocks
      const { data, error } = await supabase
        .from("production_blocks")
        .select("*")
        .eq("organization_id", organizationId)
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (error) throw error;

      setBlocks(data || []);
      
      // Set current month block
      const current = data?.find(b => b.month === currentMonth && b.year === currentYear);
      setCurrentBlock(current || null);

    } catch (error: any) {
      toast({
        title: "Erro ao carregar blocos de produção",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const ensureCurrentMonthBlock = async (organizationId: string, month: number, year: number) => {
    try {
      // Check if block exists
      const { data: existing } = await supabase
        .from("production_blocks")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("month", month)
        .eq("year", year)
        .single();

      if (existing) {
        // Recalculate metrics
        await recalculateBlockMetrics(organizationId, month, year);
        return;
      }

      // Create new block
      const metrics = await calculateMetrics(organizationId, month, year);
      
      // Get previous month profit for comparison
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      
      const { data: previousBlock } = await supabase
        .from("production_blocks")
        .select("total_profit")
        .eq("organization_id", organizationId)
        .eq("month", prevMonth)
        .eq("year", prevYear)
        .single();

      const previousProfit = previousBlock?.total_profit || 0;
      const profitChange = metrics.profit - previousProfit;
      const profitChangePercentage = previousProfit > 0 ? (profitChange / previousProfit) * 100 : 0;

      await supabase.from("production_blocks").insert({
        organization_id: organizationId,
        month,
        year,
        total_sales: metrics.totalSales,
        total_revenue: metrics.totalRevenue,
        total_cost: metrics.totalCost,
        total_profit: metrics.profit,
        previous_month_profit: previousProfit,
        profit_change_value: profitChange,
        profit_change_percentage: profitChangePercentage,
      });

    } catch (error: any) {
      console.error("Error ensuring current month block:", error);
    }
  };

  const recalculateBlockMetrics = async (organizationId: string, month: number, year: number) => {
    try {
      const metrics = await calculateMetrics(organizationId, month, year);
      
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      
      const { data: previousBlock } = await supabase
        .from("production_blocks")
        .select("total_profit")
        .eq("organization_id", organizationId)
        .eq("month", prevMonth)
        .eq("year", prevYear)
        .single();

      const previousProfit = previousBlock?.total_profit || 0;
      const profitChange = metrics.profit - previousProfit;
      const profitChangePercentage = previousProfit > 0 ? (profitChange / previousProfit) * 100 : 0;

      await supabase
        .from("production_blocks")
        .update({
          total_sales: metrics.totalSales,
          total_revenue: metrics.totalRevenue,
          total_cost: metrics.totalCost,
          total_profit: metrics.profit,
          previous_month_profit: previousProfit,
          profit_change_value: profitChange,
          profit_change_percentage: profitChangePercentage,
        })
        .eq("organization_id", organizationId)
        .eq("month", month)
        .eq("year", year);

    } catch (error: any) {
      console.error("Error recalculating metrics:", error);
    }
  };

  const calculateMetrics = async (organizationId: string, month: number, year: number) => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get closed leads (won deals)
    const { data: leads } = await supabase
      .from("leads")
      .select("id, valor, funnel_stage_id, funnel_stages(stage_type)")
      .eq("organization_id", organizationId)
      .gte("data_conclusao", startDate.toISOString())
      .lte("data_conclusao", endDate.toISOString());

    // Filter for won leads
    const wonLeads = leads?.filter(l => l.funnel_stages?.stage_type === 'won') || [];

    const totalRevenue = wonLeads.reduce((sum, lead) => sum + (lead.valor || 0), 0);
    const leadIds = wonLeads.map(l => l.id);

    // Get lead items for cost calculation
    let totalCost = 0;
    if (leadIds.length > 0) {
      const { data: leadItems } = await supabase
        .from("lead_items")
        .select("quantity, unit_price, items(cost_price)")
        .in("lead_id", leadIds);

      totalCost = leadItems?.reduce((sum, item) => {
        const costPrice = item.items?.cost_price || 0;
        return sum + (item.quantity * costPrice);
      }, 0) || 0;
    }

    return {
      totalSales: wonLeads.length,
      totalRevenue,
      totalCost,
      profit: totalRevenue - totalCost,
    };
  };

  const [selectedBlock, setSelectedBlock] = useState<ProductionBlock | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleBlockClick = (block: ProductionBlock) => {
    setSelectedBlock(block);
    setIsDetailModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingAnimation />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* All Production Blocks */}
      {blocks.length > 0 ? (
        <div>
          <h2 className="text-2xl font-bold mb-6">Blocos de Produção</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {blocks.map((block) => {
              const isCurrent = block.month === currentBlock?.month && block.year === currentBlock?.year;
              return (
                <ProductionBlockCard 
                  key={block.id} 
                  block={block}
                  isCurrent={isCurrent}
                  onClick={() => handleBlockClick(block)}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-card rounded-lg border">
          <p className="text-muted-foreground">
            Nenhum bloco de produção encontrado
          </p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedBlock && (
        <ProductionBlockDetailModal
          block={selectedBlock}
          open={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
        />
      )}
    </div>
  );
}
