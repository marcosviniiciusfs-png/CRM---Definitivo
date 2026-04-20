import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Announcement, AnnouncementFormData } from '@/types/announcements';
import { getAdminToken } from '@/contexts/AdminAuthContext';

export interface OrganizationInfo {
  id: string;
  name: string;
  owner_email: string | null;
}

interface RpcAnnouncement {
  id: string;
  title: string;
  content: string;
  gif_url: string | null;
  template_type: string | null;
  target_type: string;
  target_organization_id: string | null;
  is_active: boolean;
  scheduled_at: string | null;
  created_by: string | null;
  created_at: string;
  org_name: string | null;
}

export function useAdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const getToken = () => getAdminToken();

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const token = getToken();
    if (!token) { setLoading(false); return; }

    const { data, error } = await supabase.rpc('admin_list_announcements', { p_token: token });

    if (error) {
      console.error('Error fetching announcements:', error);
    } else if (Array.isArray(data)) {
      const mapped: Announcement[] = (data as RpcAnnouncement[]).map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        gif_url: row.gif_url,
        template_type: row.template_type,
        target_type: row.target_type,
        target_organization_id: row.target_organization_id,
        is_active: row.is_active,
        scheduled_at: row.scheduled_at,
        created_by: row.created_by,
        created_at: row.created_at,
        organizations: row.org_name ? { id: row.target_organization_id || '', name: row.org_name } : null,
      }));
      setAnnouncements(mapped);
    }
    setLoading(false);
  }, []);

  const fetchOrganizations = useCallback(async () => {
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .order('name');

    if (orgError || !orgs) return;

    const { data: owners } = await supabase
      .from('organization_members')
      .select('organization_id, user_id')
      .eq('role', 'owner');

    const ownerMap = new Map<string, string>();
    if (owners) {
      for (const o of owners as { organization_id: string; user_id: string }[]) {
        ownerMap.set(o.organization_id, o.user_id);
      }
    }

    const emailMap = new Map<string, string>();
    const token = getToken();
    if (token) {
      const { data: users } = await supabase.rpc('safe_list_all_users', { p_token: token });
      if (Array.isArray(users)) {
        for (const u of users as { id: string; email?: string }[]) {
          if (u.email) emailMap.set(u.id, u.email);
        }
      }
    }

    const orgInfos: OrganizationInfo[] = orgs.map((org: { id: string; name: string }) => {
      const ownerId = ownerMap.get(org.id);
      return {
        id: org.id,
        name: org.name,
        owner_email: ownerId ? emailMap.get(ownerId) || null : null,
      };
    });

    setOrganizations(orgInfos);
  }, []);

  const createAnnouncement = useCallback(async (formData: AnnouncementFormData, _adminUserId: string | null) => {
    const token = getToken();
    if (!token) throw new Error('Admin token not found');

    const { error } = await supabase.rpc('admin_create_announcement', {
      p_token: token,
      p_title: formData.title,
      p_content: formData.content,
      p_gif_url: formData.gif_url || null,
      p_template_type: formData.template_type,
      p_target_type: formData.target_type,
      p_target_organization_id: formData.target_type === 'organization' ? formData.target_organization_id || null : null,
      p_scheduled_at: formData.scheduled_at || null,
    });

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  const updateAnnouncement = useCallback(async (id: string, formData: Partial<AnnouncementFormData>) => {
    const token = getToken();
    if (!token) throw new Error('Admin token not found');

    const params: Record<string, unknown> = {
      p_token: token,
      p_id: id,
      p_title: formData.title,
      p_content: formData.content,
      p_template_type: formData.template_type,
      p_target_type: formData.target_type,
      p_scheduled_at: formData.scheduled_at,
    };
    if (formData.gif_url !== undefined) params.p_gif_url = formData.gif_url || null;
    if (formData.target_type === 'global') {
      params.p_target_organization_id = null;
    } else if (formData.target_organization_id) {
      params.p_target_organization_id = formData.target_organization_id;
    }
    if (formData.is_active !== undefined) params.p_is_active = formData.is_active;

    const { error } = await supabase.rpc('admin_update_announcement', params);

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    const token = getToken();
    if (!token) throw new Error('Admin token not found');

    const { error } = await supabase.rpc('admin_update_announcement', {
      p_token: token,
      p_id: id,
      p_is_active: !isActive,
    });

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
