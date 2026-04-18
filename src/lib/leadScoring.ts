export interface LeadScoreInput {
  telefone_lead?: string | null;
  email?: string | null;
  source?: string | null;
  nome_lead?: string | null;
}

export function calculateLeadScore(input: LeadScoreInput): number {
  let score = 0;

  // +30 if valid phone
  if (input.telefone_lead && input.telefone_lead.replace(/\D/g, '').length >= 10) {
    score += 30;
  }

  // +20 if email exists
  if (input.email && input.email.includes('@')) {
    score += 20;
  }

  // +20 if Facebook Ads source
  if (input.source === 'facebook') {
    score += 20;
  }

  // +15 if website form
  if (input.source === 'formulario' || input.source === 'site') {
    score += 15;
  }

  // +15 if full name (>= 2 words)
  if (input.nome_lead && input.nome_lead.trim().split(/\s+/).length >= 2) {
    score += 15;
  }

  return Math.min(score, 100);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-cyan-400';
  if (score >= 60) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-rose-400';
}

export function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
  if (score >= 60) return 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400';
  if (score >= 40) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
  return 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400';
}
