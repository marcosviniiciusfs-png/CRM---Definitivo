import { useState } from "react";
import { Check, X, User, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/image-utils";

export interface UserOption {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface MultiSelectUsersProps {
  value: string[];
  onChange: (value: string[]) => void;
  users: UserOption[];
  placeholder?: string;
  disabled?: boolean;
}

export const MultiSelectUsers = ({
  value,
  onChange,
  users,
  placeholder = "Selecionar responsáveis...",
  disabled = false,
}: MultiSelectUsersProps) => {
  const [open, setOpen] = useState(false);

  const selectedUsers = users.filter((u) => value.includes(u.user_id));

  const toggleUser = (userId: string) => {
    if (value.includes(userId)) {
      onChange(value.filter((id) => id !== userId));
    } else {
      onChange([...value, userId]);
    }
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((id) => id !== userId));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between min-h-[40px] h-auto",
            selectedUsers.length === 0 && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1.5 flex-1">
            {selectedUsers.length === 0 ? (
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {placeholder}
              </span>
            ) : (
              selectedUsers.map((user) => (
                <Badge
                  key={user.user_id}
                  variant="secondary"
                  className="flex items-center gap-1.5 pr-1"
                >
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                      {getInitials(user.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[100px] truncate text-xs">
                    {user.full_name || "Sem nome"}
                  </span>
                  <button
                    onClick={(e) => removeUser(user.user_id, e)}
                    className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar membro..." />
          <CommandList>
            <CommandEmpty>Nenhum membro encontrado.</CommandEmpty>
            <CommandGroup>
              {users.map((user) => {
                const isSelected = value.includes(user.user_id);
                return (
                  <CommandItem
                    key={user.user_id}
                    value={user.full_name || user.user_id}
                    onSelect={() => toggleUser(user.user_id)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/50"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <Avatar className="h-6 w-6 mr-2">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px] bg-muted">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{user.full_name || "Sem nome"}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
