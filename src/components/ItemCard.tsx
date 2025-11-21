import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Package, Briefcase, Download, LucideIcon } from "lucide-react";
import { Item } from "@/pages/Producao";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import * as Icons from "lucide-react";
import { FaTooth } from "react-icons/fa";

// Wrapper para ícone do react-icons
const ToothIcon: React.FC<{ className?: string }> = ({ className }) => (
  <FaTooth className={className} />
);

// Mapa de ícones customizados (não-lucide)
const customIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Tooth: ToothIcon,
};

interface ItemCardProps {
  item: Item;
  onEdit: (item: Item) => void;
  onDelete: (itemId: string) => void;
}

export function ItemCard({ item, onEdit, onDelete }: ItemCardProps) {
  const getItemTypeConfig = (type: string) => {
    const configs = {
      physical: {
        label: 'Físico',
        icon: Package,
        color: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      },
      service: {
        label: 'Serviço',
        icon: Briefcase,
        color: 'bg-green-500/10 text-green-500 border-green-500/20'
      },
      digital: {
        label: 'Digital',
        icon: Download,
        color: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
      }
    };
    return configs[type as keyof typeof configs] || configs.physical;
  };

  const typeConfig = getItemTypeConfig(item.item_type);
  
  // Use custom icon if available, otherwise use type default icon
  const getDisplayIcon = (): React.ComponentType<{ className?: string }> => {
    if (item.icon) {
      // Check custom icons first
      if (item.icon in customIcons) {
        return customIcons[item.icon];
      }
      // Then check lucide icons
      if (item.icon in Icons) {
        return Icons[item.icon as keyof typeof Icons] as LucideIcon;
      }
    }
    return typeConfig.icon;
  };
  
  const DisplayIcon = getDisplayIcon();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getProfitColor = (margin: number) => {
    if (margin >= 50) return 'text-green-500';
    if (margin >= 20) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2 rounded-lg ${typeConfig.color}`}>
              <DisplayIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{item.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {item.description || 'Sem descrição'}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={typeConfig.color}>
            {typeConfig.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Custo</p>
            <p className="text-sm font-medium">{formatCurrency(item.cost_price)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Preço de Venda</p>
            <p className="text-sm font-medium">{formatCurrency(item.sale_price)}</p>
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1">Margem de Lucro</p>
          <p className={`text-2xl font-bold ${getProfitColor(item.profit_margin)}`}>
            {item.profit_margin.toFixed(2)}%
          </p>
        </div>

        {item.item_type === 'physical' && item.stock_quantity !== null && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Estoque</p>
            <p className="text-sm font-medium">
              {item.stock_quantity} unidades
            </p>
          </div>
        )}

        {item.item_type === 'service' && (
          <div className="pt-2 border-t space-y-2">
            {item.duration && (
              <div>
                <p className="text-xs text-muted-foreground">Duração</p>
                <p className="text-sm font-medium">{item.duration}</p>
              </div>
            )}
            {item.resource && (
              <div>
                <p className="text-xs text-muted-foreground">Recurso</p>
                <p className="text-sm font-medium">{item.resource}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onEdit(item)}
          >
            <Edit className="h-4 w-4 mr-1" />
            Editar
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir o item <strong>{item.name}</strong>?
                  Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(item.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
