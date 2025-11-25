import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number | string;
  duration?: number;
}

export const AnimatedNumber = ({ value, duration = 800 }: AnimatedNumberProps) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Se for string, extrair o número e o sufixo
    if (typeof value === 'string') {
      const numMatch = value.match(/^(\d+(?:\.\d+)?)/);
      const suffix = value.replace(/^(\d+(?:\.\d+)?)/, '');
      
      if (numMatch) {
        const startMatch = typeof displayValue === 'string' 
          ? displayValue.match(/^(\d+(?:\.\d+)?)/)
          : null;
        const startNum = startMatch ? parseFloat(startMatch[1]) : 0;
        const endNum = parseFloat(numMatch[1]);
        
        if (startNum === endNum) {
          setDisplayValue(value);
          return;
        }

        setIsAnimating(true);
        let startTime: number | null = null;
        
        const animate = (currentTime: number) => {
          if (!startTime) startTime = currentTime;
          const progress = Math.min((currentTime - startTime) / duration, 1);
          
          const easeOutQuart = 1 - Math.pow(1 - progress, 4);
          const currentValue = startNum + (endNum - startNum) * easeOutQuart;
          
          // Manter uma casa decimal se for percentual ou inteiro se for minutos
          const formattedValue = suffix.includes('%') || suffix.includes('.')
            ? currentValue.toFixed(1)
            : Math.floor(currentValue);
          
          setDisplayValue(`${formattedValue}${suffix}`);
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            setDisplayValue(value);
            setIsAnimating(false);
          }
        };
        
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
      return;
    }

    // Se for número, animar
    const startValue = typeof displayValue === 'number' ? displayValue : 0;
    const endValue = value;
    
    if (startValue === endValue) return;

    setIsAnimating(true);
    let startTime: number | null = null;
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = Math.floor(startValue + (endValue - startValue) * easeOutQuart);
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span className={isAnimating ? 'inline-block' : ''}>
      {displayValue}
    </span>
  );
};
