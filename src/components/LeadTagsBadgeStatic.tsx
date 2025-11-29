import { Badge } from "@/components/ui/badge";
import { MessageCircle, Globe, FileText, Tag as TagIcon } from "lucide-react";
import { memo } from "react";

interface LeadTag {
  id: string;
  name: string;
  color: string;
}

interface LeadTagsBadgeStaticProps {
  tags: LeadTag[];
}

// Função para obter o ícone baseado no nome da tag
const getTagIcon = (tagName: string) => {
  const name = tagName.toLowerCase();
  
  if (name.includes('whatsapp')) {
    return MessageCircle;
  }
  if (name.includes('landing') || name.includes('site')) {
    return Globe;
  }
  if (name.includes('formulário') || name.includes('formulario') || name.includes('form')) {
    return FileText;
  }
  
  return TagIcon;
};

export const LeadTagsBadgeStatic = memo(({ tags }: LeadTagsBadgeStaticProps) => {
  if (tags.length === 0) return null;

  return (
    <div className="flex gap-1 items-center flex-wrap">
      {tags.slice(0, 5).map((tag) => {
        const IconComponent = getTagIcon(tag.name);
        
        return (
          <Badge 
            key={tag.id}
            variant="secondary" 
            className="w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5"
            style={{
              backgroundColor: `${tag.color}15`,
              color: tag.color,
              borderColor: `${tag.color}40`,
            }}
          >
            <IconComponent className="h-2.5 w-2.5" />
            {tag.name}
          </Badge>
        );
      })}
    </div>
  );
});

LeadTagsBadgeStatic.displayName = "LeadTagsBadgeStatic";
