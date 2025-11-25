import { cn } from "@/lib/utils";
import loadingGif from "@/assets/loading-hourglass.gif";

interface LoadingAnimationProps {
  className?: string;
  text?: string;
}

export const LoadingAnimation = ({ className, text = "Carregando" }: LoadingAnimationProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 min-h-[200px]", className)}>
      <img 
        src={loadingGif} 
        alt="Carregando..." 
        className="w-32 h-32 object-contain"
      />
      <p className="text-lg font-semibold text-foreground animate-pulse">{text}</p>
    </div>
  );
};
