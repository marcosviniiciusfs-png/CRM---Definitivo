import { useState, useEffect, useRef, memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getOptimizedAvatarUrl, getInitials, type AvatarSize } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { useSignedMediaUrl } from "@/hooks/useSignedMediaUrl";

interface LazyAvatarProps {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

type VisibilityCallback = () => void;

const visibilityCallbacks = new Map<Element, VisibilityCallback>();
let sharedAvatarObserver: IntersectionObserver | null = null;

const observeAvatar = (element: Element, onVisible: VisibilityCallback) => {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return () => undefined;
  }

  if (!sharedAvatarObserver) {
    sharedAvatarObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          visibilityCallbacks.get(entry.target)?.();
          visibilityCallbacks.delete(entry.target);
          sharedAvatarObserver?.unobserve(entry.target);
        }
      },
      { rootMargin: "100px", threshold: 0 },
    );
  }

  visibilityCallbacks.set(element, onVisible);
  sharedAvatarObserver.observe(element);
  return () => {
    visibilityCallbacks.delete(element);
    sharedAvatarObserver?.unobserve(element);
  };
};

const LazyAvatarWithImage = ({
  src,
  name,
  size,
  className,
  onClick,
}: LazyAvatarProps & { src: string }) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initials = getInitials(name);
  const { signedUrl } = useSignedMediaUrl(src);
  const optimizedUrl = getOptimizedAvatarUrl(signedUrl ?? src, initials, size);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    return observeAvatar(element, () => setIsVisible(true));
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {!isVisible ? (
        <Skeleton className={cn("rounded-full", className)} />
      ) : (
        <Avatar
          className={cn(onClick && "cursor-pointer hover:opacity-80 transition-opacity", className)}
          onClick={onClick}
        >
          <AvatarImage src={optimizedUrl} alt={name} loading="lazy" decoding="async" />
          <AvatarFallback className="bg-muted text-muted-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

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
  const initials = getInitials(name);

  if (src) {
    return <LazyAvatarWithImage src={src} name={name} size={size} className={className} onClick={onClick} />;
  }

  return (
    <Avatar
      className={cn(onClick && "cursor-pointer hover:opacity-80 transition-opacity", className)}
      onClick={onClick}
    >
      <AvatarFallback className="bg-muted text-muted-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
});
