export interface FilterCondition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

export interface FilterRules {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

interface FilterRuleChipsProps {
  rules: FilterRules;
}

const fieldLabels: Record<string, string> = {
  source_type: 'Fonte',
  lead_score: 'Score',
  telefone_lead: 'Telefone',
  email_lead: 'Email',
};

const operatorLabels: Record<string, string> = {
  equals: '=',
  not_equals: '\u2260',
  gte: '\u2265',
  lte: '\u2264',
  exists: 'existe',
};

export function FilterRuleChips({ rules }: FilterRuleChipsProps) {
  if (!rules?.conditions?.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {rules.conditions.map((cond, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20"
        >
          {fieldLabels[cond.field] || cond.field}
          <span className="text-blue-400 dark:text-blue-500">{operatorLabels[cond.operator] || cond.operator}</span>
          <span className="font-medium">{String(cond.value)}</span>
        </span>
      ))}
      {rules.conditions.length > 1 && (
        <span className="text-[11px] text-muted-foreground self-center">
          ({rules.logic})
        </span>
      )}
    </div>
  );
}
