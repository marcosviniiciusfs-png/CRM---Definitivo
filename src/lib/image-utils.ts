// Image optimization utilities

const AVATAR_SIZES = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 128,
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZES;

/**
 * Generates an optimized avatar URL based on the required size
 * For ui-avatars.com: adjusts size parameter
 * For external URLs: returns original (already optimized by storage)
 */
export function getOptimizedAvatarUrl(
  url: string | null | undefined,
  initials: string,
  size: AvatarSize = 'md'
): string {
  const pixelSize = AVATAR_SIZES[size];
  const safeInitials = initials || 'NN';
  
  // If no URL, generate ui-avatars URL with correct size
  if (!url) {
    try {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(safeInitials)}&background=random&color=fff&size=${pixelSize}`;
    } catch {
      return `https://ui-avatars.com/api/?name=NN&background=random&color=fff&size=${pixelSize}`;
    }
  }
  
  // If it's a ui-avatars URL, optimize the size
  if (url.includes('ui-avatars.com')) {
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('size', pixelSize.toString());
      return urlObj.toString();
    } catch {
      return url;
    }
  }
  
  // External URLs (Supabase storage, etc.) - return as-is
  return url;
}

/**
 * Gets initials from a name string
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return 'NN';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Preloads an image and returns a promise
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
}
