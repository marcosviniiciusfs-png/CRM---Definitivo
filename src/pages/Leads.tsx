import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Filter, Phone, Mail, Building } from "lucide-react";
import { Link } from "react-router-dom";

const leadsData = [
  {
    id: 1,
    name: "Carlos Silva",
    company: "Tech Solutions Ltda",
    email: "carlos@techsolutions.com",
    phone: "(11) 98765-4321",
    value: 45000,
    status: "new",
    lastContact: "2024-01-15",
  },
  {
    id: 2,
    name: "Ana Paula",
    company: "Inovação Digital",
    email: "ana@inovacao.com",
    phone: "(21) 97654-3210",
    value: 32000,
    status: "qualification",
    lastContact: "2024-01-14",
  },
  {
    id: 3,
    name: "João Santos",
    company: "Empresa X",
    email: "joao@empresax.com",
    phone: "(11) 96543-2109",
    value: 28000,
    status: "qualification",
    lastContact: "2024-01-10",
  },
  {
    id: 4,
    name: "Pedro Lima",
    company: "Global Corp",
    email: "pedro@globalcorp.com",
    phone: "(31) 95432-1098",
    value: 67000,
    status: "proposal",
    lastContact: "2024-01-08",
  },
];

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  new: { label: "Novo", variant: "default" },
  qualification: { label: "Qualificação", variant: "secondary" },
  proposal: { label: "Proposta", variant: "outline" },
};

const Leads = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Gerencie seus contatos e oportunidades</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Lead
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, empresa ou email..." className="pl-10" />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {leadsData.map((lead) => (
              <Link key={lead.id} to={`/leads/${lead.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">{lead.name}</h3>
                          <Badge variant={statusLabels[lead.status].variant}>
                            {statusLabels[lead.status].label}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Building className="h-4 w-4" />
                            <span>{lead.company}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            <span>{lead.email}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            <span>{lead.phone}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-xl font-bold text-primary">
                          R$ {(lead.value / 1000).toFixed(0)}k
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Último contato: {new Date(lead.lastContact).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Leads;
