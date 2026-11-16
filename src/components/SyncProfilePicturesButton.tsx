import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const SyncProfilePicturesButton = () => {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    setOpen(false);

    try {
      toast({
        title: "Sincronização iniciada",
        description: "Buscando as fotos de perfil dos leads…",
      });

      const { data, error } = await supabase.functions.invoke(
        "sync-all-profile-pictures"
      );

      if (error) throw error;

      if (data?.success) {
        const { results } = data;
        toast({
          title: "Sincronização concluída",
          description: `${results.synced === 1 ? "1 foto sincronizada" : `${results.synced} fotos sincronizadas`}, ${results.skipped === 1 ? "1 lead sem foto pública" : `${results.skipped} leads sem foto pública`}, ${results.failed === 1 ? "1 falha" : `${results.failed} falhas`}.`,
        });
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (error: any) {
      console.error("Erro ao sincronizar fotos:", error);
      toast({
        title: "Não foi possível sincronizar as fotos",
        description: "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={syncing}>
          {syncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sincronizando…
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sincronizar fotos
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sincronizar fotos de perfil?</AlertDialogTitle>
          <AlertDialogDescription>
            Busca as fotos de perfil do WhatsApp de todos os leads. Pode levar alguns minutos, dependendo da quantidade de leads.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleSync}>
            Sincronizar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
