import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Video, Image as ImageIcon, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
    video_id?: string;
    video_source_url?: string;
    video_thumbnail_url?: string;
    video_permalink_url?: string;
    video_length?: number;
    object_type?: string;
  } | null;
}

interface AdCardProps {
  ad: CampaignAd;
  getStatusBadgeVariant: (status: string) => "default" | "secondary" | "destructive" | "outline";
  getStatusLabel: (status: string) => string;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AdCard = ({ ad, getStatusBadgeVariant, getStatusLabel }: AdCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  
  const isVideo = !!ad.creative?.video_id;
  const thumbnailUrl = ad.creative?.thumbnail_url || ad.creative?.video_thumbnail_url || ad.creative?.image_url;

  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-shadow duration-300 border-border/50 hover:border-primary/30">
      {/* Media Container */}
      <div className="aspect-video bg-gradient-to-br from-muted to-muted/50 relative overflow-hidden">
        {isVideo && isPlaying && ad.creative?.video_source_url ? (
          // Video Player
          <div className="relative w-full h-full">
            <video 
              src={ad.creative.video_source_url}
              controls
              autoPlay
              className="w-full h-full object-contain bg-black"
              onEnded={() => setIsPlaying(false)}
            />
            <button
              onClick={() => setIsPlaying(false)}
              className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : thumbnailUrl ? (
          // Thumbnail with Play Button
          <div 
            className={cn(
              "relative w-full h-full",
              isVideo && ad.creative?.video_source_url && "cursor-pointer"
            )}
            onClick={() => isVideo && ad.creative?.video_source_url && setIsPlaying(true)}
          >
            <img 
              src={thumbnailUrl} 
              alt={ad.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Play button for videos */}
            {isVideo && ad.creative?.video_source_url && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-4 bg-black/50 backdrop-blur-sm rounded-full group-hover:bg-primary/90 transition-all duration-300 group-hover:scale-110">
                  <Play className="h-8 w-8 text-white fill-white" />
                </div>
              </div>
            )}
            
            {/* Video duration badge */}
            {isVideo && ad.creative?.video_length && (
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/80 backdrop-blur-sm rounded text-xs text-white font-medium flex items-center gap-1">
                <Video className="h-3 w-3" />
                {formatDuration(ad.creative.video_length)}
              </div>
            )}
            
            {/* Type indicator */}
            <div className="absolute top-2 left-2">
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
        ) : (
          // No Media Placeholder
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40">
            <ImageIcon className="h-12 w-12 mb-2" />
            <span className="text-xs">Sem preview</span>
          </div>
        )}
      </div>
      
      {/* Content */}
      <CardContent className="p-4">
        {/* Ad Name */}
        <h4 className="font-semibold text-sm truncate mb-2 group-hover:text-primary transition-colors" title={ad.name}>
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
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3" title={ad.creative.body}>
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
          {isVideo && ad.creative?.video_permalink_url && (
            <a 
              href={ad.creative.video_permalink_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="ml-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 cursor-pointer hover:bg-muted transition-colors">
                <ExternalLink className="h-3 w-3 mr-1" />
                Facebook
              </Badge>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
