export type TemplateType = 'meta_reconnect' | 'new_feature' | 'maintenance' | 'custom';
export type TargetType = 'global' | 'organization';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  gif_url: string | null;
  template_type: TemplateType | null;
  target_type: TargetType;
  target_organization_id: string | null;
  is_active: boolean;
  scheduled_at: string | null;
  created_by: string | null;
  created_at: string;
  // Joined from admin query
  organizations?: { id: string; name: string } | null;
}

export interface AnnouncementDismissal {
  id: string;
  announcement_id: string;
  user_id: string;
  dismissed_at: string;
}

export interface AnnouncementFormData {
  title: string;
  content: string;
  gif_url: string;
  template_type: TemplateType | null;
  target_type: TargetType;
  target_organization_id: string;
  is_active: boolean;
  scheduled_at: string | null;
}

export const TEMPLATE_CONFIG: Record<TemplateType, {
  label: string;
  color: string;
  icon: string;
  defaultTitle: string;
  defaultContent: string;
  hasStaticImage: boolean;
}> = {
  meta_reconnect: {
    label: 'Reconexão Meta',
    color: '#06b6d4',
    icon: 'Link',
    defaultTitle: 'Reconecte sua conta Meta',
    defaultContent: 'Sua conexão com o Meta expirou. Siga os passos para reconectar:\n\n**1.** Acesse Integrações no menu\n**2.** Clique em "Reconectar Meta"\n**3.** Autorize o aplicativo\n**4.** Pronto! Seus leads voltarão a sincronizar',
    hasStaticImage: true,
  },
  new_feature: {
    label: 'Novidade',
    color: '#22c55e',
    icon: 'Star',
    defaultTitle: 'Nova funcionalidade disponível!',
    defaultContent: 'Temos uma novidade para você!',
    hasStaticImage: false,
  },
  maintenance: {
    label: 'Manutenção',
    color: '#eab308',
    icon: 'Settings',
    defaultTitle: 'Manutenção programada',
    defaultContent: 'O sistema passará por manutenção. Atualizaremos em breve.',
    hasStaticImage: false,
  },
  custom: {
    label: 'Customizado',
    color: '#a855f7',
    icon: 'Pencil',
    defaultTitle: '',
    defaultContent: '',
    hasStaticImage: false,
  },
};
