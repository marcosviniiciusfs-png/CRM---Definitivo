import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface StageAutomationConfigProps {
  stageId: string;
  onBack: () => void;
}

export const StageAutomationConfig = ({ stageId, onBack }: StageAutomationConfigProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghostIcon" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h3 className="font-semibold">Regras de Automação da Etapa</h3>
          <p className="text-sm text-muted-foreground">
            Configure gatilhos de entrada/saída e automações
          </p>
        </div>
      </div>

      <div className="text-center py-12 text-muted-foreground">
        Em desenvolvimento...
      </div>
    </div>
  );
};
