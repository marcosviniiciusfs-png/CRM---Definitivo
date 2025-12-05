import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cache for signed URLs to avoid redundant API calls
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_DURATION = 50 * 60 * 1000; // 50 minutes (URLs expire in 60)

export function useSignedMediaUrl(mediaUrl: string | null | undefined) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaUrl) {
      setSignedUrl(null);
      return;
    }

    // Check if it's a blob URL (optimistic upload) - use directly
    if (mediaUrl.startsWith('blob:')) {
      setSignedUrl(mediaUrl);
      return;
    }

    // Check if it's NOT a Supabase storage URL - use directly
    if (!mediaUrl.includes('/storage/v1/object/') && !mediaUrl.includes('/chat-media/')) {
      setSignedUrl(mediaUrl);
      return;
    }

    // Check cache first
    const cached = signedUrlCache.get(mediaUrl);
    if (cached && cached.expiresAt > Date.now()) {
      setSignedUrl(cached.url);
      return;
    }

    // Fetch signed URL
    const fetchSignedUrl = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-signed-media-url', {
          body: { mediaUrl }
        });

        if (fnError) throw fnError;

        if (data?.signedUrl) {
          // Cache the result
          signedUrlCache.set(mediaUrl, {
            url: data.signedUrl,
            expiresAt: Date.now() + CACHE_DURATION
          });
          setSignedUrl(data.signedUrl);
        } else {
          throw new Error('No signed URL returned');
        }
      } catch (err: any) {
        console.error('Error fetching signed URL:', err);
        setError(err.message);
        // Fallback to original URL if signing fails
        setSignedUrl(mediaUrl);
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrl();
  }, [mediaUrl]);

  return { signedUrl, loading, error };
}

// Utility to get signed URL imperatively (for batch operations)
export async function getSignedMediaUrl(mediaUrl: string): Promise<string> {
  // Check if it's a blob URL or non-Supabase URL
  if (mediaUrl.startsWith('blob:') || (!mediaUrl.includes('/storage/v1/object/') && !mediaUrl.includes('/chat-media/'))) {
    return mediaUrl;
  }

  // Check cache
  const cached = signedUrlCache.get(mediaUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.functions.invoke('get-signed-media-url', {
      body: { mediaUrl }
    });

    if (error) throw error;

    if (data?.signedUrl) {
      signedUrlCache.set(mediaUrl, {
        url: data.signedUrl,
        expiresAt: Date.now() + CACHE_DURATION
      });
      return data.signedUrl;
    }
  } catch (err) {
    console.error('Error fetching signed URL:', err);
  }

  // Fallback to original URL
  return mediaUrl;
}

// Clear expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of signedUrlCache.entries()) {
    if (value.expiresAt < now) {
      signedUrlCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes
