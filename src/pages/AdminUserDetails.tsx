import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, User, Building2, Shield, Users, Mail, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface UserDetails {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  organization_id: string | null;
  organization_name: string | null;
  user_role: string | null;
}

interface OrganizationMember {
  member_id: string;
  user_id: string | null;
  email: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

export default function AdminUserDetails() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadUserDetails();
    }
  }, [userId]);

  const loadUserDetails = async () => {
    setLoading(true);
    try {
      // Buscar detalhes do usuário
      const { data: userData, error: userError } = await supabase.rpc('get_user_details', {
        _target_user_id: userId
      });

      if (userError) throw userError;
      
      if (userData && userData.length > 0) {
        setUserDetails(userData[0]);

        // Se o usuário tem uma organização, buscar os membros
        if (userData[0].organization_id) {
          const { data: membersData, error: membersError } = await supabase.rpc('get_organization_members', {
            _organization_id: userData[0].organization_id
          });

          if (membersError) throw membersError;
          setMembers(membersData || []);
        }
      } else {
        toast.error("Usuário não encontrado");
        navigate("/admin");
      }
    } catch (error: any) {
      console.error('Erro ao carregar detalhes:', error);
      toast.error(`Erro ao carregar detalhes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userDetails) {
    return null;
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    const roleColors: Record<string, string> = {
      owner: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      admin: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      member: "bg-gray-500/10 text-gray-600 border-gray-500/20"
    };
    return roleColors[role] || roleColors.member;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Detalhes do Usuário</h1>
            <p className="text-muted-foreground">Informações completas da conta e colaboradores</p>
          </div>
        </div>

        {/* Informações do Usuário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Informações da Conta
            </CardTitle>
            <CardDescription>
              Dados cadastrados e status da conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={userDetails.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {getInitials(userDetails.full_name, userDetails.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <h3 className="text-xl font-semibold">
                  {userDetails.full_name || userDetails.email}
                </h3>
                {userDetails.job_title && (
                  <p className="text-muted-foreground">{userDetails.job_title}</p>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  {userDetails.email}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="w-4 h-4" />
                  Data de Cadastro
                </div>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(userDetails.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  Último Login
                </div>
                <p className="text-sm text-muted-foreground">
                  {userDetails.last_sign_in_at 
                    ? format(new Date(userDetails.last_sign_in_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                    : "Nunca fez login"}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="w-4 h-4" />
                  Status do E-mail
                </div>
                <div>
                  {userDetails.email_confirmed_at ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                      Confirmado em {format(new Date(userDetails.email_confirmed_at), "dd/MM/yyyy", { locale: ptBR })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                      Pendente de confirmação
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="w-4 h-4" />
                  Organização
                </div>
                <div>
                  {userDetails.organization_name ? (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">{userDetails.organization_name}</p>
                      {userDetails.user_role && (
                        <Badge variant="outline" className={getRoleBadge(userDetails.user_role)}>
                          {userDetails.user_role}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem organização</p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                <strong>Nota de Segurança:</strong> As senhas são criptografadas e não podem ser visualizadas por questões de segurança. 
                Se necessário, você pode resetar a senha do usuário através das ferramentas de administração.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Colaboradores da Organização */}
        {userDetails.organization_id && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Colaboradores Associados
              </CardTitle>
              <CardDescription>
                Todos os membros da organização "{userDetails.organization_name}"
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Membro desde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.member_id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {getInitials(member.full_name, member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {member.full_name || member.email.split('@')[0]}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleBadge(member.role)}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {member.user_id ? (
                            member.last_sign_in_at ? (
                              <Badge variant="default">Ativo</Badge>
                            ) : (
                              <Badge variant="secondary">Registrado</Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                              Convite Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.created_at ? (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(member.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum colaborador encontrado nesta organização</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
