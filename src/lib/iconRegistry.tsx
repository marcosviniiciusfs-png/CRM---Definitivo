import type { ComponentType } from "react";
import {
  Activity, Archive, Bike, Book, Box, Boxes, Briefcase, Building2,
  Calculator, Camera, Car, Cat, ChefHat, Coffee, Container, Crown, Dog,
  Download, Dumbbell, FileBox, Flag, Flower2, FolderOpen, Gamepad2, Gift,
  GraduationCap, Hammer, Headphones, Heart, Home, Laptop, Layers, Leaf,
  Megaphone, Music, Package, Package2, PackageCheck, Paintbrush, Palette,
  Pencil, Phone, Pill, PillBottle, Plane, Scale, Scissors, Settings, Shirt,
  ShoppingBag, ShoppingCart, Sparkles, Star, Stethoscope, Store, Syringe,
  Tag, Target, Trees, Trophy, Truck, Tv, Utensils, Warehouse, Watch,
  Wrench, Zap,
} from "lucide-react";
import { FaTooth } from "react-icons/fa";

export type AppIcon = ComponentType<{ className?: string }>;

const ToothIcon: AppIcon = ({ className }) => <FaTooth className={className} />;

export const AVAILABLE_ICONS: Array<{ name: string; icon: AppIcon }> = [
  { name: "Package", icon: Package }, { name: "Briefcase", icon: Briefcase },
  { name: "Download", icon: Download }, { name: "ShoppingCart", icon: ShoppingCart },
  { name: "Shirt", icon: Shirt }, { name: "Coffee", icon: Coffee },
  { name: "Book", icon: Book }, { name: "Laptop", icon: Laptop },
  { name: "Phone", icon: Phone }, { name: "Camera", icon: Camera },
  { name: "Gamepad2", icon: Gamepad2 }, { name: "Music", icon: Music },
  { name: "Tv", icon: Tv }, { name: "Watch", icon: Watch },
  { name: "Car", icon: Car }, { name: "Bike", icon: Bike },
  { name: "Home", icon: Home }, { name: "Wrench", icon: Wrench },
  { name: "Paintbrush", icon: Paintbrush }, { name: "Scissors", icon: Scissors },
  { name: "Hammer", icon: Hammer }, { name: "Settings", icon: Settings },
  { name: "Gift", icon: Gift }, { name: "Heart", icon: Heart },
  { name: "Star", icon: Star }, { name: "Crown", icon: Crown },
  { name: "Sparkles", icon: Sparkles }, { name: "Zap", icon: Zap },
  { name: "Trophy", icon: Trophy }, { name: "Target", icon: Target },
  { name: "Flag", icon: Flag }, { name: "Tag", icon: Tag },
  { name: "Box", icon: Box }, { name: "Archive", icon: Archive },
  { name: "Boxes", icon: Boxes }, { name: "Container", icon: Container },
  { name: "Layers", icon: Layers }, { name: "Package2", icon: Package2 },
  { name: "PackageCheck", icon: PackageCheck }, { name: "ShoppingBag", icon: ShoppingBag },
  { name: "Store", icon: Store }, { name: "Warehouse", icon: Warehouse },
  { name: "FileBox", icon: FileBox }, { name: "FolderOpen", icon: FolderOpen },
  { name: "Scale", icon: Scale }, { name: "PillBottle", icon: PillBottle },
  { name: "Stethoscope", icon: Stethoscope }, { name: "Syringe", icon: Syringe },
  { name: "Activity", icon: Activity }, { name: "Pill", icon: Pill },
  { name: "GraduationCap", icon: GraduationCap }, { name: "Building2", icon: Building2 },
  { name: "Plane", icon: Plane }, { name: "Truck", icon: Truck },
  { name: "Utensils", icon: Utensils }, { name: "ChefHat", icon: ChefHat },
  { name: "Dumbbell", icon: Dumbbell }, { name: "Palette", icon: Palette },
  { name: "Pencil", icon: Pencil }, { name: "Calculator", icon: Calculator },
  { name: "Headphones", icon: Headphones }, { name: "Megaphone", icon: Megaphone },
  { name: "Leaf", icon: Leaf }, { name: "Flower2", icon: Flower2 },
  { name: "Trees", icon: Trees }, { name: "Dog", icon: Dog },
  { name: "Cat", icon: Cat }, { name: "Tooth", icon: ToothIcon },
];

const ICON_BY_NAME = new Map(AVAILABLE_ICONS.map(({ name, icon }) => [name, icon]));

export function getAppIcon(name: string | null | undefined): AppIcon | null {
  return name ? ICON_BY_NAME.get(name) ?? null : null;
}
