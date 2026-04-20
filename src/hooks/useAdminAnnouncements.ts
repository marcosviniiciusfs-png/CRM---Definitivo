import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Announcement, AnnouncementFormData } from '@/types/announcements';

export function useAdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, gif_url, template_type, target_type, target_organization_id, is_active, scheduled_at, created_by, created_at, organizations(id, name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching announcements:', error);
    } else {
      setAnnouncements(data || []);
    }
    setLoading(false);
  }, []);

  const fetchOrganizations = useCallback(async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setOrganizations(data);
    }
  }, []);

  const createAnnouncement = useCallback(async (formData: AnnouncementFormData, adminUserId: string) => {
    const payload: Record<string, unknown> = {
      title: formData.title,
      content: formData.content,
      gif_url: formData.gif_url || null,
      template_type: formData.template_type,
      target_type: formData.target_type,
      target_organization_id: formData.target_type === 'organization' ? formData.target_organization_id : null,
      is_active: true,
      scheduled_at: formData.scheduled_at || null,
      created_by: adminUserId,
    };

    const { error } = await supabase
      .from('announcements')
      .insert(payload);

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  const updateAnnouncement = useCallback(async (id: string, formData: Partial<AnnouncementFormData>) => {
    const payload: Record<string, unknown> = { ...formData };
    if (formData.target_type === 'global') {
      payload.target_organization_id = null;
    }

    const { error } = await supabase
      .from('announcements')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('announcements')
      .update({ is_active: !isActive })
      .eq('id', id);

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => {
    fetchAnnouncements();
    fetchOrganizations();
  }, [fetchAnnouncements, fetchOrganizations]);

  return {
    announcements,
    organizations,
    loading,
    createAnnouncement,
    updateAnnouncement,
    toggleActive,
    fetchAnnouncements,
  };
}
