import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, Plus, Clock, Users, MapPin, Search } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";

interface Reuniao {
  id: string;
  titulo: string;
  data: string;
  horario: string;
  participantes: string[];
  local: string;
  descricao: string;
}

const ReunioesView: React.FC = () => {
  const { organizationId } = useOrganization();
  const [reunioes] = useState<Reuniao[]>([]);
  const [search, setSearch] = useState("");

  const reunioesFiltradas = reunioes.filter((r) =>
    r.titulo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-secondary/40 dark:bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="h-7 w-7" />
              Reuniões
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie e acompanhe suas reuniões
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Reunião
          </Button>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar reuniões..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Lista de reuniões */}
        {reunioesFiltradas.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Nenhuma reunião agendada
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Clique em "Nova Reunião" para agendar sua primeira reunião.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {reunioesFiltradas.map((reuniao) => (
              <Card key={reuniao.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{reuniao.titulo}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" />
                      {reuniao.data}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {reuniao.horario}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {reuniao.participantes.length} participantes
                    </span>
                    {reuniao.local && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {reuniao.local}
                      </span>
                    )}
                  </div>
                  {reuniao.descricao && (
                    <p className="mt-3 text-sm text-muted-foreground">{reuniao.descricao}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReunioesView;
