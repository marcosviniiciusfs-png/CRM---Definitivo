import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, Image as ImageIcon, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

export const AdCard = ({ ad, getStatusBadgeVariant, getStatusLabel }: AdCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isVideo = ad.creative?.object_type === 'VIDEO' || ad.creative?.object_type === 'video';
  const thumbnailUrl = ad.creative?.thumbnail_url || ad.creative?.image_url;
  const hasPreview = !!ad.preview_html;

  // Decode HTML entities in preview_html
  const decodeHtmlEntities = (html: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
  };

  return (
    <>
      <Card className="overflow-hidden group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/30 h-full flex flex-col">
        {/* Media Container - Larger aspect ratio for better preview */}
        <div className="aspect-[9/16] min-h-[400px] bg-gradient-to-br from-muted to-muted/50 relative overflow-hidden">
          {hasPreview ? (
            // Meta Official Preview iframe
            <div className="relative w-full h-full">
              <div 
                className="w-full h-full overflow-hidden"
                dangerouslySetInnerHTML={{ 
                  __html: decodeHtmlEntities(ad.preview_html!) 
                }}
                style={{
                  transform: 'scale(1)',
                  transformOrigin: 'top center'
                }}
              />
              {/* Expand button */}
              <button
                onClick={() => setIsExpanded(true)}
                className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors z-10"
                title="Expandir prévia"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              {/* Type indicator */}
              <div className="absolute top-3 left-3 z-10">
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs backdrop-blur-sm",
                    isVideo ? "bg-purple-500/90 text-white border-0" : "bg-blue-500/90 text-white border-0"
                  )}
                >
                  {isVideo ? (
                    <><Video className="h-3 w-3 mr-1" /> Vídeo</>
                  ) : (
                    <><ImageIcon className="h-3 w-3 mr-1" /> Imagem</>
                  )}
                </Badge>
              </div>
            </div>
          ) : thumbnailUrl ? (
            // Fallback to thumbnail
            <div className="relative w-full h-full">
              <img 
                src={thumbnailUrl} 
                alt={ad.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Type indicator */}
              <div className="absolute top-3 left-3">
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs backdrop-blur-sm",
                    isVideo ? "bg-purple-500/90 text-white border-0" : "bg-blue-500/90 text-white border-0"
                  )}
                >
                  {isVideo ? (
                    <><Video className="h-3 w-3 mr-1" /> Vídeo</>
                  ) : (
                    <><ImageIcon className="h-3 w-3 mr-1" /> Imagem</>
                  )}
                </Badge>
              </div>
              
              {/* No preview available message */}
              <div className="absolute bottom-3 left-3 right-3">
                <div className="bg-black/70 backdrop-blur-sm rounded px-2 py-1">
                  <p className="text-xs text-white/80">Prévia completa indisponível</p>
                </div>
              </div>
            </div>
          ) : (
            // No Media Placeholder
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40">
              <ImageIcon className="h-16 w-16 mb-3" />
              <span className="text-sm">Sem preview disponível</span>
            </div>
          )}
        </div>
        
        {/* Content */}
        <CardContent className="p-4 flex-1 flex flex-col">
          {/* Ad Name */}
          <h4 className="font-semibold text-sm line-clamp-2 mb-2 group-hover:text-primary transition-colors" title={ad.name}>
            {ad.name}
          </h4>
          
          {/* Creative Title */}
          {ad.creative?.title && (
            <p className="text-sm font-medium text-foreground mb-1.5 line-clamp-1" title={ad.creative.title}>
              {ad.creative.title}
            </p>
          )}
          
          {/* Creative Body/Description */}
          {ad.creative?.body && (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-3 flex-1" title={ad.creative.body}>
              {ad.creative.body}
            </p>
          )}
          
          {/* Badges Row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-auto">
            <Badge 
              variant={getStatusBadgeVariant(ad.effective_status)}
              className="text-[10px] px-1.5 py-0.5"
            >
              {getStatusLabel(ad.effective_status)}
            </Badge>
            {ad.creative?.call_to_action_type && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                {ad.creative.call_to_action_type.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expanded Preview Modal */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-lg line-clamp-1">{ad.name}</DialogTitle>
          </DialogHeader>
          <div className="w-full h-[70vh] overflow-auto bg-muted/30">
            {hasPreview ? (
              <div 
                className="w-full h-full flex items-start justify-center p-4"
                dangerouslySetInnerHTML={{ 
                  __html: decodeHtmlEntities(ad.preview_html!) 
                }}
              />
            ) : thumbnailUrl ? (
              <div className="w-full h-full flex items-center justify-center p-4">
                <img 
                  src={thumbnailUrl} 
                  alt={ad.name}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-16 w-16 mb-3" />
                <span>Sem preview disponível</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
