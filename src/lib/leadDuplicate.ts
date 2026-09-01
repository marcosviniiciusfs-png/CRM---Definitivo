export type LeadDuplicateMatchType = "phone" | "email";

export interface LeadDuplicateMetadata {
  isDuplicateRecord: boolean;
  duplicateOfLeadId: string | null;
  matchType: LeadDuplicateMatchType | null;
}

const EMPTY_DUPLICATE_METADATA: LeadDuplicateMetadata = {
  isDuplicateRecord: false,
  duplicateOfLeadId: null,
  matchType: null,
};

const parseAdditionalData = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
};

const isTruthyDuplicateMarker = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
};

const readNonEmptyString = (...values: unknown[]): string | null => {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
  return typeof value === "string" ? value.trim() : null;
};

export const getLeadDuplicateMetadata = (additionalData: unknown): LeadDuplicateMetadata => {
  const data = parseAdditionalData(additionalData);
  if (!data) return EMPTY_DUPLICATE_METADATA;

  const duplicateOfLeadId = readNonEmptyString(
    data.duplicate_of_lead_id,
    data.duplicateOfLeadId,
    data.original_lead_id,
  );
  const rawMatchType = readNonEmptyString(data.duplicate_match_type, data.duplicateMatchType);
  const matchType = rawMatchType === "phone" || rawMatchType === "email" ? rawMatchType : null;

  return {
    isDuplicateRecord:
      isTruthyDuplicateMarker(data.is_duplicate) ||
      isTruthyDuplicateMarker(data.isDuplicate) ||
      duplicateOfLeadId !== null,
    duplicateOfLeadId,
    matchType,
  };
};

export const isLeadDuplicateRecord = (additionalData: unknown): boolean =>
  getLeadDuplicateMetadata(additionalData).isDuplicateRecord;
