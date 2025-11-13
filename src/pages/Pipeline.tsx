import { PipelineColumn } from "@/components/PipelineColumn";

const stages = [
  { 
    id: "new", 
    title: "Novo Lead", 
    color: "bg-blue-500",
    count: 13,
    leads: [
      { id: "1", name: "Marcos Vinicius", phone: "559499086403", date: "10/11/2025 22:35" },
      { id: "2", name: "Maria Alice", phone: "185065963262140", date: "10/11/2025 17:18" },
      { id: "3", name: "Kailany Freitas", phone: "5518991565068", date: "10/11/2025 16:38" },
      { id: "4", name: "5511951735490", phone: "5511951735490", date: "10/11/2025 16:24" },
      { id: "5", name: "Ingrid", phone: "559499086403", date: "10/11/2025 22:35" },
    ]
  },
  { 
    id: "attending", 
    title: "Em Atendimento", 
    color: "bg-yellow-500",
    count: 3,
    leads: [
      { id: "6", name: "Mateus Santos", phone: "559431992146", date: "10/11/2025 22:58" },
      { id: "7", name: "Gabriela Brito", phone: "559492865737", date: "10/11/2025 18:11" },
      { id: "8", name: "João Silva", phone: "+5511987654321", date: "05/11/2025 19:41" },
    ]
  },
  { 
    id: "closed", 
    title: "Fechado", 
    color: "bg-green-500",
    count: 1,
    leads: [
      { id: "9", name: "Pedro Costa", phone: "+5511965432109", date: "05/11/2025 18:46" },
    ]
  },
  { 
    id: "lost", 
    title: "Perdido", 
    color: "bg-red-500",
    count: 0,
    leads: []
  },
];

const Pipeline = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pipeline de Vendas</h1>
        <p className="text-muted-foreground mt-1">
          Arraste e solte os cards para mover leads entre as etapas do funil
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto">
        {stages.map((stage) => (
          <PipelineColumn
            key={stage.id}
            title={stage.title}
            count={stage.count}
            color={stage.color}
            leads={stage.leads}
            isEmpty={stage.count === 0}
          />
        ))}
      </div>
    </div>
  );
};

export default Pipeline;
