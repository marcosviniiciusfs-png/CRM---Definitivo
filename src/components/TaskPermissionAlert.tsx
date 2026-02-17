import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskAlert } from "@/contexts/TaskAlertContext";
import { useState } from "react";

export function TaskPermissionAlert() {
  const { needsAudioPermission, requestAudioPermission } = useTaskAlert();
  const [dismissed, setDismissed] = useState(false);

  if (!needsAudioPermission || dismissed) {
    return null;
  }

  const handleActivate = async () => {
    await requestAudioPermission();
  };

  return (
    <div className="mb-3 py-2 px-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md flex items-center gap-2">
      <Bell className="h-4 w-4 text-amber-500 flex-shrink-0" />
      <span className="text-sm text-amber-700 dark:text-amber-300 flex-1">
        Ative o som para receber alertas de tarefas
      </span>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 px-2 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-800/40"
        onClick={handleActivate}
      >
        Ativar
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 p-1"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
