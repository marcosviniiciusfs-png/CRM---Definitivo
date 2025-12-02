import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const AVAILABLE_ICONS: { emoji: string; name: string; label: string }[] = [
  { emoji: "🎯", name: "target", label: "Alvo" },
  { emoji: "💼", name: "briefcase", label: "Maleta" },
  { emoji: "📓", name: "book", label: "Caderno" },
  { emoji: "🎧", name: "headphones", label: "Headset" },
  { emoji: "🛒", name: "shopping-cart", label: "Carrinho" },
  { emoji: "🏆", name: "trophy", label: "Troféu" },
  { emoji: "⭐", name: "star", label: "Estrela" },
  { emoji: "⚡", name: "zap", label: "Raio" },
  { emoji: "👑", name: "crown", label: "Coroa" },
  { emoji: "🏠", name: "home", label: "Casa" },
  { emoji: "📦", name: "package", label: "Pacote" },
  { emoji: "🏪", name: "store", label: "Loja" },
  { emoji: "📱", name: "phone", label: "Telefone" },
  { emoji: "💻", name: "laptop", label: "Notebook" },
  { emoji: "🚗", name: "car", label: "Carro" },
  { emoji: "✈️", name: "plane", label: "Avião" },
  { emoji: "🎓", name: "graduation-cap", label: "Estudo" },
  { emoji: "🩺", name: "stethoscope", label: "Saúde" },
  { emoji: "🍽️", name: "utensils", label: "Gastronomia" },
  { emoji: "💪", name: "dumbbell", label: "Fitness" },
];

interface ColoredIconPickerProps {
  iconValue?: string;
  onIconChange: (icon: string) => void;
}

export const ColoredIconPicker = ({
  iconValue,
  onIconChange,
}: ColoredIconPickerProps) => {
  const [searchIcon, setSearchIcon] = useState("");

  const selectedIconData = AVAILABLE_ICONS.find((i) => i.name === iconValue);

  const filteredIcons = AVAILABLE_ICONS.filter(
    (icon) =>
      icon.label.toLowerCase().includes(searchIcon.toLowerCase()) ||
      icon.name.toLowerCase().includes(searchIcon.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <Label>Ícone do Funil</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start">
            {selectedIconData ? (
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedIconData.emoji}</span>
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
            <ScrollArea className="h-64 pr-4">
              <div className="grid grid-cols-3 gap-2 pb-2">
                {filteredIcons.map((iconData) => (
                  <Button
                    key={iconData.name}
                    variant={iconValue === iconData.name ? "default" : "outline"}
                    size="sm"
                    className="h-20 flex flex-col gap-1 text-xs"
                    onClick={() => onIconChange(iconData.name)}
                  >
                    <span className="text-2xl">{iconData.emoji}</span>
                    <span className="text-[10px] leading-tight text-center px-1 break-words">{iconData.label}</span>
                  </Button>
                ))}
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

      {selectedIconData && (
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
          <span className="text-sm text-muted-foreground">Preview:</span>
          <span className="text-2xl">{selectedIconData.emoji}</span>
          <span className="text-sm font-medium">{selectedIconData.label}</span>
        </div>
      )}
    </div>
  );
};
