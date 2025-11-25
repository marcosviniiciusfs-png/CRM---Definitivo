import { cn } from "@/lib/utils";

interface LoadingAnimationProps {
  className?: string;
  text?: string;
}

export const LoadingAnimation = ({ className, text = "LOADING" }: LoadingAnimationProps) => {
  const letters = text.split('');
  
  return (
    <div className={cn("flex min-h-[200px] items-center justify-center", className)}>
      <div className="loader-container">
        <div className="loader">
          {letters.map((letter, index) => (
            <span
              key={index}
              className={cn("letter", letter.toLowerCase())}
              style={{
                animationDelay: `calc(70ms * ${index})`
              }}
            >
              {letter}
            </span>
          ))}
        </div>
      </div>
      
      <style>{`
        .loader-container {
          background: linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.1));
          border-radius: 1rem;
          padding: 2rem 3rem;
        }
        
        .loader {
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          font-size: 2.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .loader span {
          padding: 0;
          margin: 0;
          letter-spacing: -0.2rem;
          transform: translateY(4rem);
          animation: hideAndSeek 1s alternate infinite cubic-bezier(0.86, 0, 0.07, 1);
        }
        
        .letter {
          width: fit-content;
          height: 3rem;
        }
        
        .i {
          margin-inline: 5px;
        }
        
        @keyframes hideAndSeek {
          0% {
            transform: translateY(4rem);
            opacity: 0;
          }
          100% {
            transform: translateY(0rem);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};
