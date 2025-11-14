import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MenuLockToggleProps {
  locked: boolean;
  onToggle: (locked: boolean) => void;
}

export function MenuLockToggle({ locked, onToggle }: MenuLockToggleProps) {
  return (
    <Button
      onClick={() => onToggle(!locked)}
      variant="ghost"
      className={`w-full justify-start gap-2 text-sm ${
        locked ? "bg-sidebar-accent" : ""
      }`}
      size="sm"
    >
      {locked ? (
        <Lock className="h-4 w-4" />
      ) : (
        <Unlock className="h-4 w-4" />
      )}
      <span>Bloquear Menu</span>
    </Button>
  );
}
