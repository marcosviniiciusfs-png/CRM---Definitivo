import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Política de Privacidade</h1>
          <p className="text-muted-foreground mb-8">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <div className="space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Introdução</h2>
              <p className="text-muted-foreground">
                Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais 
                quando você utiliza nossa plataforma de CRM. Valorizamos sua privacidade e estamos comprometidos em proteger seus dados pessoais.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. Informações que Coletamos</h2>
              <p className="text-muted-foreground mb-2">Coletamos as seguintes categorias de informações:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Informações de Conta:</strong> Nome, email, telefone e cargo profissional</li>
                <li><strong>Informações de Leads:</strong> Dados dos seus clientes e prospects, incluindo nome, telefone, email, empresa e histórico de interações</li>
                <li><strong>Mensagens:</strong> Conteúdo das conversas via WhatsApp integradas à plataforma</li>
                <li><strong>Informações de Uso:</strong> Dados sobre como você utiliza nossa plataforma, incluindo logs de acesso e atividades</li>
                <li><strong>Integrações:</strong> Tokens e dados de acesso de integrações com Facebook e WhatsApp</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. Como Usamos suas Informações</h2>
              <p className="text-muted-foreground mb-2">Utilizamos suas informações para:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Fornecer e manter os serviços da plataforma</li>
                <li>Gerenciar sua conta e autenticação</li>
                <li>Facilitar a comunicação com seus leads através do WhatsApp</li>
                <li>Processar e armazenar leads recebidos via Facebook Ads</li>
                <li>Melhorar nossos serviços e desenvolver novos recursos</li>
                <li>Enviar notificações importantes sobre a plataforma</li>
                <li>Garantir a segurança e prevenir fraudes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Compartilhamento de Informações</h2>
              <p className="text-muted-foreground mb-2">
                Não vendemos suas informações pessoais. Compartilhamos suas informações apenas nas seguintes situações:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Com sua Organização:</strong> Membros da sua organização podem acessar dados compartilhados</li>
                <li><strong>Provedores de Serviço:</strong> Compartilhamos com provedores que nos ajudam a operar a plataforma (hospedagem, banco de dados)</li>
                <li><strong>Integrações Autorizadas:</strong> Facebook e WhatsApp, conforme você autorize</li>
                <li><strong>Requisitos Legais:</strong> Quando exigido por lei ou para proteger direitos legais</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Segurança dos Dados</h2>
              <p className="text-muted-foreground">
                Implementamos medidas de segurança técnicas e organizacionais apropriadas para proteger suas informações pessoais contra 
                acesso não autorizado, alteração, divulgação ou destruição. Isso inclui criptografia, controles de acesso e auditorias regulares.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. Retenção de Dados</h2>
              <p className="text-muted-foreground">
                Mantemos suas informações pessoais pelo tempo necessário para cumprir os propósitos descritos nesta política, 
                a menos que um período de retenção mais longo seja exigido ou permitido por lei.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Seus Direitos</h2>
              <p className="text-muted-foreground mb-2">Você tem os seguintes direitos em relação aos seus dados pessoais:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Acesso:</strong> Solicitar uma cópia dos seus dados pessoais</li>
                <li><strong>Correção:</strong> Corrigir dados imprecisos ou incompletos</li>
                <li><strong>Exclusão:</strong> Solicitar a exclusão dos seus dados pessoais</li>
                <li><strong>Portabilidade:</strong> Receber seus dados em formato estruturado</li>
                <li><strong>Revogação:</strong> Revogar consentimentos previamente dados</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Cookies e Tecnologias Similares</h2>
              <p className="text-muted-foreground">
                Utilizamos cookies e tecnologias similares para melhorar sua experiência, analisar o uso da plataforma e 
                manter sua sessão ativa. Você pode gerenciar suas preferências de cookies através das configurações do navegador.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Alterações nesta Política</h2>
              <p className="text-muted-foreground">
                Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos você sobre mudanças significativas 
                através da plataforma ou por email. Recomendamos revisar esta política regularmente.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Contato</h2>
              <p className="text-muted-foreground">
                Se você tiver dúvidas sobre esta Política de Privacidade ou sobre como tratamos seus dados pessoais, 
                entre em contato conosco através das configurações da plataforma ou pelo email de suporte.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;