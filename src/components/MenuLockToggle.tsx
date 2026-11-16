import { Lock, Unlock } from "lucide-react";

interface MenuLockToggleProps {
  locked: boolean;
  onToggle: (locked: boolean) => void;
}

export function MenuLockToggle({ locked, onToggle }: MenuLockToggleProps) {
  return (
    <button
      onClick={() => onToggle(!locked)}
      role="switch"
      aria-checked={locked}
      className="w-full flex items-center gap-2.5 px-1 py-1.5 rounded-md transition-colors hover:bg-sidebar-accent/50"
    >
      <div
        className={`relative w-8 h-[18px] rounded-full transition-colors ${
          locked ? "bg-foreground" : "bg-border-strong"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-background shadow-sm flex items-center justify-center transition-transform duration-200 ${
            locked ? "translate-x-3.5" : "translate-x-0"
          }`}
        >
          {locked ? (
            <Lock className="h-2 w-2 text-foreground" />
          ) : (
            <Unlock className="h-2 w-2 text-muted-foreground" />
          )}
        </div>
      </div>
      <span className="text-xs text-sidebar-foreground/80">Manter menu aberto</span>
    </button>
  );
}
