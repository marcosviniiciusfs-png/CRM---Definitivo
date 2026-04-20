import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Announcement } from '@/types/announcements';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

export function useAnnouncements() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, gif_url, template_type, target_type, target_organization_id, is_active, scheduled_at, created_at')
      .eq('is_active', true)
      .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching announcements:', error);
      setLoading(false);
      return;
    }

    const filtered = (data || []).filter((a: Announcement) => {
      if (a.target_type === 'global') return true;
      if (a.target_organization_id === organizationId) return true;
      return false;
    });

    if (filtered.length > 0) {
      const ids = filtered.map((a: Announcement) => a.id);
      const { data: dismissals } = await supabase
        .from('announcement_dismissals')
        .select('announcement_id')
        .eq('user_id', user.id)
        .in('announcement_id', ids);

      const dismissedIds = new Set((dismissals || []).map((d: { announcement_id: string }) => d.announcement_id));
      const active = filtered.filter((a: Announcement) => !dismissedIds.has(a.id));
      setAnnouncements(active);
    } else {
      setAnnouncements([]);
    }

    setLoading(false);
  }, [user, organizationId]);

  const dismissAnnouncement = useCallback(async (announcementId: string, permanent: boolean = true) => {
    if (!user) return;

    // Always remove from current session
    setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
    setCurrentIndex(0);

    // Only persist dismissal if user checked "don't show again"
    if (permanent) {
      const { error } = await supabase
        .from('announcement_dismissals')
        .insert({
          announcement_id: announcementId,
          user_id: user.id,
        });

      if (error) {
        console.error('Error dismissing announcement:', error);
      }
    }
  }, [user]);

  // Fetch on mount and when user/org changes
  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Realtime subscription for new announcements
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('announcements-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'announcements',
        },
        () => {
          fetchAnnouncements();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'announcements',
        },
        () => {
          fetchAnnouncements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAnnouncements]);

  const currentAnnouncement = announcements[currentIndex] || null;

  return {
    currentAnnouncement,
    hasNext: currentIndex < announcements.length - 1,
    loading,
    dismissAnnouncement,
    fetchAnnouncements,
  };
}
