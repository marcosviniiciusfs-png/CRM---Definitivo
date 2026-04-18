import { FilterRules, FilterCondition } from './FilterRuleChips';

interface FilterRuleBuilderProps {
  value: FilterRules;
  onChange: (rules: FilterRules) => void;
}

interface FieldDef {
  value: string;
  label: string;
  type: string;
}

interface OpDef {
  value: string;
  label: string;
}

const fields: FieldDef[] = [
  { value: 'source_type', label: 'Fonte', type: 'text' },
  { value: 'lead_score', label: 'Score', type: 'number' },
  { value: 'telefone_lead', label: 'Telefone', type: 'boolean' },
  { value: 'email_lead', label: 'Email', type: 'boolean' },
];

function getOperators(field: string): OpDef[] {
  switch (field) {
    case 'source_type':
      return [
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Diferente de' },
      ];
    case 'lead_score':
      return [
        { value: 'gte', label: 'Maior ou igual' },
        { value: 'lte', label: 'Menor ou igual' },
        { value: 'equals', label: 'Igual a' },
      ];
    case 'telefone_lead':
    case 'email_lead':
      return [{ value: 'exists', label: 'Existe' }];
    default:
      return [];
  }
}

export function FilterRuleBuilder({ value, onChange }: FilterRuleBuilderProps) {
  const addCondition = () => {
    onChange({
      ...value,
      conditions: [...value.conditions, { field: 'source_type', operator: 'equals', value: '' }],
    });
  };

  const removeCondition = (index: number) => {
    const newConditions = value.conditions.filter((_, i) => i !== index);
    onChange({ ...value, conditions: newConditions });
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const newConditions = [...value.conditions];
    newConditions[index] = { ...newConditions[index], ...updates };

    if (updates.field && updates.field !== value.conditions[index].field) {
      const ops = getOperators(updates.field);
      if (ops.length > 0) {
        newConditions[index].operator = ops[0].value;
      }
      const fieldType = fields.find(f => f.value === updates.field)?.type;
      newConditions[index].value = fieldType === 'boolean' ? true : '';
    }

    onChange({ ...value, conditions: newConditions });
  };

  const toggleLogic = () => {
    onChange({ ...value, logic: value.logic === 'AND' ? 'OR' : 'AND' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Regras de Filtro
        </label>
        <button
          type="button"
          onClick={toggleLogic}
          className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
        >
          {value.logic}
        </button>
      </div>

      {value.conditions.map((cond, i) => {
        const fieldType = fields.find(f => f.value === cond.field)?.type;
        const operators = getOperators(cond.field);

        return (
          <div key={i} className="flex items-center gap-2">
            <select
              value={cond.field}
              onChange={e => updateCondition(i, { field: e.target.value })}
              className="flex-1 bg-background border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/20"
            >
              {fields.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            <select
              value={cond.operator}
              onChange={e => updateCondition(i, { operator: e.target.value })}
              className="bg-background border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/20"
            >
              {operators.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {fieldType === 'boolean' ? (
              <span className="text-xs text-muted-foreground w-20">preenchido</span>
            ) : (
              <input
                type={fieldType === 'number' ? 'number' : 'text'}
                value={String(cond.value)}
                onChange={e => updateCondition(i, { value: fieldType === 'number' ? Number(e.target.value) : e.target.value })}
                placeholder="Valor"
                className="flex-1 bg-background border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/20"
              />
            )}

            <button
              type="button"
              onClick={() => removeCondition(i)}
              className="text-muted-foreground hover:text-destructive transition-colors p-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Adicionar regra
      </button>
    </div>
  );
}
