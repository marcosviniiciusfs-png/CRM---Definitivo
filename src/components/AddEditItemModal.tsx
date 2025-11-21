import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Item } from "@/pages/Producao";

interface AddEditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item | null;
}

export function AddEditItemModal({ isOpen, onClose, item }: AddEditItemModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState<'physical' | 'service' | 'digital'>('physical');
  const [salePrice, setSalePrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [duration, setDuration] = useState("");
  const [resource, setResource] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || "");
      setItemType(item.item_type);
      setSalePrice(item.sale_price.toString());
      setCostPrice(item.cost_price.toString());
      setStockQuantity(item.stock_quantity?.toString() || "");
      setDuration(item.duration || "");
      setResource(item.resource || "");
    } else {
      resetForm();
    }
  }, [item, isOpen]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setItemType('physical');
    setSalePrice("");
    setCostPrice("");
    setStockQuantity("");
    setDuration("");
    setResource("");
  };

  const calculateProfitMargin = () => {
    const sale = parseFloat(salePrice) || 0;
    const cost = parseFloat(costPrice) || 0;
    if (cost > 0) {
      return ((sale - cost) / cost * 100).toFixed(2);
    }
    return "0.00";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, preencha o nome do item",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const itemData: any = {
        name: name.trim(),
        description: description.trim() || null,
        item_type: itemType,
        sale_price: parseFloat(salePrice) || 0,
        cost_price: parseFloat(costPrice) || 0,
      };

      if (itemType === 'physical') {
        itemData.stock_quantity = parseInt(stockQuantity) || 0;
        itemData.duration = null;
        itemData.resource = null;
      } else if (itemType === 'service') {
        itemData.duration = duration.trim() || null;
        itemData.resource = resource.trim() || null;
        itemData.stock_quantity = null;
      } else {
        itemData.stock_quantity = null;
        itemData.duration = null;
        itemData.resource = null;
      }

      if (item) {
        const { error } = await supabase
          .from("items")
          .update(itemData)
          .eq("id", item.id);

        if (error) throw error;

        toast({
          title: "Item atualizado com sucesso",
        });
      } else {
        const { error } = await supabase
          .from("items")
          .insert([itemData]);

        if (error) throw error;

        toast({
          title: "Item criado com sucesso",
        });
      }

      onClose();
    } catch (error: any) {
      toast({
        title: item ? "Erro ao atualizar item" : "Erro ao criar item",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getItemTypeLabel = (type: string) => {
    const labels = {
      physical: 'Físico',
      service: 'Serviço',
      digital: 'Digital'
    };
    return labels[type as keyof typeof labels];
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar Item" : "Novo Item"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do item"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="itemType">Tipo de Item *</Label>
              <Select
                value={itemType}
                onValueChange={(value: any) => setItemType(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical">Físico</SelectItem>
                  <SelectItem value="service">Serviço</SelectItem>
                  <SelectItem value="digital">Digital</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do item"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="costPrice">Custo (R$)</Label>
              <Input
                id="costPrice"
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="salePrice">Preço de Venda (R$) *</Label>
              <Input
                id="salePrice"
                type="number"
                step="0.01"
                min="0"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Margem de Lucro</Label>
              <div className="h-10 px-3 py-2 rounded-md border border-input bg-muted flex items-center">
                <span className="text-sm font-medium">
                  {calculateProfitMargin()}%
                </span>
              </div>
            </div>
          </div>

          {itemType === 'physical' && (
            <div className="space-y-2">
              <Label htmlFor="stockQuantity">Quantidade em Estoque</Label>
              <Input
                id="stockQuantity"
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
          )}

          {itemType === 'service' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duração</Label>
                <Input
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Ex: 2 horas, 1 dia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource">Recurso Necessário</Label>
                <Input
                  id="resource"
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  placeholder="Ex: Profissional, Equipamento"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : item ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
