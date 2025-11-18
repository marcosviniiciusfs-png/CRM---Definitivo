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
        description: "Buscando fotos de perfil de todos os leads...",
      });

      const { data, error } = await supabase.functions.invoke(
        "sync-all-profile-pictures"
      );

      if (error) throw error;

      if (data?.success) {
        const { results } = data;
        toast({
          title: "Sincronização concluída",
          description: `${results.synced} fotos sincronizadas, ${results.skipped} leads sem foto pública, ${results.failed} erros`,
        });
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (error: any) {
      console.error("Erro ao sincronizar fotos:", error);
      toast({
        title: "Erro na sincronização",
        description: error.message || "Não foi possível sincronizar as fotos",
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
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sincronizar Fotos
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sincronizar fotos de perfil?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação irá buscar as fotos de perfil do WhatsApp de todos os
            leads existentes. Isso pode levar alguns minutos dependendo da
            quantidade de leads.
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
