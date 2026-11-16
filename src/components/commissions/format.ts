export const ALL = "__all__";

export const plural = (count: number, singular: string, pluralForm: string) =>
  `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : pluralForm}`;

export const formatDay = (value: string | null | undefined) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "";
