import { cn } from "@/lib/utils";

interface LoadingAnimationProps {
  className?: string;
  text?: string;
}

export const LoadingAnimation = ({ className, text = "LOADING" }: LoadingAnimationProps) => {
  const letters = text.split('');
  
  return (
    <div className={cn("flex min-h-[200px] items-center justify-center", className)}>
      <div className="loading-container">
        <div className="loading-text">
          {letters.map((letter, index) => (
            <span
              key={index}
              className="loading-letter"
              style={{
                animationDelay: `calc(70ms * ${index})`
              }}
            >
              {letter}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
