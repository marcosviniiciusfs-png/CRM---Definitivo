import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Package, Briefcase, Download, ShoppingCart, Shirt, Coffee, Book, 
  Laptop, Phone, Camera, Gamepad2, Music, Tv, Watch, Car, Home,
  Wrench, Paintbrush, Scissors, Hammer, Settings, Gift, Heart,
  Star, Crown, Sparkles, Zap, Trophy, Target, Flag, Tag,
  Box, Archive, Boxes, Container, Layers, Package2, PackageCheck,
  ShoppingBag, Store, Warehouse, FileBox, FolderOpen, LucideIcon,
  Bike, Scale, PillBottle, Stethoscope, Syringe, Activity, Pill,
  GraduationCap, Building2, Plane, Truck, Utensils, ChefHat,
  Dumbbell, Scissors as ScissorsIcon, Palette, Pencil, Calculator,
  Headphones, Megaphone, Leaf, Flower2, Trees, Dog, Cat
} from "lucide-react";
import { Search } from "lucide-react";
import { FaTooth } from "react-icons/fa";

// Wrapper para ícones do react-icons compatível com lucide
const ToothIcon: React.FC<{ size?: number; color?: string; className?: string }> = ({ size = 24, color, className }) => (
  <FaTooth size={size} color={color} className={className} />
);

const AVAILABLE_ICONS: { name: string; icon: LucideIcon }[] = [
  { name: "Package", icon: Package },
  { name: "Briefcase", icon: Briefcase },
  { name: "Download", icon: Download },
  { name: "ShoppingCart", icon: ShoppingCart },
  { name: "Shirt", icon: Shirt },
  { name: "Coffee", icon: Coffee },
  { name: "Book", icon: Book },
  { name: "Laptop", icon: Laptop },
  { name: "Phone", icon: Phone },
  { name: "Camera", icon: Camera },
  { name: "Gamepad2", icon: Gamepad2 },
  { name: "Music", icon: Music },
  { name: "Tv", icon: Tv },
  { name: "Watch", icon: Watch },
  { name: "Car", icon: Car },
  { name: "Bike", icon: Bike },
  { name: "Home", icon: Home },
  { name: "Wrench", icon: Wrench },
  { name: "Paintbrush", icon: Paintbrush },
  { name: "Scissors", icon: ScissorsIcon },
  { name: "Hammer", icon: Hammer },
  { name: "Settings", icon: Settings },
  { name: "Gift", icon: Gift },
  { name: "Heart", icon: Heart },
  { name: "Star", icon: Star },
  { name: "Crown", icon: Crown },
  { name: "Sparkles", icon: Sparkles },
  { name: "Zap", icon: Zap },
  { name: "Trophy", icon: Trophy },
  { name: "Target", icon: Target },
  { name: "Flag", icon: Flag },
  { name: "Tag", icon: Tag },
  { name: "Box", icon: Box },
  { name: "Archive", icon: Archive },
  { name: "Boxes", icon: Boxes },
  { name: "Container", icon: Container },
  { name: "Layers", icon: Layers },
  { name: "Package2", icon: Package2 },
  { name: "PackageCheck", icon: PackageCheck },
  { name: "ShoppingBag", icon: ShoppingBag },
  { name: "Store", icon: Store },
  { name: "Warehouse", icon: Warehouse },
  { name: "FileBox", icon: FileBox },
  { name: "FolderOpen", icon: FolderOpen },
  { name: "Scale", icon: Scale },
  { name: "PillBottle", icon: PillBottle },
  { name: "Stethoscope", icon: Stethoscope },
  { name: "Syringe", icon: Syringe },
  { name: "Activity", icon: Activity },
  { name: "Pill", icon: Pill },
  { name: "GraduationCap", icon: GraduationCap },
  { name: "Building2", icon: Building2 },
  { name: "Plane", icon: Plane },
  { name: "Truck", icon: Truck },
  { name: "Utensils", icon: Utensils },
  { name: "ChefHat", icon: ChefHat },
  { name: "Dumbbell", icon: Dumbbell },
  { name: "Palette", icon: Palette },
  { name: "Pencil", icon: Pencil },
  { name: "Calculator", icon: Calculator },
  { name: "Headphones", icon: Headphones },
  { name: "Megaphone", icon: Megaphone },
  { name: "Leaf", icon: Leaf },
  { name: "Flower2", icon: Flower2 },
  { name: "Trees", icon: Trees },
  { name: "Dog", icon: Dog },
  { name: "Cat", icon: Cat },
  { name: "Tooth", icon: ToothIcon as any },
];

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
