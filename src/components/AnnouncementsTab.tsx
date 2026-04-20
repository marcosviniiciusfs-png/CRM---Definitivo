import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Link,
  Star,
  Settings,
  Pencil,
  Plus,
  PencilLine,
  ToggleLeft,
  Eye,
  Bell,
} from 'lucide-react';
import { useAdminAnnouncements, OrganizationInfo } from '@/hooks/useAdminAnnouncements';
import { AnnouncementPreview } from '@/components/AnnouncementPreview';
import {
  Announcement,
  AnnouncementFormData,
  TEMPLATE_CONFIG,
  TemplateType,
} from '@/types/announcements';
import { useAuth } from '@/contexts/AuthContext';

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  Link,
  Star,
  Settings,
  Pencil,
};

type FormMode = 'list' | 'create' | 'edit';

const emptyForm: AnnouncementFormData = {
  title: '',
  content: '',
  gif_url: '',
  template_type: null,
  target_type: 'global',
  target_organization_id: '',
  is_active: true,
  scheduled_at: null,
};

export function AnnouncementsTab() {
  const { user } = useAuth();
  const { announcements, organizations, loading, createAnnouncement, updateAnnouncement, toggleActive } = useAdminAnnouncements();

  const [mode, setMode] = useState<FormMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementFormData>(emptyForm);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'preview' | 'confirm'>('preview');
  const [saving, setSaving] = useState(false);

  const handleSelectTemplate = (templateType: TemplateType) => {
    const config = TEMPLATE_CONFIG[templateType];
    setForm((prev) => ({
      ...prev,
      template_type: templateType,
      title: config.defaultTitle,
      content: config.defaultContent,
    }));
  };

  const handleCreateNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setSendMode('now');
    setMode('create');
  };

  const handleEdit = (announcement: Announcement) => {
    setForm({
      title: announcement.title,
      content: announcement.content,
      gif_url: announcement.gif_url || '',
      template_type: announcement.template_type,
      target_type: announcement.target_type as 'global' | 'organization',
      target_organization_id: announcement.target_organization_id || '',
      is_active: announcement.is_active,
      scheduled_at: announcement.scheduled_at,
    });
    setEditingId(announcement.id);
    setSendMode(announcement.scheduled_at ? 'schedule' : 'now');
    setMode('edit');
  };

  const handlePreview = () => {
    setPreviewMode('preview');
    setPreviewOpen(true);
  };

  const handleSendNow = () => {
    setPreviewMode('confirm');
    setPreviewOpen(true);
  };

  const handleConfirmSend = async () => {
    setSaving(true);
    try {
      if (mode === 'edit' && editingId) {
        await updateAnnouncement(editingId, {
          ...form,
          scheduled_at: new Date().toISOString(),
        });
      } else {
        await createAnnouncement(
          { ...form, scheduled_at: new Date().toISOString() },
          user?.id || ''
        );
      }
      setPreviewOpen(false);
      setMode('list');
    } catch (err) {
      console.error('Error sending announcement:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    setSaving(true);
    try {
      if (mode === 'edit' && editingId) {
        await updateAnnouncement(editingId, form);
      } else {
        await createAnnouncement(form, user?.id || '');
      }
      setMode('list');
    } catch (err) {
      console.error('Error scheduling announcement:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AnnouncementFormData>(key: K, value: AnnouncementFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (mode === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Avisos Ativos</h3>
          <Button onClick={handleCreateNew} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Novo Aviso
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando avisos...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhum aviso criado ainda.</div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => {
              const config = a.template_type ? TEMPLATE_CONFIG[a.template_type] : null;
              const TemplateIcon = config ? TEMPLATE_ICONS[config.icon] : Bell;
              const targetLabel = a.target_type === 'global'
                ? 'Global'
                : a.organizations?.name || 'Organização';

              return (
                <Card key={a.id} className="bg-card border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <TemplateIcon
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: config?.color || '#888' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {a.title}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                a.is_active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {a.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Para: {targetLabel} • Criado em:{' '}
                            {new Date(a.created_at).toLocaleDateString('pt-BR')}
                            {a.scheduled_at && (
                              <> • Agendado: {new Date(a.scheduled_at).toLocaleString('pt-BR')}</>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>
                          <PencilLine className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(a.id, a.is_active)}
                        >
                          <ToggleLeft className="w-3.5 h-3.5" />
                          {a.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {mode === 'create' ? 'Novo Aviso' : 'Editar Aviso'}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setMode('list')}>
          Voltar
        </Button>
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
          Escolha um modelo
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(TEMPLATE_CONFIG) as [TemplateType, typeof TEMPLATE_CONFIG[TemplateType]][]).map(
            ([key, cfg]) => {
              const TplIcon = TEMPLATE_ICONS[cfg.icon];
              const selected = form.template_type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectTemplate(key)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <TplIcon className="w-5 h-5 flex-shrink-0" style={{ color: cfg.color }} />
                  <div>
                    <div className="text-xs font-medium text-foreground">{cfg.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {key === 'meta_reconnect' ? 'Passo a passo' : key === 'new_feature' ? 'Nova funcionalidade' : key === 'maintenance' ? 'Sistema indisponível' : 'Em branco'}
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Título</label>
        <Input
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Título do aviso"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">
          Conteúdo (use **texto** para negrito)
        </label>
        <Textarea
          value={form.content}
          onChange={(e) => updateField('content', e.target.value)}
          placeholder="Conteúdo do aviso..."
          rows={5}
        />
      </div>

      {form.template_type !== 'meta_reconnect' && (
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            URL do GIF (opcional)
          </label>
          <Input
            value={form.gif_url}
            onChange={(e) => updateField('gif_url', e.target.value)}
            placeholder="https://exemplo.com/animacao.gif"
          />
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Destinatário</label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={form.target_type === 'global' ? 'default' : 'outline'}
            onClick={() => updateField('target_type', 'global')}
          >
            Todos
          </Button>
          <Button
            type="button"
            size="sm"
            variant={form.target_type === 'organization' ? 'default' : 'outline'}
            onClick={() => updateField('target_type', 'organization')}
          >
            Organização
          </Button>
        </div>
        {form.target_type === 'organization' && (
          <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5">
            {organizations.map((org: OrganizationInfo) => (
              <button
                key={org.id}
                type="button"
                onClick={() => updateField('target_organization_id', org.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                  form.target_organization_id === org.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-muted-foreground uppercase">
                  {org.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{org.name}</div>
                  {org.owner_email && (
                    <div className="text-[10px] text-muted-foreground truncate">{org.owner_email}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Quando enviar?</label>
        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            size="sm"
            variant={sendMode === 'now' ? 'default' : 'outline'}
            onClick={() => setSendMode('now')}
          >
            Agora
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sendMode === 'schedule' ? 'default' : 'outline'}
            onClick={() => setSendMode('schedule')}
          >
            Agendar
          </Button>
        </div>
        {sendMode === 'schedule' && (
          <div className="flex gap-2">
            <Input
              type="date"
              onChange={(e) => {
                const date = e.target.value;
                const timeEl = document.getElementById('schedule-time') as HTMLInputElement | null;
                const time = timeEl?.value || '00:00';
                const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
                updateField('scheduled_at', scheduledAt);
              }}
            />
            <Input
              id="schedule-time"
              type="time"
              onChange={(e) => {
                const time = e.target.value;
                const dateEl = document.querySelector('input[type="date"]') as HTMLInputElement | null;
                const date = dateEl?.value || new Date().toISOString().split('T')[0];
                const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
                updateField('scheduled_at', scheduledAt);
              }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={handlePreview} size="sm">
          <Eye className="w-4 h-4 mr-1" />
          Preview
        </Button>
        {sendMode === 'schedule' ? (
          <Button onClick={handleSchedule} disabled={saving} size="sm">
            {saving ? 'Agendando...' : 'Agendar'}
          </Button>
        ) : (
          <Button onClick={handleSendNow} disabled={saving} size="sm">
            {saving ? 'Enviando...' : 'Enviar agora'}
          </Button>
        )}
      </div>

      <AnnouncementPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        formData={form}
        onConfirm={handleConfirmSend}
        mode={previewMode}
      />
    </div>
  );
}
