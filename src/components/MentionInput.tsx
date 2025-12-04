import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { LazyAvatar } from "@/components/ui/lazy-avatar";
import { supabase } from "@/integrations/supabase/client";

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const MentionInput = ({ value, onChange, placeholder }: MentionInputProps) => {
  const [showMentions, setShowMentions] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data: orgMembers } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", (await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", session.session.user.id)
          .single()).data?.organization_id || "");

      if (!orgMembers) return;

      const userIds = orgMembers.map(m => m.user_id).filter(Boolean);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("user_id", userIds);

      if (data && !error) {
        setUsers(data as UserProfile[]);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const lastAtIndex = value.lastIndexOf("@", cursorPosition);
    if (lastAtIndex !== -1 && lastAtIndex < cursorPosition) {
      const search = value.substring(lastAtIndex + 1, cursorPosition);
      if (!search.includes(" ")) {
        setMentionSearch(search);
        setShowMentions(true);
        setFilteredUsers(
          users.filter((u) =>
            u.full_name.toLowerCase().includes(search.toLowerCase())
          )
        );
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  }, [value, cursorPosition, users]);

  const insertMention = (user: UserProfile) => {
    const lastAtIndex = value.lastIndexOf("@", cursorPosition);
    const beforeMention = value.substring(0, lastAtIndex);
    const afterMention = value.substring(cursorPosition);
    const newValue = `${beforeMention}@${user.full_name} ${afterMention}`;
    onChange(newValue);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCursorPosition(e.target.selectionStart);
        }}
        onSelect={(e: any) => setCursorPosition(e.target.selectionStart)}
        placeholder={placeholder}
        className="min-h-[80px]"
      />
      {showMentions && filteredUsers.length > 0 && (
        <div className="absolute z-50 w-64 bg-popover border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => insertMention(user)}
              className="w-full flex items-center gap-2 p-2 hover:bg-accent transition-colors text-left"
            >
              <LazyAvatar
                src={user.avatar_url}
                name={user.full_name}
                size="xs"
                className="h-6 w-6"
              />
              <span className="text-sm">{user.full_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
