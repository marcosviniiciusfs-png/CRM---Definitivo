import { useState, useRef, KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxKeywordLength?: number;
}

const MAX_LEN = 500;

/**
 * Editor de lista de frases/palavras-chave para tracking.
 *
 * Layout:
 * - Input + botão "Adicionar" lado-a-lado no topo (Enter também adiciona)
 * - Lista vertical de frases salvas, cada uma como uma linha com X pra remover
 * - Suporta frases longas (até 500 chars) — não é chip de tag curta
 *
 * Comportamento:
 * - Trim + dedup case-insensitive
 * - Display preserva case original
 * - Comparação posterior (no helper do webhook) é case+accent insensitive
 */
export function KeywordsInput({
  value,
  onChange,
  placeholder = "Digite uma frase ou palavra-chave",
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
    // Mantém foco no input pra adicionar a próxima frase rápido
    inputRef.current?.focus();
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword(draft);
    }
  };

  const canAdd = !disabled && draft.trim().length > 0;

  return (
    <div className="space-y-2">
      {/* Input + botão Adicionar */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxKeywordLength}
          className={cn(
            "flex-1 min-w-0 px-3 py-1.5 border border-border rounded-md bg-background text-sm",
            "placeholder:text-muted-foreground outline-none",
            !disabled && "focus:ring-1 focus:ring-ring focus:border-primary",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => addKeyword(draft)}
          disabled={!canAdd}
          className="flex-shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </div>

      {/* Lista de frases salvas */}
      {value.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {value.map((kw, idx) => (
            <div
              key={`${kw}-${idx}`}
              className={cn(
                "flex items-start gap-2 px-3 py-2 rounded-md text-sm",
                "bg-orange-50 dark:bg-orange-900/20 text-orange-900 dark:text-orange-100",
                "border border-orange-200 dark:border-orange-800/50"
              )}
            >
              <span className="flex-1 break-words">{kw}</span>
              {!disabled && (
                <button
                  type="button"
                  className={cn(
                    "flex-shrink-0 p-1 rounded-sm",
                    "hover:bg-orange-200 dark:hover:bg-orange-800/50",
                    "text-orange-700 dark:text-orange-300"
                  )}
                  onClick={() => removeAt(idx)}
                  aria-label={`Remover "${kw}"`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
