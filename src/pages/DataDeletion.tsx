import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const DataDeletion = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-6">Instruções para Exclusão de Dados</h1>
          
          <p className="text-lg text-muted-foreground mb-8">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Como solicitar a exclusão dos seus dados</h2>
            <p className="mb-4">
              Nós respeitamos seu direito à privacidade e facilitamos o processo de exclusão dos seus dados pessoais 
              coletados através da nossa integração com o Facebook Lead Ads.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Dados que coletamos do Facebook</h2>
            <p className="mb-4">Através da integração com Facebook Lead Ads, podemos coletar:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Nome completo</li>
              <li>Endereço de e-mail</li>
              <li>Número de telefone</li>
              <li>Informações fornecidas em formulários de leads</li>
              <li>Data e hora de submissão do formulário</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Métodos para solicitar exclusão</h2>
            
            <div className="bg-muted/50 p-6 rounded-lg mb-4">
              <h3 className="text-xl font-semibold mb-3">Opção 1: Através da sua conta</h3>
              <p className="mb-2">Se você é um usuário registrado:</p>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Faça login na sua conta</li>
                <li>Acesse as Configurações</li>
                <li>Na seção "Privacidade e Dados", clique em "Solicitar exclusão de dados"</li>
                <li>Confirme sua solicitação</li>
              </ol>
            </div>

            <div className="bg-muted/50 p-6 rounded-lg mb-4">
              <h3 className="text-xl font-semibold mb-3">Opção 2: Por e-mail</h3>
              <p className="mb-2">Envie um e-mail para:</p>
              <p className="font-semibold mb-2">contato@kairoz.com.br</p>
              <p className="mb-2">Com o assunto: "Solicitação de Exclusão de Dados - Facebook Lead Ads"</p>
              <p className="mb-2">Incluindo as seguintes informações:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Seu nome completo</li>
                <li>Endereço de e-mail usado no formulário do Facebook</li>
                <li>Data aproximada em que preencheu o formulário (se souber)</li>
                <li>Confirmação de que deseja excluir todos os seus dados</li>
              </ul>
            </div>

            <div className="bg-muted/50 p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Opção 3: Através do Facebook</h3>
              <p className="mb-2">
                Você também pode gerenciar suas informações diretamente através das configurações 
                de privacidade do Facebook:
              </p>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Acesse suas Configurações do Facebook</li>
                <li>Vá para "Apps e Sites"</li>
                <li>Localize nossa aplicação</li>
                <li>Clique em "Remover" para revogar o acesso e solicitar exclusão</li>
              </ol>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Prazo para exclusão</h2>
            <p className="mb-4">
              Após recebermos sua solicitação, processaremos a exclusão dos seus dados em até 30 dias úteis. 
              Durante este período:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Seus dados serão marcados para exclusão e não serão mais utilizados</li>
              <li>Você receberá uma confirmação por e-mail quando o processo for iniciado</li>
              <li>Você receberá uma confirmação final quando a exclusão for concluída</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">O que será excluído</h2>
            <p className="mb-4">A exclusão de dados incluirá:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Todas as informações pessoais fornecidas nos formulários</li>
              <li>Histórico de interações relacionadas ao seu lead</li>
              <li>Dados de contato (e-mail, telefone)</li>
              <li>Registros de atividades associadas ao seu perfil</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Retenção legal</h2>
            <p className="mb-4">
              Em alguns casos, podemos ser obrigados por lei a reter certos dados por um período específico 
              (por exemplo, dados fiscais ou registros de transações). Nestes casos:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Manteremos apenas as informações mínimas necessárias</li>
              <li>Os dados serão mantidos em um sistema seguro e isolado</li>
              <li>Você será informado sobre quais dados precisam ser retidos e por quanto tempo</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Verificação de identidade</h2>
            <p className="mb-4">
              Para proteger sua privacidade, poderemos solicitar informações adicionais para verificar 
              sua identidade antes de processar a solicitação de exclusão. Isso pode incluir:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Confirmação do endereço de e-mail</li>
              <li>Responder a perguntas de segurança</li>
              <li>Fornecer informações que apenas você teria acesso</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Consequências da exclusão</h2>
            <p className="mb-4">Após a exclusão dos seus dados:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Não poderemos mais entrar em contato com você sobre produtos ou serviços</li>
              <li>Você não receberá mais comunicações relacionadas ao seu lead</li>
              <li>Não será possível recuperar os dados excluídos</li>
              <li>Se você preencher um novo formulário no futuro, será tratado como um novo lead</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Dúvidas e suporte</h2>
            <p className="mb-4">
              Se você tiver dúvidas sobre o processo de exclusão de dados ou precisar de assistência, 
              entre em contato conosco:
            </p>
            <div className="bg-muted/50 p-6 rounded-lg">
              <p className="mb-2">
                <strong>E-mail:</strong> contato@kairoz.com.br
              </p>
              <p className="mb-2">
                <strong>Assunto:</strong> Dúvidas sobre Exclusão de Dados
              </p>
              <p>
                <strong>Tempo de resposta:</strong> Até 48 horas úteis
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Seus direitos</h2>
            <p className="mb-4">
              De acordo com a Lei Geral de Proteção de Dados (LGPD) e outras regulamentações aplicáveis, 
              você tem direito a:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Confirmar a existência de tratamento dos seus dados</li>
              <li>Acessar os seus dados</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
              <li>Solicitar a anonimização, bloqueio ou eliminação de dados</li>
              <li>Solicitar a portabilidade dos dados</li>
              <li>Revogar o consentimento</li>
            </ul>
          </section>

          <div className="bg-primary/10 border-l-4 border-primary p-6 rounded-lg mt-8">
            <p className="font-semibold mb-2">Atenção:</p>
            <p>
              Este processo é irreversível. Certifique-se de que realmente deseja excluir todos os seus dados 
              antes de fazer a solicitação. Se você tiver dúvidas, entre em contato conosco primeiro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataDeletion;
