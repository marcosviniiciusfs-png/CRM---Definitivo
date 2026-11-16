import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface PickedLead {
  id: string;
  nome_lead: string;
  telefone_lead: string | null;
}

interface LeadPickerProps {
  value: PickedLead | null;
  onChange: (lead: PickedLead | null) => void;
  id?: string;
}

/** Busca de lead por nome ou telefone (a RLS de leads decide o que aparece). */
export function LeadPicker({ value, onChange, id }: LeadPickerProps) {
  const { organizationId } = useOrganization();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.replace(/[,()%*\\]/g, " ").trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: leads = [], isFetching } = useQuery({
    queryKey: ["lead-picker", organizationId, term],
    queryFn: async () => {
      if (!organizationId) return [];
      let query = supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(8);
      if (term) query = query.or(`nome_lead.ilike.%${term}%,telefone_lead.ilike.%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!organizationId,
    staleTime: 30_000,
  });

  return (
    <div className="flex gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} variant="outline" role="combobox" aria-expanded={open} className="h-9 min-w-0 flex-1 justify-between font-normal">
            <span className={value ? "truncate" : "truncate text-muted-foreground"}>
              {value ? value.nome_lead : "Buscar lead por nome ou telefone"}
            </span>
            <ChevronsUpDown className="opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder="Nome ou telefone" />
            <CommandList>
              <CommandEmpty>{isFetching ? "Buscando..." : "Nenhum lead nesta busca."}</CommandEmpty>
              <CommandGroup>
                {leads.map((lead) => (
                  <CommandItem
                    key={lead.id}
                    value={lead.id}
                    onSelect={() => {
                      onChange(lead);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{lead.nome_lead}</p>
                      {lead.telefone_lead && <p className="truncate text-xs tabular-nums text-muted-foreground">{lead.telefone_lead}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Tirar o lead da simulação">
          <X />
        </Button>
      )}
    </div>
  );
}
