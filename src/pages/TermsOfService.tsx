import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const TermsOfService = () => {
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
          <h1 className="text-4xl font-bold mb-2">Termos de Serviço</h1>
          <p className="text-muted-foreground mb-8">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <div className="space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Aceitação dos Termos</h2>
              <p className="text-muted-foreground">
                Ao acessar e usar esta plataforma de CRM, você concorda em estar vinculado a estes Termos de Serviço 
                e a todas as leis e regulamentos aplicáveis. Se você não concordar com algum destes termos, 
                está proibido de usar ou acessar este serviço.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. Descrição do Serviço</h2>
              <p className="text-muted-foreground mb-2">
                Nossa plataforma oferece um sistema de gestão de relacionamento com clientes (CRM) que inclui:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Gestão de leads e pipeline de vendas</li>
                <li>Integração com WhatsApp para comunicação com clientes</li>
                <li>Integração com Facebook Ads para captura de leads</li>
                <li>Sistema de chat e mensagens</li>
                <li>Gestão de equipes e colaboradores</li>
                <li>Relatórios e análises de produtividade</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. Conta de Usuário</h2>
              <h3 className="text-xl font-semibold mb-2 mt-4">3.1 Registro</h3>
              <p className="text-muted-foreground">
                Para usar a plataforma, você deve criar uma conta fornecendo informações precisas e completas. 
                Você é responsável por manter a confidencialidade de suas credenciais de acesso.
              </p>
              
              <h3 className="text-xl font-semibold mb-2 mt-4">3.2 Responsabilidade da Conta</h3>
              <p className="text-muted-foreground">
                Você é responsável por todas as atividades que ocorrem sob sua conta. Notifique-nos imediatamente 
                sobre qualquer uso não autorizado de sua conta.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Uso Aceitável</h2>
              <p className="text-muted-foreground mb-2">Você concorda em NÃO:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Usar a plataforma para qualquer finalidade ilegal ou não autorizada</li>
                <li>Violar quaisquer leis locais, estaduais, nacionais ou internacionais</li>
                <li>Enviar spam ou mensagens não solicitadas através da integração com WhatsApp</li>
                <li>Tentar obter acesso não autorizado a sistemas ou redes</li>
                <li>Interferir ou interromper o serviço ou servidores</li>
                <li>Usar a plataforma para coletar dados de outros usuários sem consentimento</li>
                <li>Compartilhar sua conta com terceiros não autorizados</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Integrações de Terceiros</h2>
              <p className="text-muted-foreground">
                A plataforma integra-se com serviços de terceiros (Facebook, WhatsApp). Você é responsável por 
                cumprir os termos de serviço desses terceiros. Não somos responsáveis por mudanças, interrupções 
                ou problemas causados por esses serviços externos.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. Propriedade Intelectual</h2>
              <p className="text-muted-foreground">
                A plataforma e seu conteúdo original, recursos e funcionalidades são de nossa propriedade exclusiva 
                e estão protegidos por leis de direitos autorais, marcas registradas e outras leis de propriedade intelectual.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Seus Dados</h2>
              <p className="text-muted-foreground">
                Você mantém todos os direitos sobre os dados que carrega na plataforma. Ao usar o serviço, 
                você nos concede uma licença limitada para armazenar, processar e exibir seus dados conforme 
                necessário para fornecer o serviço. Consulte nossa Política de Privacidade para mais detalhes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Pagamentos e Cobrança</h2>
              <p className="text-muted-foreground">
                Alguns recursos da plataforma podem ser oferecidos mediante pagamento. Ao assinar um plano pago, 
                você concorda em pagar todas as taxas associadas. Os pagamentos são processados de forma segura 
                através de processadores de pagamento terceirizados.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Suspensão e Encerramento</h2>
              <p className="text-muted-foreground">
                Reservamo-nos o direito de suspender ou encerrar sua conta imediatamente, sem aviso prévio, 
                se você violar estes Termos de Serviço ou por qualquer outro motivo, a nosso exclusivo critério. 
                Você pode encerrar sua conta a qualquer momento através das configurações da plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Isenção de Garantias</h2>
              <p className="text-muted-foreground">
                O serviço é fornecido "como está" e "conforme disponível", sem garantias de qualquer tipo, 
                expressas ou implícitas. Não garantimos que o serviço será ininterrupto, seguro ou livre de erros.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">11. Limitação de Responsabilidade</h2>
              <p className="text-muted-foreground">
                Em nenhuma circunstância seremos responsáveis por quaisquer danos indiretos, incidentais, especiais, 
                consequenciais ou punitivos, incluindo perda de lucros, dados ou uso, decorrentes do uso ou 
                incapacidade de usar o serviço.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">12. Modificações dos Termos</h2>
              <p className="text-muted-foreground">
                Reservamo-nos o direito de modificar ou substituir estes Termos a qualquer momento. 
                Notificaremos você sobre mudanças significativas com antecedência razoável. 
                O uso continuado da plataforma após as mudanças constitui aceitação dos novos termos.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">13. Lei Aplicável</h2>
              <p className="text-muted-foreground">
                Estes Termos serão regidos e interpretados de acordo com as leis do Brasil, 
                sem considerar suas disposições sobre conflitos de leis.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">14. Contato</h2>
              <p className="text-muted-foreground">
                Se você tiver dúvidas sobre estes Termos de Serviço, entre em contato conosco 
                através das configurações da plataforma ou pelo email de suporte.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;