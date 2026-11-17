import { humanizeFieldName, humanizeFieldValue } from "@/lib/formFields";

interface StructuredField {
  name: string;
  value: string;
}

interface StructuredData {
  source?: string;
  form_id?: string;
  form_name?: string;
  campaign_name?: string;
  campaign_id?: string;
  facebook_lead_id?: string;
  fields?: StructuredField[];
}

interface FacebookFormDataProps {
  description?: string | null;
  customFields?: StructuredData | null;
}

interface ParsedForm {
  formName: string | null;
  campaignName: string | null;
  campaignId: string | null;
  fields: StructuredField[];
}

const clean = (value: string | null | undefined) => {
  const v = value?.trim();
  return !v || v === "N/A" || v === "undefined" ? null : v;
};

/** Dados estruturados (leads novos) ou texto "=== INFORMAÇÕES DO FORMULÁRIO ===" (leads antigos). */
function parseForm(description?: string | null, customFields?: StructuredData | null): ParsedForm | null {
  if (customFields?.fields && customFields.fields.length > 0) {
    return {
      formName: clean(customFields.form_name),
      campaignName: clean(customFields.campaign_name),
      campaignId: clean(customFields.campaign_id),
      fields: customFields.fields,
    };
  }
  if (!description) return null;
  const [header, section] = description.split("=== INFORMAÇÕES DO FORMULÁRIO ===");
  if (!section) return null;
  const fields = section
    .trim()
    .split("\n")
    .map((line) => {
      const [name, ...rest] = line.split(":");
      return { name: name?.trim() ?? "", value: rest.join(":").trim() };
    })
    .filter((f) => f.name && f.value);
  if (fields.length === 0) return null;
  return {
    formName: clean(header.match(/Formulário: (.+)/)?.[1]),
    campaignName: clean(header.match(/Campanha: (.+)/)?.[1]),
    campaignId: clean((header.match(/ID da campanha: (.+)/) || header.match(/\(ID: ([^)]+)\)/))?.[1]),
    fields,
  };
}

/** Respostas do formulário do Meta Ads, no padrão de lista do DESIGN.md. */
export const FacebookFormData = ({ description, customFields }: FacebookFormDataProps) => {
  const form = parseForm(description, customFields);
  if (!form) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Formulário do Meta Ads</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Meta Ads</span>
      </div>

      {(form.formName || form.campaignName || form.campaignId) && (
        <dl className="space-y-1.5 rounded-md bg-secondary px-3 py-2.5 text-[13px]">
          {form.formName && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">Formulário</dt>
              <dd className="min-w-0 break-words text-foreground">{form.formName}</dd>
            </div>
          )}
          {form.campaignName && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">Campanha</dt>
              <dd className="min-w-0 break-words text-foreground">{form.campaignName}</dd>
            </div>
          )}
          {form.campaignId && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">ID da campanha</dt>
              <dd className="min-w-0 break-all font-mono text-xs text-foreground/80">{form.campaignId}</dd>
            </div>
          )}
        </dl>
      )}

      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {form.fields.map((field, index) => (
          <div key={`${field.name}-${index}`} className="border-b border-border py-2.5">
            <dt className="text-xs text-muted-foreground">{humanizeFieldName(field.name)}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{humanizeFieldValue(field.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
