import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, Image as ImageIcon, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CampaignAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  creative: {
    id: string;
    name?: string;
    thumbnail_url?: string;
    image_url?: string;
    body?: string;
    title?: string;
    call_to_action_type?: string;
    object_type?: string;
  } | null;
  preview_html?: string;
}

interface AdCardProps {
  ad: CampaignAd;
  getStatusBadgeVariant: (status: string) => "default" | "secondary" | "destructive" | "outline";
  getStatusLabel: (status: string) => string;
}

const AdTypeBadge = ({ isVideo }: { isVideo: boolean }) => (
  <Badge
    variant="secondary"
    className={cn(
      "text-[10px] backdrop-blur-sm absolute top-2 left-2 z-10",
      isVideo ? "bg-purple-500/90 text-white border-0" : "bg-blue-500/90 text-white border-0"
    )}
  >
    {isVideo ? (
      <><Video className="h-3 w-3 mr-1" /> Vídeo</>
    ) : (
      <><ImageIcon className="h-3 w-3 mr-1" /> Imagem</>
    )}
  </Badge>
);

export const AdCard = ({ ad, getStatusBadgeVariant, getStatusLabel }: AdCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [iframeScale, setIframeScale] = useState(1);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isVideo = ad.creative?.object_type === 'VIDEO' || ad.creative?.object_type === 'video';
  const thumbnailUrl = ad.creative?.thumbnail_url || ad.creative?.image_url;
  const hasPreview = !!ad.preview_html;

  const decodeHtmlEntities = (html: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
  };

  // Compute scale for iframe to fit container
  const computeScale = useCallback(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.offsetWidth;
    const iframeEl = containerRef.current.querySelector('iframe');
    if (!iframeEl) return;
    const iframeW = iframeEl.offsetWidth || 500;
    if (iframeW > 0 && containerW > 0) {
      setIframeScale(Math.min(1, containerW / iframeW));
    }
  }, []);

  useEffect(() => {
    if (!hasPreview) return;
    const timer = setTimeout(computeScale, 300);
    return () => clearTimeout(timer);
  }, [hasPreview, iframeLoaded, computeScale]);

  // 5s timeout for iframe error
  useEffect(() => {
    if (!hasPreview) return;
    const timer = setTimeout(() => {
      if (!iframeLoaded) setIframeError(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [hasPreview, iframeLoaded]);

  // Reset states when ad changes
  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
    setIframeScale(1);
  }, [ad.id]);

  const renderPreviewArea = (isModal = false) => {
    if (hasPreview && !iframeError) {
      return (
        <div
          ref={isModal ? undefined : containerRef}
          className="relative w-full overflow-hidden bg-muted/30"
          style={{ aspectRatio: isModal ? undefined : '4/5', height: isModal ? '60vh' : undefined }}
        >
          <div
            style={{
              transform: `scale(${iframeScale})`,
              transformOrigin: 'top center',
              width: `${100 / iframeScale}%`,
              display: 'flex',
              justifyContent: 'center',
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(decodeHtmlEntities(ad.preview_html!)) }}
          />
          {/* Loading overlay */}
          {!iframeLoaded && !iframeError && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
              <div className="text-xs text-muted-foreground animate-pulse">Carregando prévia...</div>
            </div>
          )}
          {/* Expand button */}
          {!isModal && (
            <button
              onClick={() => setIsExpanded(true)}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors z-10"
              title="Expandir prévia"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <AdTypeBadge isVideo={isVideo} />
        </div>
      );
    }

    if (thumbnailUrl) {
      return (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: isModal ? '16/9' : '4/5' }}>
          <img src={thumbnailUrl} alt={ad.name} className="w-full h-full object-cover" />
          {!isModal && (
            <div className="absolute bottom-2 left-2 right-2">
              <div className="bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-white/70">
                Prévia completa indisponível
              </div>
            </div>
          )}
          <AdTypeBadge isVideo={isVideo} />
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col items-center justify-center gap-2 text-muted-foreground/40 bg-muted/30" style={{ aspectRatio: '4/5' }}>
        <ImageIcon className="h-12 w-12" />
        <span className="text-xs">Sem preview</span>
      </div>
    );
  };

  return (
    <>
      <Card className="overflow-hidden flex flex-col hover:border-primary/30 transition-colors">
        {renderPreviewArea(false)}
        <CardContent className="p-3 flex-1 flex flex-col gap-1.5">
          <h4 className="text-sm font-medium line-clamp-2">{ad.name}</h4>
          {ad.creative?.title && (
            <p className="text-xs font-medium line-clamp-1">{ad.creative.title}</p>
          )}
          {ad.creative?.body && (
            <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{ad.creative.body}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-auto">
            <Badge variant={getStatusBadgeVariant(ad.effective_status)} className="text-[10px]">
              {getStatusLabel(ad.effective_status)}
            </Badge>
            {ad.creative?.call_to_action_type && (
              <Badge variant="outline" className="text-[10px]">
                {ad.creative.call_to_action_type.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expanded Preview Modal */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="p-4 border-b flex-shrink-0">
            <DialogTitle className="text-sm line-clamp-1">{ad.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 bg-muted/20">
            {renderPreviewArea(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
