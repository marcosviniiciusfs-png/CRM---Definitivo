import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCircle, UserPlus, UserMinus, UserX, Users, Search } from "lucide-react";

const mockColaboradores = [
  {
    id: "1",
    nome: "Gerente Imperio",
    email: "representanteimperiop@gmail.com",
    avatar: "",
    cargo: "Gerente",
    permissoes: ["adm.geral"],
    criacao: "27/08/2025"
  },
  {
    id: "2",
    nome: "Luigy Frota",
    email: "luigy.frota@gmail.com",
    avatar: "",
    cargo: "Supervisor",
    permissoes: ["time.venda", "equipe.lider"],
    criacao: "27/08/2025"
  },
  {
    id: "3",
    nome: "Samara Silva",
    email: "samara664silva@gmail.com",
    avatar: "",
    cargo: "Vendedor",
    permissoes: ["time.venda"],
    criacao: "27/08/2025"
  },
  {
    id: "4",
    nome: "Beatriz Carvalho",
    email: "beatrizcmultimarcas@gmail.com",
    avatar: "",
    cargo: "Supervisor",
    permissoes: ["time.venda", "equipe.criacao", "equipe.lider", "ranking.editor"],
    criacao: "27/08/2025"
  },
  {
    id: "5",
    nome: "Levi Felipe",
    email: "levifelipe2344@icloud.com",
    avatar: "",
    cargo: "Vendedor",
    permissoes: ["time.venda"],
    criacao: "27/08/2025"
  },
  {
    id: "6",
    nome: "Raila Oliveira",
    email: "raylaoliveira644@gmail.com",
    avatar: "",
    cargo: "Vendedor",
    permissoes: ["time.venda"],
    criacao: "27/08/2025"
  }
];

const Colaboradores = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState("20");

  const filteredColaboradores = mockColaboradores.filter((colab) =>
    colab.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    colab.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCargoColor = (cargo: string) => {
    switch (cargo) {
      case "Gerente": return "bg-blue-100 text-blue-700 hover:bg-blue-100";
      case "Supervisor": return "bg-purple-100 text-purple-700 hover:bg-purple-100";
      case "Vendedor": return "bg-green-100 text-green-700 hover:bg-green-100";
      default: return "bg-gray-100 text-gray-700 hover:bg-gray-100";
    }
  };

  const getPermissaoColor = (permissao: string) => {
    if (permissao.includes("adm")) return "bg-pink-100 text-pink-700 hover:bg-pink-100";
    if (permissao.includes("time")) return "bg-purple-100 text-purple-700 hover:bg-purple-100";
    if (permissao.includes("equipe")) return "bg-blue-100 text-blue-700 hover:bg-blue-100";
    if (permissao.includes("ranking")) return "bg-orange-100 text-orange-700 hover:bg-orange-100";
    return "bg-gray-100 text-gray-700 hover:bg-gray-100";
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Gestão de Colaboradores</h1>
              <p className="text-gray-600 mt-1">Gerencie e acompanhe todos os colaboradores ativos</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              Novo Colaborador
            </Button>
            <Button variant="secondary" className="bg-purple-600 hover:bg-purple-700 text-white">
              Lote de Colaboradores
            </Button>
            <Button variant="secondary" className="bg-gray-600 hover:bg-gray-700 text-white">
              Ver Inativos
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-l-4 border-l-green-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Colaboradores Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">15</p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <UserCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Entraram este Mês</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">3</p>
                  <p className="text-xs text-blue-600 mt-1">Novos colaboradores</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <UserPlus className="h-8 w-8 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Saíram este Mês</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
                  <p className="text-xs text-yellow-600 mt-1">Desligamentos</p>
                </div>
                <div className="bg-yellow-100 p-3 rounded-full">
                  <UserMinus className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Inativos</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
                </div>
                <div className="bg-red-100 p-3 rounded-full">
                  <UserX className="h-8 w-8 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table Card */}
        <Card className="shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-6">
              <Users className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Lista de Colaboradores (Ativos)</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">Gerencie colaboradores ativos, cargos e permissões.</p>

            {/* Controls */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-gray-600">itens por página</span>
                </div>
                <span className="text-sm text-gray-600">{filteredColaboradores.length} registros disponíveis</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">INFO</TableHead>
                    <TableHead className="font-semibold">CARGO</TableHead>
                    <TableHead className="font-semibold">PERMISSÕES</TableHead>
                    <TableHead className="font-semibold">CRIAÇÃO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredColaboradores.map((colab) => (
                    <TableRow key={colab.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={colab.avatar} />
                            <AvatarFallback className="bg-gradient-to-br from-purple-400 to-blue-500 text-white">
                              {colab.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-gray-900">{colab.nome}</p>
                            <p className="text-sm text-gray-500">{colab.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getCargoColor(colab.cargo)}>
                          {colab.cargo}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {colab.permissoes.map((perm, idx) => (
                            <Badge key={idx} variant="secondary" className={getPermissaoColor(perm)}>
                              {perm}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">{colab.criacao}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Colaboradores;
