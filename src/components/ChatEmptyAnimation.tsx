import { useEffect, useState } from "react";

export const ChatEmptyAnimation = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="w-80 h-80 flex items-center justify-center">
      <div className="relative">
        {/* Círculos animados de fundo */}
        <div className="absolute inset-0 animate-pulse">
          <div className="w-60 h-60 rounded-full bg-primary/10 animate-bounce"></div>
        </div>
        
        {/* Ícone principal de chat */}
        <div className="relative z-10 w-40 h-40 bg-primary rounded-2xl flex items-center justify-center transform rotate-12 animate-pulse">
          <div className="relative">
            {/* Balão de chat principal */}
            <div className="w-24 h-16 bg-white rounded-xl relative shadow-lg">
              {/* Rabo do balão */}
              <div className="absolute -bottom-1 left-6 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white"></div>
              
              {/* Pontos de digitação animados */}
              <div className="flex items-center justify-center h-full space-x-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
            
            {/* Segundo balão menor */}
            <div className="absolute -top-4 -right-6 w-16 h-10 bg-white rounded-lg shadow-md flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping"></div>
            </div>
          </div>
        </div>
        
        {/* Partículas flutuantes */}
        <div className="absolute top-10 left-10 w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
        <div className="absolute top-20 right-8 w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
        <div className="absolute bottom-16 left-16 w-1 h-1 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
        <div className="absolute bottom-10 right-12 w-2 h-2 bg-primary/30 rounded-full animate-bounce" style={{ animationDelay: '800ms' }}></div>
        
        {/* Ondas de conectividade */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-72 h-72 rounded-full border-2 border-primary/20 animate-ping"></div>
          <div className="absolute inset-4 rounded-full border border-primary/30 animate-ping" style={{ animationDelay: '1s' }}></div>
          <div className="absolute inset-8 rounded-full border border-primary/40 animate-ping" style={{ animationDelay: '2s' }}></div>
        </div>
      </div>
    </div>
  );
};