import { useState, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxKeywordLength?: number;
}

const MAX_LEN = 100;

/**
 * Chip-style input para array de strings.
 * - Enter cria chip (trim, dedup case-insensitive)
 * - Backspace em input vazio remove último chip
 * - X em chip remove individual
 * - Display preserva case original; comparação interna é case-insensitive
 */
export function KeywordsInput({
  value,
  onChange,
  placeholder = "Digite uma palavra e pressione Enter",
  disabled = false,
  maxKeywordLength = MAX_LEN,
}: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addKeyword = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.length > maxKeywordLength) return;
    // Dedup case-insensitive
    const lowerExisting = value.map(v => v.toLowerCase());
    if (lowerExisting.includes(trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div
      className={cn(
        "min-h-[42px] flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-border rounded-md bg-background",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "focus-within:ring-1 focus-within:ring-ring focus-within:border-primary cursor-text"
      )}
      onClick={() => !disabled && inputRef.current?.focus()}
    >
      {value.map((kw, idx) => (
        <span
          key={`${kw}-${idx}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200"
        >
          {kw}
          {!disabled && (
            <button
              type="button"
              className="hover:bg-orange-200 dark:hover:bg-orange-800 rounded-sm p-0.5"
              onClick={(e) => { e.stopPropagation(); removeAt(idx); }}
              aria-label={`Remover ${kw}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        disabled={disabled}
        maxLength={maxKeywordLength}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}
