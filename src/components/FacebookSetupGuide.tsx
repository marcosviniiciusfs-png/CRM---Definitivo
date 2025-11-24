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
          Configuração do App Facebook (Administrador)
        </CardTitle>
        <CardDescription>
          Siga estes passos para permitir que todos os usuários da organização possam conectar suas contas do Facebook
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Problema Comum:</strong> Outros usuários veem "Recurso indisponível" ao tentar conectar?
            Isso ocorre porque o App do Facebook está em modo de desenvolvimento.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">1</span>
              Adicionar Testadores (Solução Rápida)
            </h3>
            <div className="ml-8 space-y-2 text-sm text-muted-foreground">
              <p>Se você tem poucos usuários, adicione-os como testadores do app:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Acesse <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Facebook Developers Console <ExternalLink className="h-3 w-3" /></a></li>
                <li>Selecione seu App</li>
                <li>Vá em <strong>Funções {'>'} Testadores</strong></li>
                <li>Clique em <strong>"Adicionar Testadores"</strong></li>
                <li>Digite o nome ou email dos usuários</li>
                <li>Os usuários receberão um convite e devem aceitar</li>
              </ol>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">2</span>
              Tornar o App Público (Solução Definitiva)
            </h3>
            <div className="ml-8 space-y-2 text-sm text-muted-foreground">
              <p>Para permitir que qualquer usuário conecte sem limitações:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>No Facebook Developers Console, vá em <strong>Configurações {'>'} Básico</strong></li>
                <li>Preencha todos os campos obrigatórios:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>URL da Política de Privacidade</li>
                    <li>URL dos Termos de Serviço</li>
                    <li>Categoria do App</li>
                    <li>Ícone do App (1024x1024px)</li>
                  </ul>
                </li>
                <li>Vá em <strong>Permissões do App</strong></li>
                <li>Solicite aprovação para as permissões:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">leads_retrieval</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">pages_manage_ads</code></li>
                    <li><code className="text-xs bg-muted px-1 py-0.5 rounded">pages_show_list</code></li>
                  </ul>
                </li>
                <li>Preencha o questionário de revisão do Facebook</li>
                <li>Aguarde aprovação (pode levar alguns dias)</li>
                <li>Após aprovado, mude o App para <strong>Modo Online</strong> nas configurações</li>
              </ol>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Verificar Status
            </h3>
            <div className="ml-7 space-y-2 text-sm text-muted-foreground">
              <p>Você saberá que está funcionando quando:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>No Facebook Developers, o status do App mostra <strong className="text-green-600 dark:text-green-400">"Ativo"</strong> ou <strong>"Online"</strong></li>
                <li>Outros usuários conseguem clicar em "Conectar ao Facebook" sem ver erros</li>
                <li>A tela de autorização do Facebook aparece normalmente</li>
              </ul>
            </div>
          </div>

          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Dica:</strong> Para desenvolvimento, a opção 1 (adicionar testadores) é mais rápida. 
              Para produção com muitos usuários, use a opção 2 (app público).
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