import { useState, useEffect } from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Factory, Package, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddEditItemModal } from "@/components/AddEditItemModal";
import { ItemCard } from "@/components/ItemCard";
import { ProductionDashboard } from "@/components/ProductionDashboard";
import { FinancialSummary } from "@/components/FinancialSummary";
import { useOrganizationReady as useOrgReady } from "@/hooks/useOrganizationReady";

export interface Item {
  id: string;
  name: string;
  description: string | null;
  item_type: 'physical' | 'service' | 'digital';
  sale_price: number;
  cost_price: number;
  profit_margin: number;
  stock_quantity: number | null;
  duration: string | null;
  resource: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export default function Producao() {
  const { organizationId } = useOrgReady();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const { toast } = useToast();

  // Cache de items com React Query (5 min)
  const { isLoading } = useQuery({
    queryKey: ['production-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Item[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  // Sincronizar dados do cache com estado local
  useEffect(() => {
    const cached = queryClient.getQueryData<Item[]>(['production-items']);
    if (cached) setItems(cached);
  }, [isLoading, queryClient]);

  const refreshItems = () => {
    queryClient.invalidateQueries({ queryKey: ['production-items'] });
  };

  useEffect(() => {
    if (searchTerm) {
      setFilteredItems(
        items.filter((item) =>
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredItems(items);
    }
  }, [searchTerm, items]);

  const handleAddItem = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("items")
        .delete()
        .eq("id", itemId);

      if (error) throw error;

      toast({
        title: "Item excluído com sucesso",
      });

      await refreshItems();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir item",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    refreshItems();
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Produção</h1>
          <p className="text-muted-foreground">
            Gerencie a produção e produtos da empresa
          </p>
        </div>

        <Tabs defaultValue="producao" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent overflow-x-auto max-w-full">
            <TabsTrigger value="producao" className="flex items-center gap-1 sm:gap-2 rounded-none px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200 whitespace-nowrap">
              <Factory className="h-4 w-4" />
              <span className="hidden sm:inline">Produção</span>
            </TabsTrigger>
            <TabsTrigger value="produtos" className="flex items-center gap-1 sm:gap-2 rounded-none px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200 whitespace-nowrap">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Produtos da Empresa</span>
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="flex items-center gap-1 sm:gap-2 rounded-none px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200 whitespace-nowrap">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Financeiro</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="producao" className="mt-3 sm:mt-4 md:mt-6">
            <ProductionDashboard />
          </TabsContent>

          <TabsContent value="produtos" className="mt-3 sm:mt-4 md:mt-6">
            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-start sm:items-center">
                <div className="relative w-full sm:w-72 md:w-96">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Buscar itens..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button onClick={handleAddItem}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Novo Item</span>
                </Button>
              </div>

              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Carregando itens...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 bg-card rounded-lg border">
                  <p className="text-muted-foreground">
                    {searchTerm
                      ? "Nenhum item encontrado"
                      : "Nenhum item cadastrado ainda"}
                  </p>
                  {!searchTerm && (
                    <Button onClick={handleAddItem} className="mt-3 sm:mt-4">
                      <Plus className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Criar primeiro item</span>
                      <span className="sm:hidden">Criar item</span>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onEdit={handleEditItem}
                      onDelete={handleDeleteItem}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="financeiro" className="mt-3 sm:mt-4 md:mt-6">
            {organizationId ? (
              <FinancialSummary organizationId={organizationId} />
            ) : (
              <p className="text-muted-foreground text-center py-8">Carregando...</p>
            )}
          </TabsContent>
        </Tabs>

        <AddEditItemModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          item={editingItem}
        />
    </div>
  );
}
