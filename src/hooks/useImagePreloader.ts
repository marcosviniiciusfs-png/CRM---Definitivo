import { useEffect, useRef, useCallback } from "react";
import { preloadImage } from "@/lib/image-utils";

interface UseImagePreloaderOptions {
  /** Maximum concurrent preloads */
  maxConcurrent?: number;
  /** Root margin for IntersectionObserver */
  rootMargin?: string;
}

/**
 * Hook for preloading images as they approach the viewport
 * Used for chat media optimization
 */
export function useImagePreloader(
  imageUrls: string[],
  options: UseImagePreloaderOptions = {}
) {
  const { maxConcurrent = 3, rootMargin = "200px" } = options;
  
  const preloadedRef = useRef<Set<string>>(new Set());
  const loadingRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);

  const processQueue = useCallback(async () => {
    while (
      queueRef.current.length > 0 &&
      loadingRef.current.size < maxConcurrent
    ) {
      const url = queueRef.current.shift();
      if (!url || preloadedRef.current.has(url) || loadingRef.current.has(url)) {
        continue;
      }

      loadingRef.current.add(url);

      try {
        await preloadImage(url);
        preloadedRef.current.add(url);
      } catch {
        // Silently fail - image will load normally when displayed
      } finally {
        loadingRef.current.delete(url);
        processQueue();
      }
    }
  }, [maxConcurrent]);

  const preload = useCallback(
    (url: string) => {
      if (!preloadedRef.current.has(url) && !loadingRef.current.has(url)) {
        queueRef.current.push(url);
        processQueue();
      }
    },
    [processQueue]
  );

  // Preload visible images on mount
  useEffect(() => {
    const uniqueUrls = [...new Set(imageUrls)].slice(0, maxConcurrent * 2);
    uniqueUrls.forEach((url) => preload(url));
  }, [imageUrls, preload, maxConcurrent]);

  return { preload, isPreloaded: (url: string) => preloadedRef.current.has(url) };
}

/**
 * Hook for lazy loading a single element with IntersectionObserver
 */
export function useLazyLoad(rootMargin = "100px") {
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const observe = useCallback(
    (element: HTMLElement | null, onVisible: () => void) => {
      if (!element) return;

      elementRef.current = element;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              onVisible();
              observerRef.current?.disconnect();
            }
          });
        },
        { rootMargin, threshold: 0 }
      );

      observerRef.current.observe(element);
    },
    [rootMargin]
  );

  const disconnect = useCallback(() => {
    observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return { observe, disconnect };
}
