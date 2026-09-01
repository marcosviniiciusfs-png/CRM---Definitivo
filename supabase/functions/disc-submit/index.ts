import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import {
  readJsonObject,
  rejectDisallowedOrigin,
  rejectRateLimited,
  requestValidationResponse,
} from "../_shared/request-security.ts";

type Factor = "D" | "I" | "S" | "C";
type Scores = Record<Factor, number>;

interface DiscPayload {
  version?: unknown;
  nome?: unknown;
  email?: unknown;
  consentimento_lgpd?: unknown;
  answers?: unknown;
  source_url?: unknown;
  website?: unknown;
}

interface AnswerDefinition {
  label: string;
  factor: Factor;
}

const VERSION = "disc-interno-v1";
const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const QUESTION_IDS = Array.from(
  { length: 24 },
  (_, index) => `q${String(index + 1).padStart(2, "0")}`,
);

// Four answer choices per item. The order is intentionally mixed so the
// respondent never sees a visible D/I/S/C sequence in the public page.
const FACTOR_ORDER: Factor[][] = [
  ["D", "I", "S", "C"],
  ["S", "C", "D", "I"],
  ["I", "D", "S", "C"],
  ["C", "S", "I", "D"],
  ["D", "C", "S", "I"],
  ["S", "I", "D", "C"],
  ["I", "C", "D", "S"],
  ["D", "C", "S", "I"],
  ["S", "D", "I", "C"],
  ["I", "D", "C", "S"],
  ["C", "S", "D", "I"],
  ["I", "D", "S", "C"],
  ["S", "C", "I", "D"],
  ["D", "S", "C", "I"],
  ["I", "C", "S", "D"],
  ["C", "I", "D", "S"],
  ["S", "D", "C", "I"],
  ["D", "C", "I", "S"],
  ["I", "S", "D", "C"],
  ["C", "D", "I", "S"],
  ["S", "I", "C", "D"],
  ["D", "S", "I", "C"],
  ["I", "C", "D", "S"],
  ["C", "I", "S", "D"],
];

const ANSWER_LABELS: string[][] = [
  [
    "Assumo a frente e decido rápido.",
    "Puxo conversa e mobilizo as pessoas.",
    "Escuto o grupo e mantenho um ritmo estável.",
    "Analiso os detalhes antes de decidir.",
  ],
  [
    "Prefiro entender o cenário antes de mudar algo.",
    "Confiro critérios e informações.",
    "Parto para a ação e resolvo o que trava.",
    "Animo o ambiente e envolvo o time.",
  ],
  [
    "Gosto de trocar ideias e criar conexão.",
    "Defino uma direção e sigo em frente.",
    "Procuro consistência e segurança.",
    "Comparo dados e busco precisão.",
  ],
  [
    "Reviso o trabalho para garantir qualidade.",
    "Dou espaço para ouvir e construir junto.",
    "Explico a ideia e ganho adesão.",
    "Tomo uma decisão quando o caminho está claro.",
  ],
  [
    "Encaro desafios e busco metas maiores.",
    "Sigo critérios para reduzir erros.",
    "Valorizo previsibilidade e parceria.",
    "Levo energia para começar e engajar.",
  ],
  [
    "Mantenho a equipe conectada e motivada.",
    "Organizo informações e padrões.",
    "Acelero quando existe uma oportunidade.",
    "Cuido da continuidade e do clima do grupo.",
  ],
  [
    "Faço contato com facilidade e abro portas.",
    "Estruturo a ideia antes de apresentar.",
    "Assumo a responsabilidade pelo próximo passo.",
    "Considero o impacto da decisão no time.",
  ],
  [
    "Trabalhar com metas objetivas.",
    "Questionar premissas e procurar evidências.",
    "Combinar expectativas antes de executar.",
    "Fazer pontes e manter as pessoas envolvidas.",
  ],
  [
    "Dou atenção ao que o time precisa para avançar.",
    "Escolho uma direção e cobro movimento.",
    "Comunico a ideia com entusiasmo.",
    "Organizo o processo e verifico os detalhes.",
  ],
  [
    "Busco uma conversa leve e produtiva.",
    "Vejo o que pode ser decidido agora.",
    "Prefiro validar cada etapa.",
    "Tento preservar estabilidade durante mudanças.",
  ],
  [
    "Confiro o padrão antes de entregar.",
    "Mantenho o acordo e a rotina funcionando.",
    "Puxo o assunto difícil para resolver.",
    "Encontro um jeito de envolver quem está ao redor.",
  ],
  [
    "Faço perguntas e mantenho a conversa aberta.",
    "Vou direto ao ponto principal.",
    "Procuro uma solução que seja sustentável.",
    "Mapeio as variáveis antes de recomendar algo.",
  ],
  [
    "Dou tempo para as pessoas se adaptarem.",
    "Organizo referências para reduzir dúvidas.",
    "Crio conexão e facilito a troca.",
    "Transformo intenção em uma decisão.",
  ],
  [
    "Gosto de construir passo a passo com o time.",
    "Protejo a qualidade mesmo com pressão.",
    "Faço o plano sair do papel.",
    "Aproximo as pessoas da ação.",
  ],
  [
    "Apresento possibilidades e estimulo movimento.",
    "Procuro uma rota segura e repetível.",
    "Acompanho o que foi combinado.",
    "Defino prioridade quando tudo parece urgente.",
  ],
  [
    "Prefiro deixar os critérios explícitos.",
    "Faço a conversa acontecer com naturalidade.",
    "Tomo a liderança quando falta direção.",
    "Busco consenso e continuidade.",
  ],
  [
    "Cuido do ritmo para ninguém ficar para trás.",
    "Destravo logo o que depende de decisão.",
    "Reúno evidências antes de concluir.",
    "Animo o grupo para seguir em frente.",
  ],
  [
    "Mantenho o padrão mesmo em tarefas repetidas.",
    "Gosto de metas que desafiam minha capacidade.",
    "Valorizo um ambiente de confiança.",
    "Levo energia e presença para as conversas.",
  ],
  [
    "Faço a equipe se sentir parte da solução.",
    "Dou um corte claro quando é hora de escolher.",
    "Busco manter a execução organizada.",
    "Penso no impacto antes de alterar a rota.",
  ],
  [
    "Coloco o plano em movimento.",
    "Evito mudanças sem fundamento.",
    "Trago leveza e entusiasmo para o trabalho.",
    "Mantenho acordos e relações estáveis.",
  ],
  [
    "Conecto pessoas e ideias rapidamente.",
    "Crio um ambiente previsível para executar.",
    "Reviso o que pode gerar retrabalho.",
    "Defino o resultado que precisa ser alcançado.",
  ],
  [
    "Tenho facilidade para testar uma nova abordagem.",
    "Prefiro ajustar com base em fatos.",
    "Considero o ritmo e a segurança do grupo.",
    "Gosto de comunicar o próximo passo com clareza.",
  ],
  [
    "Procuro entender antes de responder.",
    "Busco precisão e lógica na decisão.",
    "Assumo o comando quando há pressão.",
    "Mobilizo o time com uma visão positiva.",
  ],
  [
    "Verifico se todos entenderam o combinado.",
    "Dou energia para o grupo sair da inércia.",
    "Avalio riscos e detalhes importantes.",
    "Preservo a cooperação durante a mudança.",
  ],
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido" }, 405);
  }

  const originRejection = rejectDisallowedOrigin(req, corsHeaders);
  if (originRejection) return originRejection;
  const rateRejection = rejectRateLimited(
    req,
    "disc-submit",
    5,
    10 * 60_000,
    corsHeaders,
  );
  if (rateRejection) return rateRejection;

  let payload: DiscPayload;
  try {
    payload = await readJsonObject(req, 24 * 1024) as DiscPayload;
  } catch (error) {
    return requestValidationResponse(error, corsHeaders) ??
      json({ success: false, error: "Payload inválido" }, 400);
  }

  if (cleanText(payload.website, 120)) return json({ success: true });

  const parsed = normalizePayload(payload);
  if ("error" in parsed) {
    return json({ success: false, error: parsed.error }, 400);
  }

  const scored = scoreAnswers(parsed.answers);
  const fallback = buildFallbackReport(parsed.nome, scored);
  const report = await enrichWithAi(
    parsed.nome,
    scored,
    parsed.answers,
    fallback,
  );
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("disc_internal_assessments")
    .insert({
      assessment_version: VERSION,
      nome: parsed.nome,
      email: parsed.email,
      answers: { selections: parsed.answers, labels: scored.labels },
      scores: scored.scores,
      profile_code: scored.profileCode,
      profile_label: scored.profileLabel,
      report,
      consentimento_lgpd: true,
      source_url: parsed.sourceUrl,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) || null,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("[disc-submit] insert failed", error);
    return json({
      success: false,
      error: "Não foi possível salvar seu resultado agora.",
    }, 500);
  }

  return json({
    success: true,
    submission_id: data.id,
    created_at: data.created_at,
    assessment_version: VERSION,
    result: {
      nome: parsed.nome,
      profile_code: scored.profileCode,
      profile_label: scored.profileLabel,
      scores: scored.scores,
      answers: { selections: parsed.answers, labels: scored.labels },
      report,
    },
  });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizePayload(payload: DiscPayload):
  | {
    nome: string;
    email: string;
    answers: Record<string, string>;
    sourceUrl: string | null;
  }
  | { error: string } {
  const nome = cleanText(payload.nome, 120);
  const email = cleanText(payload.email, 180).toLowerCase();
  const answers = payload.answers && typeof payload.answers === "object"
    ? payload.answers as Record<string, unknown>
    : {};
  const normalized: Record<string, string> = {};

  if (nome.length < 2) return { error: "Informe seu nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Informe um e-mail válido." };
  }
  if (!parseBoolean(payload.consentimento_lgpd)) {
    return { error: "Aceite o uso interno dos dados para continuar." };
  }

  for (let index = 0; index < QUESTION_IDS.length; index += 1) {
    const questionId = QUESTION_IDS[index];
    const value = cleanText(answers[questionId], 8).toLowerCase();
    if (!/^[abcd]$/.test(value)) {
      return { error: "Responda todas as 24 perguntas." };
    }
    normalized[questionId] = value;
  }

  return {
    nome,
    email,
    answers: normalized,
    sourceUrl: cleanPublicUrl(payload.source_url),
  };
}

function scoreAnswers(answers: Record<string, string>) {
  const scores: Scores = { D: 0, I: 0, S: 0, C: 0 };
  const labels: Record<string, string> = {};

  QUESTION_IDS.forEach((questionId, index) => {
    const optionIndex = "abcd".indexOf(answers[questionId]);
    const factor = FACTOR_ORDER[index][optionIndex];
    scores[factor] += 1;
    labels[questionId] = ANSWER_LABELS[index][optionIndex];
  });

  const ranking = (Object.entries(scores) as [Factor, number][])
    .sort(([factorA, scoreA], [factorB, scoreB]) =>
      scoreB - scoreA || factorA.localeCompare(factorB)
    );
  const profileCode = ranking[0][0];
  const secondary = ranking[1][0];

  return {
    scores,
    labels,
    profileCode,
    secondary,
    profileLabel: profileName(profileCode, secondary),
  };
}

function profileName(primary: Factor, secondary: Factor): string {
  const names: Record<Factor, string> = {
    D: "Dominância",
    I: "Influência",
    S: "Estabilidade",
    C: "Conformidade",
  };
  return primary === secondary
    ? names[primary]
    : `${names[primary]} com traços de ${names[secondary]}`;
}

function buildFallbackReport(
  nome: string,
  scored: ReturnType<typeof scoreAnswers>,
) {
  const firstName = nome.split(" ")[0];
  const profiles: Record<
    Factor,
    {
      summary: string;
      strengths: string[];
      attention: string[];
      communication: string;
      hurtz: string;
      recommendations: string[];
    }
  > = {
    D: {
      summary:
        `${firstName}, você tende a ganhar energia quando existe um desafio claro, autonomia para agir e uma decisão para destravar.`,
      strengths: [
        "iniciativa e senso de urgência",
        "coragem para decidir",
        "foco em metas e resultado",
      ],
      attention: [
        "ouvir o contexto antes de acelerar",
        "calibrar o tom em situações de pressão",
        "registrar decisões para o time acompanhar",
      ],
      communication:
        "Vá direto ao ponto, traga o objetivo e deixe claro qual decisão ou próximo passo é esperado.",
      hurtz:
        "Na operação, esse perfil ajuda a tirar projetos da inércia e resolver gargalos. Funciona melhor com metas objetivas, autonomia e cobrança por entrega.",
      recommendations: [
        "comece reuniões pelo resultado esperado",
        "combine prazos e responsáveis por escrito",
        "pratique pausas curtas para ouvir objeções",
      ],
    },
    I: {
      summary:
        `${firstName}, você tende a ganhar energia na troca com pessoas, na comunicação e na capacidade de criar movimento ao redor de uma ideia.`,
      strengths: [
        "conexão e influência",
        "entusiasmo para mobilizar",
        "facilidade para comunicar ideias",
      ],
      attention: [
        "fechar acordos com prazo e responsável",
        "evitar começar mais frentes do que consegue concluir",
        "registrar detalhes importantes depois das conversas",
      ],
      communication:
        "Comece pela visão geral e pelo porquê, depois feche a conversa com um próximo passo concreto.",
      hurtz:
        "Na operação, esse perfil fortalece relacionamento, vendas e alinhamento. Ganha performance quando tem espaço para comunicar, mas também um sistema simples de acompanhamento.",
      recommendations: [
        "termine conversas com três itens: quem, o quê e quando",
        "use blocos de foco sem notificações",
        "peça um resumo escrito de decisões relevantes",
      ],
    },
    S: {
      summary:
        `${firstName}, você tende a performar melhor quando existe confiança, cooperação e um ritmo que permita construir consistência.`,
      strengths: [
        "escuta e colaboração",
        "constância na execução",
        "cuidado com o clima e as relações",
      ],
      attention: [
        "sinalizar incômodos antes que virem acúmulo",
        "aceitar mudanças de rota com mais rapidez",
        "defender prioridades quando tudo parece urgente",
      ],
      communication:
        "Explique o contexto, mostre como a mudança será conduzida e dê espaço para perguntas antes de cobrar velocidade.",
      hurtz:
        "Na operação, esse perfil sustenta continuidade, qualidade de relacionamento e execução confiável. Precisa de clareza de prioridade e segurança para sinalizar riscos.",
      recommendations: [
        "combine mudanças com antecedência sempre que possível",
        "defina uma prioridade principal por ciclo",
        "marque pontos de alinhamento curtos e regulares",
      ],
    },
    C: {
      summary:
        `${firstName}, você tende a ganhar confiança quando entende os critérios, os dados e o padrão de qualidade esperado antes de executar.`,
      strengths: [
        "precisão e análise",
        "organização de processos",
        "cuidado com qualidade e risco",
      ],
      attention: [
        "não esperar informação perfeita para começar",
        "traduzir análise em recomendação objetiva",
        "aceitar que algumas decisões serão ajustadas em movimento",
      ],
      communication:
        "Traga contexto, critérios e dados relevantes. Evite excesso de generalidade e deixe o padrão de qualidade explícito.",
      hurtz:
        "Na operação, esse perfil reduz retrabalho, melhora processos e protege a qualidade da entrega. Ganha performance com critérios claros e autonomia para organizar a execução.",
      recommendations: [
        "defina o mínimo necessário para iniciar",
        "separe análise de decisão em blocos",
        "apresente recomendação antes de listar todos os detalhes",
      ],
    },
  };
  const profile = profiles[scored.profileCode];
  return {
    summary: profile.summary,
    strengths: profile.strengths,
    attention_points: profile.attention,
    communication: profile.communication,
    hurtz_impact: profile.hurtz,
    recommendations: profile.recommendations,
    disclaimer:
      "Este é um diagnóstico interno de autoconhecimento, baseado em referências públicas. Não é um teste oficial, clínico ou uma sentença sobre sua personalidade.",
    ai_generated: false,
  };
}

async function enrichWithAi(
  nome: string,
  scored: ReturnType<typeof scoreAnswers>,
  answers: Record<string, string>,
  fallback: ReturnType<typeof buildFallbackReport>,
) {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")?.trim();
  if (!apiKey) return fallback;

  const model = Deno.env.get("DISC_AI_MODEL")?.trim() || "openai/gpt-4o-mini";
  const prompt = {
    nome: nome.split(" ")[0],
    perfil: scored.profileLabel,
    scores: scored.scores,
    respostas: Object.entries(scored.labels).map(([id, label]) => ({
      id,
      label,
      escolha: answers[id],
    })),
    contexto_empresa:
      "Hurtz Company: operação de aquisição para representantes de consórcio, com tráfego, SDR, closer e gestão de projetos. Cultura direta, orientada a resultado, clareza, ritmo e responsabilidade.",
  };

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": Deno.env.get("SITE_URL") || "",
          "X-Title": "Hurtz Diagnóstico DISC Interno",
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Você é um facilitador de desenvolvimento de equipes. Gere um relatório humano, direto e respeitoso em português do Brasil. Não diagnostique, não rotule, não recomende demissão ou contratação e não invente fatos. Retorne somente JSON com as chaves summary, strengths, attention_points, communication, hurtz_impact, recommendations e disclaimer. strengths, attention_points e recommendations devem ter 3 itens curtos. O disclaimer deve reforçar que é uma ferramenta interna de autoconhecimento e não um teste oficial ou clínico.",
            },
            { role: "user", content: JSON.stringify(prompt) },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) return fallback;
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string"
      ? JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""))
      : null;
    const sanitized = sanitizeReport(parsed);
    if (!sanitized) return fallback;
    return { ...sanitized, ai_generated: true };
  } catch (error) {
    console.error("[disc-submit] AI report failed", error);
    return fallback;
  }
}

function isValidReport(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return typeof report.summary === "string" &&
    typeof report.communication === "string" &&
    typeof report.hurtz_impact === "string" &&
    typeof report.disclaimer === "string" &&
    Array.isArray(report.strengths) && report.strengths.length >= 2 &&
    Array.isArray(report.attention_points) &&
    report.attention_points.length >= 2 &&
    Array.isArray(report.recommendations) && report.recommendations.length >= 2;
}

function sanitizeReport(value: unknown): Record<string, unknown> | null {
  if (!isValidReport(value)) return null;
  const list = (candidate: unknown) =>
    (candidate as unknown[])
      .filter((item): item is string => typeof item === "string")
      .slice(0, 5)
      .map((item) => cleanText(item, 500));

  const strengths = list(value.strengths);
  const attentionPoints = list(value.attention_points);
  const recommendations = list(value.recommendations);
  if (
    strengths.length < 2 || attentionPoints.length < 2 ||
    recommendations.length < 2
  ) return null;

  return {
    summary: cleanText(value.summary, 1500),
    strengths,
    attention_points: attentionPoints,
    communication: cleanText(value.communication, 1500),
    hurtz_impact: cleanText(value.hurtz_impact, 1500),
    recommendations,
    disclaimer: cleanText(value.disclaimer, 800),
  };
}

function cleanPublicUrl(value: unknown): string | null {
  const candidate = cleanText(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "1", "sim", "yes", "on", "aceito"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}
