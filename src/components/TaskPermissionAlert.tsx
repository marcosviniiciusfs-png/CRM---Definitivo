import { Volume2, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskAlert } from "@/contexts/TaskAlertContext";
import { useState } from "react";

export function TaskPermissionAlert() {
  const { needsAudioPermission, requestAudioPermission, hasPendingTasks, pendingTaskCount } = useTaskAlert();
  const [dismissed, setDismissed] = useState(false);

  // Só mostrar se precisa de permissão e não foi dispensado
  if (!needsAudioPermission || dismissed || !hasPendingTasks) {
    return null;
  }

  const handleActivate = async () => {
    await requestAudioPermission();
  };

  return (
    <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
      
      <div className="flex items-start gap-3">
        <Volume2 className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-medium text-amber-800 dark:text-amber-200">
            Ative as notificações sonoras
          </h4>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            {pendingTaskCount > 0 ? (
              <>
                Você tem <strong>{pendingTaskCount}</strong> {pendingTaskCount === 1 ? 'tarefa atribuída' : 'tarefas atribuídas'} a você.
              </>
            ) : (
              <>Para receber alertas quando novas tarefas forem atribuídas a você.</>
            )}
            {' '}Clique no botão abaixo para ativar o som de notificação.
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-3 border-amber-500 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40"
            onClick={handleActivate}
          >
            <Bell className="h-4 w-4 mr-2" />
            Ativar som de notificação
          </Button>
        </div>
      </div>
    </div>
  );
}
