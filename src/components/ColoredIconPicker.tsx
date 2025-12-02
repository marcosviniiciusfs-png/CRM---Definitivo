import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Target,
  Briefcase,
  Book,
  Headphones,
  ShoppingCart,
  Trophy,
  Star,
  Zap,
  Crown,
  Home,
  Package,
  Store,
  Phone,
  Laptop,
  Car,
  Plane,
  GraduationCap,
  Stethoscope,
  Utensils,
  Dumbbell,
  LucideIcon,
} from "lucide-react";

const AVAILABLE_ICONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: "Target", icon: Target, label: "Alvo" },
  { name: "Briefcase", icon: Briefcase, label: "Maleta" },
  { name: "Book", icon: Book, label: "Caderno" },
  { name: "Headphones", icon: Headphones, label: "Headset" },
  { name: "ShoppingCart", icon: ShoppingCart, label: "Carrinho" },
  { name: "Trophy", icon: Trophy, label: "Troféu" },
  { name: "Star", icon: Star, label: "Estrela" },
  { name: "Zap", icon: Zap, label: "Raio" },
  { name: "Crown", icon: Crown, label: "Coroa" },
  { name: "Home", icon: Home, label: "Casa" },
  { name: "Package", icon: Package, label: "Pacote" },
  { name: "Store", icon: Store, label: "Loja" },
  { name: "Phone", icon: Phone, label: "Telefone" },
  { name: "Laptop", icon: Laptop, label: "Computador" },
  { name: "Car", icon: Car, label: "Carro" },
  { name: "Plane", icon: Plane, label: "Avião" },
  { name: "GraduationCap", icon: GraduationCap, label: "Formatura" },
  { name: "Stethoscope", icon: Stethoscope, label: "Saúde" },
  { name: "Utensils", icon: Utensils, label: "Restaurante" },
  { name: "Dumbbell", icon: Dumbbell, label: "Academia" },
];

const PRESET_COLORS = [
  { name: "Azul", value: "#3B82F6" },
  { name: "Verde", value: "#22C55E" },
  { name: "Vermelho", value: "#EF4444" },
  { name: "Amarelo", value: "#F59E0B" },
  { name: "Roxo", value: "#8B5CF6" },
  { name: "Rosa", value: "#EC4899" },
  { name: "Ciano", value: "#06B6D4" },
  { name: "Laranja", value: "#F97316" },
  { name: "Verde Escuro", value: "#4CA698" },
  { name: "Cinza", value: "#6B7280" },
];

interface ColoredIconPickerProps {
  iconValue?: string;
  colorValue?: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

export const ColoredIconPicker = ({
  iconValue,
  colorValue = "#4CA698",
  onIconChange,
  onColorChange,
}: ColoredIconPickerProps) => {
  const [searchIcon, setSearchIcon] = useState("");

  const selectedIconData = AVAILABLE_ICONS.find((i) => i.name === iconValue);
  const SelectedIcon = selectedIconData?.icon;

  const filteredIcons = AVAILABLE_ICONS.filter(
    (icon) =>
      icon.label.toLowerCase().includes(searchIcon.toLowerCase()) ||
      icon.name.toLowerCase().includes(searchIcon.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Ícone do Funil</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                {SelectedIcon ? (
                  <div className="flex items-center gap-2">
                    <SelectedIcon className="h-4 w-4" style={{ color: colorValue }} />
                    <span>{selectedIconData.label}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Selecionar ícone</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-2">
                <Input
                  placeholder="Buscar ícone..."
                  value={searchIcon}
                  onChange={(e) => setSearchIcon(e.target.value)}
                />
                <ScrollArea className="h-64">
                  <div className="grid grid-cols-3 gap-2">
                    {filteredIcons.map((iconData) => {
                      const IconComponent = iconData.icon;
                      return (
                        <Button
                          key={iconData.name}
                          variant={iconValue === iconData.name ? "default" : "outline"}
                          size="sm"
                          className="h-20 flex flex-col gap-1"
                          onClick={() => onIconChange(iconData.name)}
                        >
                          <IconComponent className="h-5 w-5" />
                          <span className="text-xs">{iconData.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
                {iconValue && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => onIconChange("")}
                  >
                    Remover ícone
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Cor do Ícone</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded border"
                    style={{ backgroundColor: colorValue }}
                  />
                  <span>{PRESET_COLORS.find((c) => c.value === colorValue)?.name || "Personalizada"}</span>
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      className="h-8 w-8 rounded border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color.value }}
                      onClick={() => onColorChange(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Cor Personalizada</Label>
                  <Input
                    type="color"
                    value={colorValue}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="h-10 cursor-pointer"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {SelectedIcon && (
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
          <span className="text-sm text-muted-foreground">Preview:</span>
          <SelectedIcon className="h-6 w-6" style={{ color: colorValue }} />
          <span className="text-sm font-medium">{selectedIconData.label}</span>
        </div>
      )}
    </div>
  );
};
