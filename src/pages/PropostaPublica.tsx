import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileX2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ProposalDocument } from "@/components/consortium/ProposalDocument";
import { parseProposalPayload } from "@/lib/consortiumProposal";

/** Proposta aberta pelo cliente, sem login (/proposta/:token). */
export default function PropostaPublica() {
  const { token = "" } = useParams();
  const validToken = /^[0-9a-f]{64}$/.test(token);

  // A proposta é um documento: sempre no tema claro, na tela e na impressão.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);

  // Conta uma abertura por carregamento da página (o React pode montar duas vezes em DEV).
  const fetched = useRef<PromiseLike<unknown> | null>(null);
  const { data: payload, isLoading, isError } = useQuery({
    queryKey: ["public-proposal", token],
    queryFn: async () => {
      if (!fetched.current) {
        fetched.current = supabase.rpc("view_consortium_proposal", { p_token: token }).then(({ data, error }) => {
          if (error) throw error;
          return data;
        });
      }
      return parseProposalPayload(await fetched.current);
    },
    enabled: validToken,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (payload) {
      document.title = payload.organization.name ? `Proposta · ${payload.organization.name}` : "Proposta de consórcio";
    }
  }, [payload]);

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white">
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10 print:max-w-none print:p-0">
        {validToken && isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">Carregando a proposta...</p>
        ) : !payload || isError ? (
          <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6 text-center">
            <FileX2 className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <h1 className="mt-3 text-base font-semibold">Proposta indisponível</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              O link venceu ou está incompleto. Peça um link novo ao seu consultor.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-end print:hidden">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer />
                Salvar em PDF
              </Button>
            </div>
            <ProposalDocument payload={payload} />
          </>
        )}
      </main>
    </div>
  );
}
