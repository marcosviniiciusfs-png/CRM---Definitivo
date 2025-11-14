import { Lock, Unlock } from "lucide-react";

interface MenuLockToggleProps {
  locked: boolean;
  onToggle: (locked: boolean) => void;
}

export function MenuLockToggle({ locked, onToggle }: MenuLockToggleProps) {
  return (
    <button
      onClick={() => onToggle(!locked)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-sidebar-accent/50"
    >
      <div
        className={`relative w-11 h-6 rounded-full transition-colors ${
          locked ? "bg-primary" : "bg-muted"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow-md flex items-center justify-center transition-transform duration-300 ${
            locked ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {locked ? (
            <Lock className="h-3 w-3 text-primary" />
          ) : (
            <Unlock className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>
      <span className="text-sm text-sidebar-foreground">Bloquear Menu</span>
    </button>
  );
}
