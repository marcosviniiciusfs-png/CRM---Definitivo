import { Card, CardContent } from "@/components/ui/card";
import { Grid3x3, ChevronRight } from "lucide-react";
import { useState } from "react";
import { IntegrationsModal } from "./IntegrationsModal";

export const IntegrationsHub = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card 
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => setOpen(true)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Grid3x3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Mais Integrações</h3>
                <p className="text-xs text-muted-foreground">
                  Google Calendar, Gmail, Zoom e mais
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <IntegrationsModal open={open} onOpenChange={setOpen} />
    </>
  );
};