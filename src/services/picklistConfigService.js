/**
 * Loads the event/history picklist values managed in Widget_Picklist_Config.
 *
 * A failed or empty read returns the widget's original hard-coded values for
 * that call, but is deliberately not cached. This lets a later request recover
 * if Zoho was not ready yet or the first request was transiently unavailable.
 */
import { activityResultMapping } from "../components/helperFunc";

export const DEFAULT_ACTIVITY_TYPES = [
  "Meeting",
  "To-Do",
  "Appointment",
  "Boardroom",
  "Call Billing",
  "Email Billing",
  "Initial Consultation",
  "Call",
  "Mail",
  "Meeting Billing",
  "Personal Activity",
  "Room 1",
  "Room 2",
  "Room 3",
  "To Do Billing",
  "Vacation",
  "Other",
];

export const DEFAULT_DURATION_OPTIONS = Array.from(
  { length: 24 },
  (_, index) => (index + 1) * 10
);

const MODULE_API_NAMES = ["Widget_Picklist_Config", "CustomModule15"];
const CONNECTION_NAME = "zoho_crm_conn";
const COQL_URL = "https://www.zohoapis.com.au/crm/v8/coql";

const FIELDS = {
  name: "Name",
  category: "Category",
  parentType: "Parent_Type",
  sortOrder: "Sort_Order",
  active: "Active",
};

let cachedConfig = null;
let fetchPromise = null;

const defaultResultMapping = Object.fromEntries(
  Object.entries(activityResultMapping).map(([type, results]) => [
    type,
    results[0],
  ])
);

const buildFallbackConfig = () => ({
  types: [...DEFAULT_ACTIVITY_TYPES],
  results: null,
  resultMapping: { ...defaultResultMapping },
  regarding: null,
  durations: [...DEFAULT_DURATION_OPTIONS],
  _source: "fallback",
});

const fieldValue = (value) => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    return (
      value.display_value ||
      value.actual_value ||
      value.name ||
      value.Name ||
      ""
    );
  }
  return String(value);
};

const isActive = (record) => {
  const value = record?.[FIELDS.active];
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1" ||
    value === "Yes"
  );
};

const extractRecords = (response) => {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
};

const paginateSdk = async (ZOHO, entity) => {
  const records = [];
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    let response;
    try {
      if (typeof ZOHO.CRM.API.getAllRecords === "function") {
        response = await ZOHO.CRM.API.getAllRecords({
          Entity: entity,
          sort_order: "asc",
          per_page: perPage,
          page,
        });
      } else if (typeof ZOHO.CRM.API.getRecords === "function") {
        response = await ZOHO.CRM.API.getRecords({
          Entity: entity,
          sort_order: "asc",
          per_page: perPage,
          page,
        });
      } else {
        return [];
      }
    } catch (error) {
      console.warn(
        `Widget_Picklist_Config SDK fetch failed for ${entity} page ${page}:`,
        error
      );
      return [];
    }

    if (response?.status === "error" || response?.code === "INVALID_MODULE") {
      return [];
    }

    const pageRecords = extractRecords(response);
    records.push(...pageRecords);

    const hasMore =
      response?.info?.more_records === true ||
      response?.info?.more_records === "true";
    if (pageRecords.length < perPage || !hasMore) break;
  }

  return records;
};

const fetchViaSdk = async (ZOHO) => {
  for (const entity of MODULE_API_NAMES) {
    const records = await paginateSdk(ZOHO, entity);
    if (records.length > 0) return records;
  }
  return [];
};

const parseCoqlRecords = (response) => {
  const statusMessage = response?.details?.statusMessage;
  let parsedStatusMessage = statusMessage;

  if (typeof statusMessage === "string" && statusMessage.trim()) {
    try {
      parsedStatusMessage = JSON.parse(statusMessage);
    } catch {
      parsedStatusMessage = null;
    }
  }

  for (const candidate of [
    parsedStatusMessage,
    response?.details,
    response,
  ]) {
    if (Array.isArray(candidate?.data)) return candidate.data;
  }

  return [];
};

const fetchViaCoql = async (ZOHO) => {
  if (typeof ZOHO?.CRM?.CONNECTION?.invoke !== "function") return [];

  const { name, category, parentType, sortOrder, active } = FIELDS;
  for (const moduleApiName of MODULE_API_NAMES) {
    const selectQuery =
      `select ${name}, ${category}, ${parentType}, ${sortOrder}, ${active} ` +
      `from ${moduleApiName} where ${active} = true ` +
      `order by ${sortOrder} asc LIMIT 0, 2000`;

    try {
      const response = await ZOHO.CRM.CONNECTION.invoke(CONNECTION_NAME, {
        url: COQL_URL,
        method: "POST",
        param_type: 2,
        parameters: { select_query: selectQuery },
      });
      const records = parseCoqlRecords(response);
      if (records.length > 0) return records;
    } catch (error) {
      console.warn(
        `COQL picklist fetch failed for ${moduleApiName}:`,
        error
      );
    }
  }

  return [];
};

const pushUnique = (values, value) => {
  if (value && !values.includes(value)) values.push(value);
};

export const groupPicklistConfigRecords = (records) => {
  const types = [];
  const results = {};
  const regarding = {};
  const durations = [];

  const sortedRecords = [...records].sort(
    (left, right) =>
      (Number(fieldValue(left?.[FIELDS.sortOrder])) || 9999) -
      (Number(fieldValue(right?.[FIELDS.sortOrder])) || 9999)
  );

  for (const record of sortedRecords) {
    const category = fieldValue(record?.[FIELDS.category]);
    const value = fieldValue(record?.[FIELDS.name]);
    const parent = fieldValue(record?.[FIELDS.parentType]) || "_default";
    if (!value) continue;

    if (category === "Type") {
      pushUnique(types, value);
    } else if (category === "Result") {
      if (!results[parent]) results[parent] = [];
      pushUnique(results[parent], value);
    } else if (category === "Regarding") {
      if (!regarding[parent]) regarding[parent] = [];
      pushUnique(regarding[parent], value);
    } else if (category === "Duration") {
      const minutes = Number.parseInt(value, 10);
      if (Number.isFinite(minutes)) pushUnique(durations, minutes);
    }
  }

  const resultMapping = Object.fromEntries(
    Object.entries(results)
      .filter(([parent, values]) => parent !== "_default" && values.length > 0)
      .map(([parent, values]) => [parent, values[0]])
  );

  const hasConfiguredValues =
    types.length > 0 ||
    Object.keys(results).length > 0 ||
    Object.keys(regarding).length > 0 ||
    durations.length > 0;

  if (!hasConfiguredValues) return buildFallbackConfig();

  return {
    types: types.length > 0 ? types : [...DEFAULT_ACTIVITY_TYPES],
    results: Object.keys(results).length > 0 ? results : null,
    resultMapping:
      Object.keys(resultMapping).length > 0
        ? resultMapping
        : { ...defaultResultMapping },
    regarding: Object.keys(regarding).length > 0 ? regarding : null,
    durations:
      durations.length > 0 ? durations : [...DEFAULT_DURATION_OPTIONS],
    _source: "custom_module",
  };
};

const doFetch = async (ZOHO) => {
  if (!ZOHO?.CRM) {
    console.warn("Widget_Picklist_Config: ZOHO.CRM is not ready yet.");
    return buildFallbackConfig();
  }

  try {
    let records = await fetchViaSdk(ZOHO);
    if (records.length === 0) records = await fetchViaCoql(ZOHO);

    const activeRecords = records.filter(isActive);
    if (activeRecords.length === 0) {
      console.warn(
        "Widget_Picklist_Config: no active records returned; using defaults."
      );
      return buildFallbackConfig();
    }

    return groupPicklistConfigRecords(activeRecords);
  } catch (error) {
    console.warn(
      "Widget_Picklist_Config: fetch failed; using defaults.",
      error
    );
    return buildFallbackConfig();
  }
};

export const fetchPicklistConfig = async (ZOHO = window.ZOHO) => {
  if (cachedConfig?._source === "custom_module") return cachedConfig;
  if (fetchPromise) return fetchPromise;

  fetchPromise = doFetch(ZOHO);
  try {
    const config = await fetchPromise;
    if (config?._source === "custom_module") cachedConfig = config;
    return config;
  } finally {
    fetchPromise = null;
  }
};

export const clearPicklistConfigCache = () => {
  cachedConfig = null;
  fetchPromise = null;
};

export const getTypeOptionsFromConfig = (config) =>
  config?.types?.length ? config.types : DEFAULT_ACTIVITY_TYPES;

export const getResultOptionsFromConfig = (type, config) => {
  const configured = config?.results?.[type] || config?.results?._default;
  return configured?.length ? configured : null;
};

export const getRegardingOptionsFromConfig = (type, config) => {
  const configured = config?.regarding?.[type] || config?.regarding?._default;
  return configured?.length ? configured : null;
};

export const getDurationOptionsFromConfig = (config) =>
  config?.durations?.length ? config.durations : DEFAULT_DURATION_OPTIONS;

export const getResultMappingFromConfig = (config) =>
  config?.resultMapping && Object.keys(config.resultMapping).length > 0
    ? config.resultMapping
    : defaultResultMapping;
