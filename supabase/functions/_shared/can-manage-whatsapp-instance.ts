import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

/** Organization channels follow the same integration permission as the UI. */
export async function canManageWhatsAppInstance(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string,
  instance: { user_id: string; organization_id: string | null },
): Promise<boolean> {
  // Legacy personal instances have no organization membership to consult.
  if (!instance.organization_id) return instance.user_id === userId;

  const { data: members, error } = await supabase
    .from('organization_members')
    .select('role, custom_role_id, is_active')
    .eq('organization_id', instance.organization_id)
    .eq('user_id', userId);
  if (error) throw error;

  const activeMembers = (members ?? []).filter(member => member.is_active !== false);
  if (activeMembers.some(member => member.role === 'owner' || member.role === 'admin')) return true;

  const roleIds = activeMembers
    .filter(member => member.role === 'member' && member.custom_role_id)
    .map(member => member.custom_role_id);
  if (!roleIds.length) return false;

  const { data: roles, error: roleError } = await supabase
    .from('organization_custom_roles')
    .select('can_manage_integrations')
    .eq('organization_id', instance.organization_id)
    .in('id', roleIds);
  if (roleError) throw roleError;
  return (roles ?? []).some(role => role.can_manage_integrations === true);
}
