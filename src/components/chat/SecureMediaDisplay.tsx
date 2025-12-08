import { memo, useState } from "react";
import { useSignedMediaUrl } from "@/hooks/useSignedMediaUrl";
import { Skeleton } from "@/components/ui/skeleton";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Download, FileText, ImageOff, AlertCircle } from "lucide-react";

interface SecureImageProps {
  mediaUrl: string | null | undefined;
  alt?: string;
  className?: string;
}

export const SecureImage = memo(function SecureImage({ 
  mediaUrl, 
  alt = "Imagem", 
  className = "" 
}: SecureImageProps) {
  const { signedUrl, loading, error } = useSignedMediaUrl(mediaUrl);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!mediaUrl) {
    return (
      <div className="flex items-center gap-2 text-sm opacity-70">
        <ImageOff className="h-4 w-4" />
        <span>Imagem indisponível</span>
      </div>
    );
  }

  if (loading) {
    return <Skeleton className="w-48 h-48 rounded-lg" />;
  }

  if (error || imageError) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
        <AlertCircle className="h-4 w-4" />
        <span>Erro ao carregar imagem</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {!imageLoaded && <Skeleton className="w-48 h-48 rounded-lg" />}
      <img
        src={signedUrl || mediaUrl}
        alt={alt}
        className={`rounded-lg max-w-full max-h-96 object-contain transition-opacity duration-200 ${
          imageLoaded ? "opacity-100" : "opacity-0 absolute top-0 left-0"
        } ${className}`}
        loading="lazy"
        decoding="async"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
    </div>
  );
});

interface SecureAudioProps {
  mediaUrl: string | null | undefined;
  mimetype?: string;
  duration?: number;
}

export const SecureAudio = memo(function SecureAudio({ 
  mediaUrl, 
  mimetype, 
  duration 
}: SecureAudioProps) {
  const { signedUrl, loading, error } = useSignedMediaUrl(mediaUrl);

  if (!mediaUrl) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="opacity-70">🎵 Áudio</span>
        <span className="text-xs opacity-50 italic">- Mídia indisponível</span>
      </div>
    );
  }

  if (loading) {
    return <Skeleton className="w-64 h-12 rounded-lg" />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        <span>Erro ao carregar áudio</span>
      </div>
    );
  }

  return (
    <AudioPlayer
      audioUrl={signedUrl || mediaUrl}
      mimetype={mimetype}
      duration={duration}
    />
  );
});

interface SecureVideoProps {
  mediaUrl: string | null | undefined;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
}

export const SecureVideo = memo(function SecureVideo({ 
  mediaUrl, 
  autoPlay = false,
  loop = false,
  muted = false,
  className = ""
}: SecureVideoProps) {
  const { signedUrl, loading, error } = useSignedMediaUrl(mediaUrl);
  const [videoError, setVideoError] = useState(false);

  if (!mediaUrl) {
    return (
      <div className="flex items-center gap-2 text-sm opacity-70">
        <AlertCircle className="h-4 w-4" />
        <span>Vídeo indisponível</span>
      </div>
    );
  }

  if (loading) {
    return <Skeleton className="w-48 h-48 rounded-lg" />;
  }

  if (error || videoError) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
        <AlertCircle className="h-4 w-4" />
        <span>Erro ao carregar vídeo</span>
      </div>
    );
  }

  return (
    <video
      src={signedUrl || mediaUrl}
      className={`rounded-lg max-w-full max-h-96 ${className}`}
      controls={!autoPlay}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      playsInline
      onError={() => setVideoError(true)}
    />
  );
});

interface SecureDocumentProps {
  mediaUrl: string | null | undefined;
  fileName?: string;
  fileSize?: number;
}

export const SecureDocument = memo(function SecureDocument({ 
  mediaUrl, 
  fileName, 
  fileSize 
}: SecureDocumentProps) {
  const { signedUrl, loading } = useSignedMediaUrl(mediaUrl);

  return (
    <div className="flex items-center gap-3 p-2 bg-background/50 rounded-lg">
      <FileText className="h-8 w-8 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName || "Documento"}</p>
        {fileSize && (
          <p className="text-xs text-muted-foreground">{(fileSize / 1024).toFixed(1)} KB</p>
        )}
      </div>
      {mediaUrl && (
        loading ? (
          <Skeleton className="h-8 w-8 rounded-lg" />
        ) : (
          <a 
            href={signedUrl || mediaUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <Download className="h-4 w-4" />
          </a>
        )
      )}
    </div>
  );
});
