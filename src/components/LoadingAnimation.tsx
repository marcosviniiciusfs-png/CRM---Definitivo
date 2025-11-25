import { cn } from "@/lib/utils";
import { Player } from '@lottiefiles/react-lottie-player';

interface LoadingAnimationProps {
  className?: string;
  text?: string;
}

export const LoadingAnimation = ({ className, text = "Carregando" }: LoadingAnimationProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 min-h-[200px]", className)}>
      <Player
        autoplay
        loop
        src="https://lottie.host/dbafd91b-4c8a-42aa-9d76-a1051150c2db/tbNwiszRn4.lottie"
        style={{ width: '200px', height: '200px' }}
      />
      <p className="text-lg font-semibold text-foreground animate-pulse">{text}</p>
    </div>
  );
};
