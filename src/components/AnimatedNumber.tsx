import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number | string;
  duration?: number;
}

export const AnimatedNumber = ({ value, duration = 800 }: AnimatedNumberProps) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Se for string (ex: "15%", "30min"), não animar
    if (typeof value === 'string') {
      setDisplayValue(value);
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
      
      // Easing function for smooth animation
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
    <span className={isAnimating ? 'inline-block animate-pulse' : ''}>
      {displayValue}
    </span>
  );
};
