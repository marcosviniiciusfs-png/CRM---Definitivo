import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Link, Star, Settings, Pencil } from 'lucide-react';
import { AnnouncementFormData, TEMPLATE_CONFIG } from '@/types/announcements';

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  Link,
  Star,
  Settings,
  Pencil,
};

const META_RECONNECT_IMAGE = '/images/meta-reconnect.png';

interface AnnouncementPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: AnnouncementFormData;
  onConfirm: () => void;
  mode: 'preview' | 'confirm';
}

export function AnnouncementPreview({
  open,
  onOpenChange,
  formData,
  onConfirm,
  mode,
}: AnnouncementPreviewProps) {
  const config = formData.template_type
    ? TEMPLATE_CONFIG[formData.template_type]
    : null;
  const IconComponent = config ? TEMPLATE_ICONS[config.icon] : Bell;
  const iconColor = config?.color || '#eab308';
  const label = config?.label || 'Aviso';

  const isMetaReconnect = formData.template_type === 'meta_reconnect';
  const imageSrc = isMetaReconnect ? META_RECONNECT_IMAGE : formData.gif_url;

  const targetLabel = formData.target_type === 'global'
    ? 'Todas as organizações'
    : 'Organização selecionada';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">Preview do aviso</DialogTitle>
        <DialogDescription className="sr-only">Visualização de como o aviso aparecerá para os usuários</DialogDescription>
        <div className="flex items-start gap-3 mb-3">
          {imageSrc && (
            <div className="flex-shrink-0">
              <img
                src={imageSrc}
                alt=""
                width={48}
                height={48}
                className="rounded-lg object-contain"
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
              {formData.title || 'Título do aviso'}
            </h4>
          </div>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-h-40 overflow-y-auto">
          {(formData.content || '').split(/(\*\*[^*]+\*\*)/).map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>

        <div className="border-t pt-3 mt-3 flex flex-col gap-2.5">
          <label className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary rounded" />
            <span className="text-xs text-muted-foreground">
              Entendi e não quero mais ver esse aviso
            </span>
          </label>
          <div className="w-full py-2 text-center text-xs text-muted-foreground border rounded-md bg-muted">
            Fechar
          </div>
        </div>

        {mode === 'confirm' && (
          <div className="border-t pt-3 mt-2 bg-muted/30 -mx-6 -mb-6 px-6 pb-6 rounded-b-lg">
            <p className="text-xs text-muted-foreground mb-3">
              Este aviso será enviado <strong className="text-yellow-500">agora</strong> para{' '}
              <strong className="text-foreground">{targetLabel}</strong>
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={onConfirm}
              >
                Confirmar disparo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
