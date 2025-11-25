import { cn } from "@/lib/utils";

interface LoadingAnimationProps {
  className?: string;
  text?: string;
}

export const LoadingAnimation = ({ className, text = "Carregando" }: LoadingAnimationProps) => {
  return (
    <div className={cn("flex min-h-[200px] items-center justify-center", className)}>
      <div className="hourglass-container">
        <div className="hourglass">
          <div className="hourglass-sand"></div>
          <div className="hourglass-sand" style={{ animationDelay: '0.3s' }}></div>
          <div className="hourglass-sand" style={{ animationDelay: '0.6s' }}></div>
        </div>
        <p className="loading-text-label">{text}</p>
      </div>
    </div>
  );
};
