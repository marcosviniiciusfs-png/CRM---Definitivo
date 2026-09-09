import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, Search } from "lucide-react";
import { AVAILABLE_ICONS } from "@/lib/iconRegistry";

interface IconPickerProps {
  value: string | null;
  onChange: (iconName: string | null) => void;
  label?: string;
}

export function IconPicker({ value, onChange, label = "Ícone" }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredIcons = AVAILABLE_ICONS.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedIcon = AVAILABLE_ICONS.find(item => item.name === value);
  const SelectedIconComponent = selectedIcon?.icon || Package;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <div className="flex items-center gap-2">
              <SelectedIconComponent className="h-4 w-4" />
              <span>{selectedIcon?.name || "Selecione um ícone"}</span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar ícone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="grid grid-cols-6 gap-2 p-2">
              {filteredIcons.map((item) => {
                const IconComponent = item.icon;
                const isSelected = value === item.name;
                return (
                  <Button
                    key={item.name}
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    className="h-12 w-12 p-0"
                    onClick={() => {
                      onChange(item.name);
                      setOpen(false);
                      setSearchTerm("");
                    }}
                    title={item.name}
                  >
                    <IconComponent className="h-5 w-5" />
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
          {value && (
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Remover ícone
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
