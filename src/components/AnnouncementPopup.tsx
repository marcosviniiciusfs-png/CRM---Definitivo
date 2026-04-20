import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Bell, Link, Star, Settings, Pencil } from 'lucide-react';
import { Announcement, TEMPLATE_CONFIG } from '@/types/announcements';

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  Link,
  Star,
  Settings,
  Pencil,
};

const META_RECONNECT_IMAGE = '/images/meta-reconnect.png';

interface AnnouncementPopupProps {
  announcement: Announcement | null;
  onDismiss: (id: string, dontShowAgain: boolean) => void;
}

export function AnnouncementPopup({ announcement, onDismiss }: AnnouncementPopupProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setDontShowAgain(false);
    setImageLoaded(false);
  }, [announcement?.id]);

  if (!announcement) return null;

  const config = announcement.template_type
    ? TEMPLATE_CONFIG[announcement.template_type]
    : null;
  const IconComponent = config ? TEMPLATE_ICONS[config.icon] : Bell;
  const iconColor = config?.color || '#eab308';
  const label = config?.label || 'Aviso';

  const isMetaReconnect = announcement.template_type === 'meta_reconnect';
  const imageSrc = isMetaReconnect
    ? META_RECONNECT_IMAGE
    : announcement.gif_url;

  const handleDismiss = () => {
    onDismiss(announcement.id, dontShowAgain);
  };

  const showPopup = imageLoaded || !imageSrc;

  return (
    <Dialog open={!!announcement} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent
        className={`sm:max-w-md ${!showPopup ? 'opacity-0 pointer-events-none' : ''} transition-opacity duration-200`}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogTitle className="sr-only">{announcement.title}</DialogTitle>
        <DialogDescription className="sr-only">{announcement.content.slice(0, 100)}</DialogDescription>
        <div className="flex items-start gap-3 mb-3">
          {imageSrc && (
            <div className="flex-shrink-0">
              <img
                ref={imgRef}
                src={imageSrc}
                alt=""
                width={48}
                height={48}
                className="rounded-lg object-contain"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <IconComponent className="w-3.5 h-3.5" style={{ color: iconColor }} />
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: iconColor }}
              >
                {label}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-foreground leading-tight">
              {announcement.title}
            </h4>
          </div>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {announcement.content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>

        <div className="border-t pt-3 mt-3 flex flex-col gap-2.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <span className="text-xs text-muted-foreground">
              Entendi e não quero mais ver esse aviso
            </span>
          </label>
          <Button onClick={handleDismiss} className="w-full" variant="default">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
