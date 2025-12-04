import { useState, useCallback, useRef, useEffect } from 'react';

interface UsePaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

interface UsePaginationReturn<T> {
  items: T[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  reset: () => void;
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingMore: React.Dispatch<React.SetStateAction<boolean>>;
  incrementPage: () => void;
  pageSize: number;
  getRange: () => { start: number; end: number };
}

export function usePagination<T>(options: UsePaginationOptions = {}): UsePaginationReturn<T> {
  const { pageSize = 50, initialPage = 0 } = options;
  
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      setPage(prev => prev + 1);
    }
  }, [loadingMore, hasMore, loading]);

  const reset = useCallback(() => {
    setItems([]);
    setPage(initialPage);
    setHasMore(true);
    setLoading(false);
    setLoadingMore(false);
  }, [initialPage]);

  const incrementPage = useCallback(() => {
    setPage(prev => prev + 1);
  }, []);

  const getRange = useCallback(() => {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    return { start, end };
  }, [page, pageSize]);

  return {
    items,
    page,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    reset,
    setItems,
    setHasMore,
    setLoading,
    setLoadingMore,
    incrementPage,
    pageSize,
    getRange,
  };
}

// Hook for infinite scroll with intersection observer
export function useInfiniteScroll(
  loadMore: () => void,
  hasMore: boolean,
  loading: boolean
) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, loadMore]);

  return observerTarget;
}

// Hook for cursor-based pagination (more efficient for large datasets)
export function useCursorPagination<T extends { id: string; created_at?: string }>(
  pageSize: number = 50
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const appendItems = useCallback((newItems: T[]) => {
    if (newItems.length === 0) {
      setHasMore(false);
      return;
    }
    
    setItems(prev => [...prev, ...newItems]);
    setCursor(newItems[newItems.length - 1]?.id || null);
    setHasMore(newItems.length === pageSize);
  }, [pageSize]);

  const reset = useCallback(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
  }, []);

  return {
    items,
    cursor,
    hasMore,
    loading,
    setLoading,
    appendItems,
    reset,
    setItems,
    pageSize,
  };
}
