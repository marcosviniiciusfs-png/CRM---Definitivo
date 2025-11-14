import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, User, UserX, Crown, Search, ExternalLink, MoreVertical, Trash2 } from "lucide-react";

const mockSemEquipe = [
  { id: "1", nome: "Clara Regina", avatar: "" },
  { id: "2", nome: "Erisan Sousa", avatar: "" },
  { id: "3", nome: "Levi Felipe", avatar: "" },
  { id: "4", nome: "Vanessa maia", avatar: "" },
  { id: "5", nome: "Kauã Martins", avatar: "" },
  { id: "6", nome: "Beatriz Carvalho", avatar: "" },
  { id: "7", nome: "João Silva", avatar: "" },
];

const mockEquipes = [
  {
    id: "1",
    nome: "Laion",
    lider: { id: "l1", nome: "Jonh lenon", avatar: "" },
    membros: [
      { id: "m1", nome: "Arthur", avatar: "" },
      { id: "m2", nome: "Luigy Frota", avatar: "", isLider: true },
      { id: "m3", nome: "Márcia Eduarda", avatar: "" },
      { id: "m4", nome: "Raila Oliveira", avatar: "" },
      { id: "m5", nome: "David bastos", avatar: "" },
    ]
  }
];

const Equipes = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"board" | "cards">("board");

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Equipes</h1>
            <p className="text-gray-600 mt-1">Organize e gerencie suas equipes de vendas</p>
          </div>
          <Button className="bg-purple-600 hover:bg-purple-700 text-white">
            + Nova Equipe
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total de Equipes</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">1</p>
                </div>
                <div className="bg-blue-500 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total de Membros</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">5</p>
                </div>
                <div className="bg-green-500 p-3 rounded-lg">
                  <User className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Sem Equipe</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">7</p>
                </div>
                <div className="bg-orange-500 p-3 rounded-lg">
                  <UserX className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Líderes Disponíveis</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
                </div>
                <div className="bg-purple-500 p-3 rounded-lg">
                  <Crown className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar equipes ou líderes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "board" ? "default" : "outline"}
              onClick={() => setViewMode("board")}
              className={viewMode === "board" ? "bg-purple-600 hover:bg-purple-700" : ""}
            >
              Board
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              onClick={() => setViewMode("cards")}
              className={viewMode === "cards" ? "bg-purple-600 hover:bg-purple-700" : ""}
            >
              Cards
            </Button>
          </div>
        </div>

        {/* Board View */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sem Equipe Column */}
          <Card className="shadow-sm border-t-4 border-t-orange-500">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <UserX className="h-5 w-5 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold text-orange-600">Sem Equipe</h3>
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600">Membros</span>
                <span className="text-sm font-semibold text-gray-900">{mockSemEquipe.length}</span>
              </div>

              <div className="space-y-2">
                {mockSemEquipe.slice(0, 6).map((membro) => (
                  <div
                    key={membro.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={membro.avatar} />
                        <AvatarFallback className="bg-gradient-to-br from-gray-400 to-gray-500 text-white text-xs">
                          {membro.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-gray-700">{membro.nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {membro.id === "6" && (
                        <Trash2 className="h-4 w-4 text-red-500 cursor-pointer" />
                      )}
                      <ExternalLink className="h-4 w-4 text-blue-500 cursor-pointer" />
                    </div>
                  </div>
                ))}
                {mockSemEquipe.length > 6 && (
                  <div className="text-sm text-gray-500 text-center py-2">
                    +{mockSemEquipe.length - 6} mais
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Team Column */}
          {mockEquipes.map((equipe) => (
            <Card key={equipe.id} className="shadow-sm border-t-4 border-t-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-blue-600">{equipe.nome}</h3>
                  </div>
                  <MoreVertical className="h-5 w-5 text-gray-400 cursor-pointer" />
                </div>

                {/* Líder */}
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={equipe.lider.avatar} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white text-xs">
                          {equipe.lider.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-gray-700">{equipe.lider.nome}</span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-blue-500 cursor-pointer" />
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-600">Membros</span>
                  <span className="text-sm font-semibold text-gray-900">{equipe.membros.length}</span>
                </div>

                <div className="space-y-2">
                  {equipe.membros.map((membro) => (
                    <div
                      key={membro.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={membro.avatar} />
                          <AvatarFallback className="bg-gradient-to-br from-purple-400 to-blue-500 text-white text-xs">
                            {membro.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-gray-700">{membro.nome}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {membro.isLider && (
                          <Crown className="h-4 w-4 text-yellow-500" />
                        )}
                        <ExternalLink className="h-4 w-4 text-blue-500 cursor-pointer" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Equipes;
