import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar, User } from "lucide-react";

const stages = [
  { id: "new", title: "Novo Lead", color: "bg-blue-500" },
  { id: "qualification", title: "Qualificação", color: "bg-yellow-500" },
  { id: "proposal", title: "Proposta", color: "bg-orange-500" },
  { id: "negotiation", title: "Negociação", color: "bg-purple-500" },
  { id: "closed", title: "Fechado", color: "bg-success" },
];

const leads = {
  new: [
    { id: 1, client: "Tech Solutions Ltda", value: 45000, contact: "Carlos Silva", date: "2024-01-15" },
    { id: 2, client: "Inovação Digital", value: 32000, contact: "Ana Paula", date: "2024-01-14" },
  ],
  qualification: [
    { id: 3, client: "Empresa X", value: 28000, contact: "João Santos", date: "2024-01-10" },
    { id: 4, client: "StartUp Y", value: 15000, contact: "Maria Costa", date: "2024-01-12" },
  ],
  proposal: [
    { id: 5, client: "Global Corp", value: 67000, contact: "Pedro Lima", date: "2024-01-08" },
  ],
  negotiation: [
    { id: 6, client: "Mega Empresa", value: 89000, contact: "Julia Rocha", date: "2024-01-05" },
  ],
  closed: [
    { id: 7, client: "Success Inc", value: 54000, contact: "Ricardo Alves", date: "2024-01-03" },
  ],
};

const Pipeline = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline de Vendas</h1>
          <p className="text-muted-foreground">Arraste os cards para atualizar o status</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm">
            Total: R$ 330k
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stages.map((stage) => (
          <div key={stage.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${stage.color}`} />
              <h3 className="font-semibold text-sm">{stage.title}</h3>
              <Badge variant="secondary" className="ml-auto text-xs">
                {leads[stage.id as keyof typeof leads].length}
              </Badge>
            </div>
            
            <div className="space-y-3">
              {leads[stage.id as keyof typeof leads].map((lead) => (
                <Card key={lead.id} className="cursor-move hover:shadow-lg transition-shadow">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium">{lead.client}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <DollarSign className="h-3 w-3" />
                      <span className="font-semibold text-primary">
                        R$ {(lead.value / 1000).toFixed(0)}k
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{lead.contact}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(lead.date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Pipeline;
