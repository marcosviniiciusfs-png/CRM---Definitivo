import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as XLSX from "xlsx";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseArgs = (argv) => {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Argumento invalido: ${key ?? "ausente"}`);
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
};

const args = parseArgs(process.argv.slice(2));
const requiredArgs = [
  "host",
  "identity",
  "organization-id",
  "organization-name",
  "funnel-id",
  "funnel-name",
  "stage-ids",
  "output",
];

for (const key of requiredArgs) {
  if (!args[key]) throw new Error(`Argumento obrigatorio ausente: --${key}`);
}

if (!/^[a-z0-9.-]+$/i.test(args.host)) {
  throw new Error("Host SSH invalido");
}
if (!fs.existsSync(args.identity)) {
  throw new Error("Chave SSH nao encontrada");
}
if (!UUID_PATTERN.test(args["organization-id"]) || !UUID_PATTERN.test(args["funnel-id"])) {
  throw new Error("Organization/funnel ID invalido");
}

const stageIds = args["stage-ids"].split(",").map((value) => value.trim());
if (stageIds.length !== 3 || stageIds.some((value) => !UUID_PATTERN.test(value))) {
  throw new Error("Informe exatamente tres stage IDs validos");
}

const sqlUuidList = stageIds.map((value) => `'${value}'::uuid`).join(", ");
const organizationId = args["organization-id"];
const funnelId = args["funnel-id"];

const sql = String.raw`
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
COPY (
  SELECT
    lead_row.id::text AS "ID do lead",
    lead_row.nome_lead AS "Nome do lead",
    lead_row.telefone_lead AS "Telefone",
    COALESCE(lead_row.email, '') AS "E-mail",
    COALESCE(lead_row.empresa, '') AS "Empresa",
    COALESCE(lead_row.valor, 0)::text AS "Valor",
    funnel_stage.name AS "Etapa",
    funnel_stage.position::text AS "Posicao da etapa",
    sales_funnel.name AS "Funil",
    lead_row.funnel_stage_id::text AS "ID da etapa",
    lead_row.funnel_id::text AS "ID do funil",
    COALESCE(lead_row.stage, '') AS "Status legado",
    COALESCE(lead_row.source, '') AS "Origem",
    COALESCE(lead_row.responsavel, responsible_profile.full_name, '') AS "Responsavel",
    COALESCE(responsible_user.email, '') AS "E-mail do responsavel",
    COALESCE(lead_row.responsavel_user_id::text, '') AS "ID do responsavel",
    COALESCE(lead_row.position, 0)::text AS "Posicao do card",
    COALESCE(lead_row.idade::text, '') AS "Idade",
    COALESCE(lead_row.lead_score, 0)::text AS "Lead score",
    COALESCE(lead_row.status_reuniao::text, '') AS "Status da reuniao",
    to_char(lead_row.data_inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS "Data de inicio",
    COALESCE(to_char(lead_row.data_conclusao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'), '') AS "Data de conclusao",
    to_char(lead_row.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS "Criado em",
    to_char(lead_row.updated_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS "Atualizado em",
    COALESCE(to_char(lead_row.last_message_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'), '') AS "Ultima mensagem em",
    COALESCE(to_char(lead_row.last_seen AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'), '') AS "Visto por ultimo em",
    COALESCE(lead_row.additional_data->>'form_name', '') AS "Formulario Facebook",
    COALESCE(lead_row.additional_data->>'form_id', '') AS "ID do formulario Facebook",
    COALESCE(lead_row.additional_data->>'campaign_name', '') AS "Campanha Facebook",
    COALESCE(lead_row.additional_data->>'campaign_id', '') AS "ID da campanha Facebook",
    COALESCE(lead_row.facebook_lead_id, lead_row.additional_data->>'facebook_lead_id', '') AS "ID do lead Facebook",
    CASE
      WHEN lower(COALESCE(lead_row.additional_data->>'is_duplicate', 'false')) IN ('true', 't', '1', 'yes', 'sim')
        THEN 'Sim'
      ELSE 'Nao'
    END AS "Lead duplicado",
    COALESCE(lead_row.additional_data->>'duplicate_of_lead_id', '') AS "ID do lead original",
    COALESCE(lead_row.additional_data->>'duplicate_match_type', '') AS "Criterio da duplicidade",
    COALESCE(lead_row.duplicate_attempts_count, 0)::text AS "Tentativas de retorno",
    COALESCE(to_char(lead_row.last_duplicate_attempt_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'), '') AS "Ultima tentativa de retorno",
    COALESCE(form_fields.formatted_fields, '') AS "Campos do formulario",
    CASE
      WHEN length(COALESCE(lead_row.descricao_negocio, '')) > 32000
        THEN left(lead_row.descricao_negocio, 31980) || ' [TRUNCADO]'
      ELSE COALESCE(lead_row.descricao_negocio, '')
    END AS "Descricao do negocio",
    CASE
      WHEN length(COALESCE(lead_row.additional_data::text, '')) > 32000
        THEN left(lead_row.additional_data::text, 31980) || ' [TRUNCADO]'
      ELSE COALESCE(lead_row.additional_data::text, '')
    END AS "Dados adicionais JSON",
    CASE
      WHEN length(COALESCE(lead_row.duplicate_attempts_history::text, '')) > 32000
        THEN left(lead_row.duplicate_attempts_history::text, 31980) || ' [TRUNCADO]'
      ELSE COALESCE(lead_row.duplicate_attempts_history::text, '')
    END AS "Historico de retornos JSON",
    COALESCE(lead_row.calendar_event_id, '') AS "ID do evento de calendario",
    COALESCE(lead_row.whatsapp_instance_id::text, '') AS "ID da instancia WhatsApp"
  FROM public.leads AS lead_row
  JOIN public.funnel_stages AS funnel_stage
    ON funnel_stage.id = lead_row.funnel_stage_id
  JOIN public.sales_funnels AS sales_funnel
    ON sales_funnel.id = lead_row.funnel_id
   AND sales_funnel.organization_id = lead_row.organization_id
  LEFT JOIN public.profiles AS responsible_profile
    ON responsible_profile.user_id = lead_row.responsavel_user_id
  LEFT JOIN auth.users AS responsible_user
    ON responsible_user.id = lead_row.responsavel_user_id
  LEFT JOIN LATERAL (
    SELECT string_agg(
      concat(
        COALESCE(field_item.value->>'name', 'Campo'),
        ': ',
        COALESCE(field_item.value->>'value', '')
      ),
      ' | '
      ORDER BY field_item.ordinality
    ) AS formatted_fields
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(lead_row.additional_data->'fields') = 'array'
          THEN lead_row.additional_data->'fields'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS field_item(value, ordinality)
  ) AS form_fields ON true
  WHERE lead_row.organization_id = '${organizationId}'::uuid
    AND lead_row.funnel_id = '${funnelId}'::uuid
    AND lead_row.funnel_stage_id IN (${sqlUuidList})
  ORDER BY
    funnel_stage.position ASC,
    lead_row.position ASC,
    lead_row.created_at ASC,
    lead_row.id ASC
) TO STDOUT WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8');
COMMIT;
`;

const sshResult = spawnSync(
  "ssh",
  [
    "-i",
    args.identity,
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    `root@${args.host}`,
    "docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1",
  ],
  {
    input: sql,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  },
);

if (sshResult.status !== 0) {
  throw new Error(`Consulta somente leitura falhou: ${sshResult.stderr?.trim() || "erro desconhecido"}`);
}

const csv = sshResult.stdout.replace(/^\uFEFF/, "");
if (!csv.startsWith('ID do lead,')) {
  throw new Error("Resposta CSV inesperada");
}

const csvWorkbook = XLSX.read(csv, { type: "string", raw: true });
const csvSheet = csvWorkbook.Sheets[csvWorkbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(csvSheet, { defval: "", raw: true });

const numericColumns = [
  "Valor",
  "Posicao da etapa",
  "Posicao do card",
  "Idade",
  "Lead score",
  "Tentativas de retorno",
];

for (const row of rows) {
  for (const column of numericColumns) {
    if (row[column] !== "" && Number.isFinite(Number(row[column]))) {
      row[column] = Number(row[column]);
    }
  }
}

const headers = XLSX.utils.sheet_to_json(csvSheet, { header: 1, raw: true })[0];
const leadsSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
leadsSheet["!autofilter"] = { ref: leadsSheet["!ref"] };
leadsSheet["!cols"] = headers.map((header) => {
  const longText = [
    "Campos do formulario",
    "Descricao do negocio",
    "Dados adicionais JSON",
    "Historico de retornos JSON",
  ].includes(header);
  const sampleWidth = Math.max(
    String(header).length,
    ...rows.slice(0, 250).map((row) => String(row[header] ?? "").length),
  );
  return { wch: longText ? 55 : Math.min(Math.max(sampleWidth + 2, 12), 32) };
});

const stageCounts = new Map();
for (const row of rows) {
  stageCounts.set(row.Etapa, (stageCounts.get(row.Etapa) || 0) + 1);
}

const generatedAt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
}).format(new Date());

const summaryRows = [
  ["Exportacao de leads", ""],
  ["Organizacao", args["organization-name"]],
  ["ID da organizacao", organizationId],
  ["Funil", args["funnel-name"]],
  ["ID do funil", funnelId],
  ["Gerado em", generatedAt],
  ["Modo da consulta", "Somente leitura / transacao READ ONLY"],
  ["Total de leads", rows.length],
  ["", ""],
  ["Etapa", "Quantidade"],
  ...Array.from(stageCounts.entries()).map(([stage, count]) => [stage, count]),
];
const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
summarySheet["!cols"] = [{ wch: 28 }, { wch: 48 }];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, leadsSheet, "Leads");
XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");
workbook.Props = {
  Title: `Leads - ${args["funnel-name"]}`,
  Subject: "Exportacao somente leitura de leads por etapa",
  Author: "Kairoz CRM",
  CreatedDate: new Date(),
};

const outputPath = path.resolve(args.output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
XLSX.writeFile(workbook, outputPath, { compression: true });

const validationWorkbook = XLSX.read(fs.readFileSync(outputPath), {
  type: "buffer",
  raw: true,
});
const validationRows = XLSX.utils.sheet_to_json(
  validationWorkbook.Sheets.Leads,
  { defval: "", raw: true },
);
if (validationRows.length !== rows.length) {
  throw new Error(`Validacao do XLSX falhou: esperado=${rows.length}, encontrado=${validationRows.length}`);
}

const fileStats = fs.statSync(outputPath);
console.log(JSON.stringify({
  outputPath,
  rowCount: rows.length,
  stageCounts: Object.fromEntries(stageCounts),
  fileSizeBytes: fileStats.size,
}));
