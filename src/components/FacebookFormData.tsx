import { Mail, Phone, User, MapPin, Building, Calendar, Hash, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FacebookFormDataProps {
  description: string | null;
}

interface FormField {
  name: string;
  value: string;
  icon?: React.ReactNode;
}

export const FacebookFormData = ({ description }: FacebookFormDataProps) => {
  if (!description) return null;

  // Parsear os dados do formulário da descrição
  const parseFormData = (): FormField[] => {
    const formDataSection = description.split('=== INFORMAÇÕES DO FORMULÁRIO ===')[1];
    if (!formDataSection) return [];

    const lines = formDataSection.trim().split('\n');
    const fields: FormField[] = [];

    lines.forEach(line => {
      const [name, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (name && value) {
        fields.push({
          name: name.trim(),
          value,
          icon: getFieldIcon(name.toLowerCase())
        });
      }
    });

    return fields;
  };

  // Determinar ícone baseado no nome do campo
  const getFieldIcon = (fieldName: string): React.ReactNode => {
    if (fieldName.includes('email')) {
      return <Mail className="h-4 w-4 text-blue-500" />;
    }
    if (fieldName.includes('phone') || fieldName.includes('telefone')) {
      return <Phone className="h-4 w-4 text-green-500" />;
    }
    if (fieldName.includes('name') || fieldName.includes('nome')) {
      return <User className="h-4 w-4 text-purple-500" />;
    }
    if (fieldName.includes('city') || fieldName.includes('cidade')) {
      return <MapPin className="h-4 w-4 text-red-500" />;
    }
    if (fieldName.includes('company') || fieldName.includes('empresa')) {
      return <Building className="h-4 w-4 text-orange-500" />;
    }
    if (fieldName.includes('date') || fieldName.includes('data')) {
      return <Calendar className="h-4 w-4 text-cyan-500" />;
    }
    if (fieldName.includes('id')) {
      return <Hash className="h-4 w-4 text-gray-500" />;
    }
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  const formFields = parseFormData();

  if (formFields.length === 0) return null;

  // Extrair informações do formulário e campanha (primeiras linhas da descrição)
  const formInfo = description.split('=== INFORMAÇÕES DO FORMULÁRIO ===')[0];
  const formIdMatch = formInfo.match(/Formulário: (\S+)/);
  const campaignMatch = formInfo.match(/Campanha: (.+)/);

  return (
    <div className="space-y-4">
      {/* Header com badge do Facebook */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <h3 className="font-semibold text-sm">Dados do Formulário Facebook</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          Lead Ads
        </Badge>
      </div>

      {/* Informações do formulário e campanha */}
      {(formIdMatch || campaignMatch) && (
        <Card className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <div className="space-y-1.5 text-xs">
            {formIdMatch && (
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                <span className="text-muted-foreground flex-shrink-0">Formulário:</span>
                <span className="font-medium break-words">{formIdMatch[1]}</span>
              </div>
            )}
            {campaignMatch && (
              <div className="flex items-center gap-2 flex-wrap">
                <Hash className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                <span className="text-muted-foreground flex-shrink-0">Campanha:</span>
                <span className="font-medium break-words">{campaignMatch[1]}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Grid de campos do formulário */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {formFields.map((field, index) => (
          <Card 
            key={index} 
            className="p-3 hover:shadow-md transition-shadow bg-card border-border"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                {field.icon}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground font-medium break-words">
                  {field.name}
                </p>
                <p className="text-sm font-semibold text-foreground break-words">
                  {field.value}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
