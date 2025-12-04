import { useState, useEffect, useRef, memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getOptimizedAvatarUrl, getInitials, type AvatarSize } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

interface LazyAvatarProps {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Lazy-loaded Avatar component using IntersectionObserver
 * Only loads image when it enters the viewport
 */
export const LazyAvatar = memo(function LazyAvatar({
  src,
  name,
  size = "md",
  className,
  onClick,
}: LazyAvatarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const initials = getInitials(name);
  const optimizedUrl = getOptimizedAvatarUrl(src, initials, size);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Use IntersectionObserver for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(element);
          }
        });
      },
      {
        rootMargin: "100px", // Start loading 100px before entering viewport
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {!isVisible ? (
        <Skeleton className={cn("rounded-full", className)} />
      ) : (
        <Avatar
          className={cn(
            onClick && "cursor-pointer hover:opacity-80 transition-opacity",
            className
          )}
          onClick={onClick}
        >
          <AvatarImage
            src={optimizedUrl}
            alt={name}
            onLoad={() => setIsLoaded(true)}
            className={cn(
              "transition-opacity duration-200",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
          />
          <AvatarFallback
            className={cn(
              "bg-primary/10 text-primary transition-opacity duration-200",
              isLoaded ? "opacity-0" : "opacity-100"
            )}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
});
