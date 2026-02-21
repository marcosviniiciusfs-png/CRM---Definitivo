import { motion } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    q: "O que é o KairoZ?",
    a: "O KairoZ é uma plataforma de CRM (Gestão de Relacionamento com o Cliente) focada em equipes de vendas. Ele centraliza a gestão de leads, funil de vendas, metas, comissões e métricas em um único lugar.",
  },
  {
    q: "Preciso instalar algo?",
    a: "Não! O KairoZ é 100% online. Basta criar sua conta e começar a usar diretamente pelo navegador, no computador ou celular.",
  },
  {
    q: "Posso testar antes de assinar?",
    a: "Sim! Oferecemos um período de teste para que você conheça todas as funcionalidades antes de escolher um plano.",
  },
  {
    q: "Quantos colaboradores posso ter?",
    a: "Depende do plano escolhido. O plano Star permite até 5 colaboradores, o Pro até 15, e o Elite oferece colaboradores ilimitados.",
  },
  {
    q: "Tem integração com WhatsApp?",
    a: "Sim, a integração com WhatsApp está sendo preparada e estará disponível em breve. Você será notificado assim que estiver disponível.",
  },
];

const FAQSection = () => (
  <section className="py-20">
    <div className="container mx-auto px-4 max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          Perguntas <span className="text-primary">frequentes</span>
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
      >
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="bg-background border border-border rounded-xl px-6 data-[state=open]:border-primary/30 transition-colors"
            >
              <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>
    </div>
  </section>
);

export default FAQSection;
