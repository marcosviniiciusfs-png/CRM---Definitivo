import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export const FacebookSetupGuide = () => {
  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          Configuração do app do Facebook (administrador)
        </CardTitle>
        <CardDescription>
          Siga estes passos para permitir que todos os colaboradores da organização conectem suas contas do Facebook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-sm text-red-800 dark:text-red-200">
            <strong>Problema identificado:</strong> Se o app já está "Ativo/Público" mas outros usuários ainda veem "Recurso indisponível", 
            o problema é que as <strong>permissões avançadas (leads_retrieval) NÃO estão aprovadas pela Meta</strong>. 
            Apenas o administrador do app tem acesso automático. Siga os passos abaixo.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">1</span>
              Adicionar como funções do app (solução rápida, recomendada)
            </h3>
            <div className="ml-8 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Esta é a solução mais rápida para dar acesso imediato:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Acesse <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Facebook Developers Console <ExternalLink className="h-3 w-3" /></a></li>
                <li>Selecione seu App [CRM-KAIROZ] - 01</li>
                <li>Vá em <strong>Funções do app</strong> no menu lateral</li>
                <li>Adicione os usuários em uma destas funções:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li><strong>Administradores</strong> - Acesso total (recomendado para gerentes)</li>
                    <li><strong>Desenvolvedores</strong> - Para testar funcionalidades</li>
                    <li><strong>Testadores</strong> - Para usuários finais testarem</li>
                  </ul>
                </li>
                <li>Digite o nome do Facebook ou email dos usuários</li>
                <li>Os usuários receberão um convite e devem aceitar pelo Facebook</li>
                <li><strong className="text-green-600 dark:text-green-400">Pronto. Eles têm acesso imediato, sem precisar de App Review.</strong></li>
              </ol>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">2</span>
              App Review da Meta (Para Acesso Público Ilimitado)
            </h3>
            <div className="ml-8 space-y-2 text-sm text-muted-foreground">
              <p><strong className="text-amber-600 dark:text-amber-400">Importante:</strong> Tornar o app "Ativo/Público" não basta. As permissões especiais precisam de aprovação da Meta.</p>
              <p className="mt-2">Para permitir que <strong>qualquer usuário</strong> (não apenas funções do app) conecte:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>No Facebook Developers Console, vá em <strong>App Review {'>'} Permissions and Features</strong></li>
                <li>Localize e solicite aprovação para:
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">leads_retrieval</code> - <strong className="text-red-600 dark:text-red-400">ESSENCIAL</strong> (sem isso não funciona)</li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">pages_manage_ads</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">pages_show_list</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">pages_read_engagement</code></li>
                  </ul>
                </li>
                <li>Clique em <strong>"Request"</strong> ou <strong>"Solicitar"</strong> em cada permissão</li>
                <li>Preencha o questionário explicando:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Como você usa a permissão (gerenciamento de leads de clientes)</li>
                    <li>Faça um vídeo curto mostrando o fluxo de conexão</li>
                    <li>Forneça instruções de teste detalhadas</li>
                  </ul>
                </li>
                <li><strong>Aguarde aprovação da Meta</strong> (pode levar 3-7 dias úteis)</li>
                <li>Após aprovado, TODOS os usuários poderão conectar sem restrições</li>
              </ol>
              <p className="mt-3 text-xs bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-2 rounded">
                <strong>Dica:</strong> Enquanto aguarda aprovação, use a Opção 1 para dar acesso aos seus usuários principais como Administradores ou Desenvolvedores do app.
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Verificar status
            </h3>
            <div className="ml-7 space-y-2 text-sm text-muted-foreground">
              <p>Você saberá que está funcionando quando:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>No Facebook Developers, o status do App mostra <strong className="text-green-600 dark:text-green-400">"Ativo"</strong> ou <strong>"Online"</strong></li>
                <li>Outros colaboradores conseguem clicar em "Conectar Facebook" sem ver erros</li>
                <li>A tela de autorização do Facebook aparece normalmente</li>
              </ul>
            </div>
          </div>

          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Resumo das soluções:</strong><br/>
              • <strong>Opção 1:</strong> Rápida e funciona imediatamente - adicione usuários como funções do app (Administradores/Desenvolvedores)<br/>
              • <strong>Opção 2:</strong> Para acesso público ilimitado - requer App Review da Meta (demora dias)<br/>
              <br/>
              <strong>Recomendação:</strong> Use Opção 1 enquanto aguarda aprovação da Opção 2.
            </AlertDescription>
          </Alert>

          <div className="pt-2">
            <Button asChild variant="outline" className="gap-2">
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Abrir Facebook Developers Console
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};