import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Factory, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddEditItemModal } from "@/components/AddEditItemModal";
import { ItemCard } from "@/components/ItemCard";
import { ProductionDashboard } from "@/components/ProductionDashboard";

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
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadItems();
  }, []);

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

  const loadItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setItems((data || []) as Item[]);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar itens",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

      await loadItems();
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
    loadItems();
  };

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Produção</h1>
          <p className="text-muted-foreground">
            Gerencie a produção e produtos da empresa
          </p>
        </div>

        <Tabs defaultValue="producao" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="producao" className="gap-2">
              <Factory className="h-4 w-4" />
              Produção
            </TabsTrigger>
            <TabsTrigger value="produtos" className="gap-2">
              <Package className="h-4 w-4" />
              Produtos da Empresa
            </TabsTrigger>
          </TabsList>

          <TabsContent value="producao" className="mt-6">
            <ProductionDashboard />
          </TabsContent>

          <TabsContent value="produtos" className="mt-6">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Buscar itens..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Item
                </Button>
              </div>

              {loading ? (
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
                    <Button onClick={handleAddItem} className="mt-4">
                      <Plus className="h-4 w-4 mr-2" />
                      Criar primeiro item
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
        </Tabs>

        <AddEditItemModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          item={editingItem}
        />
    </div>
  );
}
