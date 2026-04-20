import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Announcement, AnnouncementFormData } from '@/types/announcements';

export interface OrganizationInfo {
  id: string;
  name: string;
  owner_email: string | null;
}

export function useAdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([]);
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
      // Deduplicate by id in case join returns duplicates
      const seen = new Set<string>();
      const unique = (data || []).filter((a: Announcement) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      setAnnouncements(unique);
    }
    setLoading(false);
  }, []);

  const fetchOrganizations = useCallback(async () => {
    // Fetch organizations with their owner's email via join
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .order('name');

    if (orgError || !orgs) return;

    // Fetch owner members for each org
    const { data: owners, error: ownerError } = await supabase
      .from('organization_members')
      .select('organization_id, user_id, profiles!inner(user_id)')
      .eq('role', 'owner');

    // Get user emails via auth - use the owner user_ids to fetch from profiles
    // Since we can't directly query auth.users, we use the admin RPC
    const ownerMap = new Map<string, string>();
    if (owners) {
      for (const o of owners as { organization_id: string; user_id: string }[]) {
        ownerMap.set(o.organization_id, o.user_id);
      }
    }

    // Try to get emails via profiles + auth users metadata
    const ownerIds = Array.from(new Set(ownerMap.values()));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, user_id, full_name')
      .in('user_id', ownerIds);

    const profileMap = new Map<string, string>();
    if (profiles) {
      for (const p of profiles as { user_id: string; full_name: string | null }[]) {
        profileMap.set(p.user_id, p.full_name || '');
      }
    }

    const orgInfos: OrganizationInfo[] = orgs.map((org: { id: string; name: string }) => {
      const ownerId = ownerMap.get(org.id);
      return {
        id: org.id,
        name: org.name,
        owner_email: ownerId ? profileMap.get(ownerId) || null : null,
      };
    });

    setOrganizations(orgInfos);
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
