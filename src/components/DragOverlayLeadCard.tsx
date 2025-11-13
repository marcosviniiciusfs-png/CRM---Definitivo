import { Card } from "@/components/ui/card";

interface DragOverlayLeadCardProps {
  name: string;
}

export const DragOverlayLeadCard = ({ name }: DragOverlayLeadCardProps) => {
  return (
    <Card className="p-3 bg-background shadow-lg border-2 border-primary/20 w-[264px]">
      <h3 className="font-semibold text-sm text-foreground truncate">{name}</h3>
    </Card>
  );
};
