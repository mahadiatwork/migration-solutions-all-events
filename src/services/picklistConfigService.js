/**
 * Loads the event/history picklist values managed in Widget_Picklist_Config.
 *
 * A successful module read is authoritative, including an empty result. The
 * widget's original hard-coded values are used only when the module cannot be
 * reached or fetched; failures are not cached so a later request can recover.
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

const FETCH_STATUS = {
  SUCCESS: "success",
  UNAVAILABLE: "unavailable",
  FAILURE: "failure",
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
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response)) return response;
  return [];
};

const hasRecordPayload = (response) =>
  Array.isArray(response?.data) ||
  Array.isArray(response?.data?.data) ||
  Array.isArray(response);

const responseEntries = (response) => [
  response,
  ...(response?.data &&
  typeof response.data === "object" &&
  !Array.isArray(response.data)
    ? [response.data]
    : []),
  ...(Array.isArray(response?.data) ? response.data : []),
  ...(Array.isArray(response?.data?.data) ? response.data.data : []),
].filter((entry) => entry && typeof entry === "object");

const isUnavailableResponse = (response) =>
  responseEntries(response).some(
    (entry) =>
      entry?.code === "INVALID_MODULE" ||
      entry?.code === "INVALID_MODULE_API_NAME"
  );

const isErrorResponse = (response) =>
  responseEntries(response).some((entry) => {
    const code = typeof entry?.code === "string" ? entry.code : "";
    return (
      entry?.status === "error" ||
      entry?.status === "failure" ||
      Number(entry?.statusCode) >= 400 ||
      (code !== "" &&
        code !== "SUCCESS" &&
        code !== "NO_DATA" &&
        code !== "NO_CONTENT" &&
        code !== "200")
    );
  });

const isSuccessfulEmptyResponse = (response) =>
  responseEntries(response).some(
    (entry) => entry?.code === "NO_DATA" || entry?.code === "NO_CONTENT"
  );

const paginateSdk = async (ZOHO, entity) => {
  const records = [];
  const perPage = 200;
  const seenPageSignatures = new Set();
  let page = 1;

  const getRecords =
    typeof ZOHO?.CRM?.API?.getAllRecords === "function"
      ? ZOHO.CRM.API.getAllRecords.bind(ZOHO.CRM.API)
      : typeof ZOHO?.CRM?.API?.getRecords === "function"
        ? ZOHO.CRM.API.getRecords.bind(ZOHO.CRM.API)
        : null;

  if (!getRecords) {
    return { status: FETCH_STATUS.UNAVAILABLE, records: [] };
  }

  while (true) {
    let response;
    try {
      response = await getRecords({
        Entity: entity,
        sort_order: "asc",
        per_page: perPage,
        page,
      });
    } catch (error) {
      console.warn(
        `Widget_Picklist_Config SDK fetch failed for ${entity} page ${page}:`,
        error
      );
      return { status: FETCH_STATUS.FAILURE, records: [] };
    }

    if (isUnavailableResponse(response)) {
      return { status: FETCH_STATUS.UNAVAILABLE, records: [] };
    }

    if (isSuccessfulEmptyResponse(response)) {
      // NO_DATA/NO_CONTENT is also used as the terminal page marker. Preserve
      // records already collected from earlier pages.
      return { status: FETCH_STATUS.SUCCESS, records };
    }

    if (isErrorResponse(response) || !hasRecordPayload(response)) {
      return { status: FETCH_STATUS.FAILURE, records: [] };
    }

    const pageRecords = extractRecords(response);
    const hasMore =
      response?.info?.more_records === true ||
      response?.info?.more_records === "true" ||
      response?.data?.info?.more_records === true ||
      response?.data?.info?.more_records === "true";
    const pageSignature = JSON.stringify(pageRecords);
    if (
      hasMore &&
      (pageRecords.length === 0 || seenPageSignatures.has(pageSignature))
    ) {
      return { status: FETCH_STATUS.FAILURE, records: [] };
    }
    seenPageSignatures.add(pageSignature);
    records.push(...pageRecords);
    if (!hasMore) break;
    page += 1;
  }

  return { status: FETCH_STATUS.SUCCESS, records };
};

const fetchViaSdk = async (ZOHO) => {
  for (const entity of MODULE_API_NAMES) {
    const result = await paginateSdk(ZOHO, entity);
    if (result.status === FETCH_STATUS.SUCCESS) return result;
    if (result.status === FETCH_STATUS.FAILURE) return result;
  }
  return { status: FETCH_STATUS.UNAVAILABLE, records: [] };
};

const parseCoqlPage = (response) => {
  const statusMessage = response?.details?.statusMessage;
  let parsedStatusMessage = statusMessage;

  if (typeof statusMessage === "string" && statusMessage.trim()) {
    try {
      parsedStatusMessage = JSON.parse(statusMessage);
    } catch {
      parsedStatusMessage = null;
    }
  }

  const candidates = [
    parsedStatusMessage,
    response?.details,
    response?.data &&
    typeof response.data === "object" &&
    !Array.isArray(response.data)
      ? response.data
      : null,
    response,
  ].filter((candidate) => candidate && typeof candidate === "object");

  let records = null;
  let hasMoreMetadata = false;
  let moreRecords = false;
  for (const candidate of candidates) {
    if (records === null && Array.isArray(candidate.data)) {
      records = candidate.data;
    }
    if (candidate?.info?.more_records != null) {
      hasMoreMetadata = true;
      moreRecords =
        candidate.info.more_records === true ||
        candidate.info.more_records === "true";
    }
  }

  return { records, hasMoreMetadata, moreRecords };
};

const coqlResponseEntries = (response) => {
  const statusMessage = response?.details?.statusMessage;
  let parsedStatusMessage = statusMessage;
  if (typeof statusMessage === "string" && statusMessage.trim()) {
    try {
      parsedStatusMessage = JSON.parse(statusMessage);
    } catch {
      parsedStatusMessage = null;
    }
  }

  return [
    response,
    ...(response?.data &&
    typeof response.data === "object" &&
    !Array.isArray(response.data)
      ? [response.data]
      : []),
    response?.details,
    parsedStatusMessage,
    ...(Array.isArray(response?.data) ? response.data : []),
    ...(Array.isArray(parsedStatusMessage?.data)
      ? parsedStatusMessage.data
      : []),
  ].filter((entry) => entry && typeof entry === "object");
};

const isUnavailableCoqlResponse = (response) =>
  coqlResponseEntries(response).some(
    (entry) =>
      entry?.code === "INVALID_MODULE" ||
      entry?.code === "INVALID_MODULE_API_NAME"
  );

const isErrorCoqlResponse = (response) =>
  coqlResponseEntries(response).some((entry) => {
    const code = typeof entry?.code === "string" ? entry.code : "";
    return (
      entry?.status === "error" ||
      entry?.status === "failure" ||
      Number(entry?.statusCode) >= 400 ||
      (code !== "" &&
        code !== "SUCCESS" &&
        code !== "NO_DATA" &&
        code !== "NO_CONTENT" &&
        code !== "200")
    );
  });

const isSuccessfulEmptyCoqlResponse = (response) =>
  coqlResponseEntries(response).some(
    (entry) => entry?.code === "NO_DATA" || entry?.code === "NO_CONTENT"
  );

const fetchViaCoql = async (ZOHO) => {
  if (typeof ZOHO?.CRM?.CONNECTION?.invoke !== "function") {
    return { status: FETCH_STATUS.UNAVAILABLE, records: [] };
  }

  const { name, category, parentType, sortOrder, active } = FIELDS;
  const pageSize = 2000;
  for (const moduleApiName of MODULE_API_NAMES) {
    const records = [];
    const seenPageSignatures = new Set();
    let offset = 0;

    while (true) {
      const selectQuery =
        `select ${name}, ${category}, ${parentType}, ${sortOrder}, ${active} ` +
        `from ${moduleApiName} where ${active} = true ` +
        `order by ${sortOrder} asc LIMIT ${offset}, ${pageSize}`;

      try {
        const response = await ZOHO.CRM.CONNECTION.invoke(CONNECTION_NAME, {
          url: COQL_URL,
          method: "POST",
          param_type: 2,
          parameters: { select_query: selectQuery },
        });
        if (isSuccessfulEmptyCoqlResponse(response)) {
          return { status: FETCH_STATUS.SUCCESS, records };
        }
        if (
          isUnavailableCoqlResponse(response) ||
          isErrorCoqlResponse(response)
        ) {
          break;
        }
        const parsedPage = parseCoqlPage(response);
        const pageRecords = parsedPage.records;
        if (pageRecords === null) break;

        const pageSignature = JSON.stringify(pageRecords);
        const shouldContinue = parsedPage.hasMoreMetadata
          ? parsedPage.moreRecords
          : pageRecords.length === pageSize;
        if (
          shouldContinue &&
          (pageRecords.length === 0 ||
            seenPageSignatures.has(pageSignature))
        ) {
          break;
        }
        seenPageSignatures.add(pageSignature);
        records.push(...pageRecords);
        if (!shouldContinue) {
          return { status: FETCH_STATUS.SUCCESS, records };
        }
        offset += pageSize;
      } catch (error) {
        console.warn(
          `COQL picklist fetch failed for ${moduleApiName}:`,
          error
        );
        break;
      }
    }
  }

  return { status: FETCH_STATUS.FAILURE, records: [] };
};

const pushUnique = (values, value) => {
  if (value !== "" && value != null && !values.includes(value)) {
    values.push(value);
  }
};

const normalizeCategory = (value) => {
  const category = fieldValue(value).trim().toLowerCase();
  if (category === "type" || category === "history type") return "Type";
  if (category === "result" || category === "history result") return "Result";
  if (category === "regarding") return "Regarding";
  if (category === "duration") return "Duration";
  return "";
};

const sortRank = (value) => {
  const rawValue = value && typeof value === "object"
    ? value.actual_value ?? value.display_value ?? value.name ?? value.Name
    : value;
  // Missing ranks belong after every configured priority; zero is valid.
  if (
    (typeof rawValue !== "string" && typeof rawValue !== "number") ||
    (typeof rawValue === "string" && rawValue.trim() === "")
  ) return Infinity;
  const rank = Number(rawValue);
  return Number.isFinite(rank) ? rank : Infinity;
};

export const groupPicklistConfigRecords = (records) => {
  const types = [];
  const results = {};
  const regarding = {};
  const durations = [];

  const sortedRecords = [...records].sort(
    (left, right) =>
      sortRank(left?.[FIELDS.sortOrder]) - sortRank(right?.[FIELDS.sortOrder])
  );

  for (const record of sortedRecords) {
    const category = normalizeCategory(record?.[FIELDS.category]);
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

  return {
    types,
    results,
    resultMapping,
    regarding,
    durations,
    _source: "custom_module",
  };
};

const doFetch = async (ZOHO) => {
  if (!ZOHO?.CRM) {
    console.warn("Widget_Picklist_Config: ZOHO.CRM is not ready yet.");
    return buildFallbackConfig();
  }

  try {
    const sdkResult = await fetchViaSdk(ZOHO);
    const fetchResult =
      sdkResult.status === FETCH_STATUS.SUCCESS
        ? sdkResult
        : await fetchViaCoql(ZOHO);

    if (fetchResult.status !== FETCH_STATUS.SUCCESS) {
      console.warn(
        "Widget_Picklist_Config: module unavailable or fetch failed; using defaults."
      );
      return buildFallbackConfig();
    }

    const activeRecords = fetchResult.records.filter(isActive);
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
  config?._source === "custom_module"
    ? Array.isArray(config.types)
      ? config.types
      : []
    : config?.types?.length
      ? config.types
      : DEFAULT_ACTIVITY_TYPES;

const getScopedOptions = (optionsByParent, type) => {
  if (!optionsByParent || typeof optionsByParent !== "object") return [];
  if (Object.prototype.hasOwnProperty.call(optionsByParent, type)) {
    return Array.isArray(optionsByParent[type]) ? optionsByParent[type] : [];
  }
  if (Object.prototype.hasOwnProperty.call(optionsByParent, "_default")) {
    return Array.isArray(optionsByParent._default)
      ? optionsByParent._default
      : [];
  }
  return [];
};

export const getResultOptionsFromConfig = (type, config) => {
  const configured = getScopedOptions(config?.results, type);
  if (config?._source === "custom_module") return configured;
  return configured.length ? configured : null;
};

export const getRegardingOptionsFromConfig = (type, config) => {
  const configured = getScopedOptions(config?.regarding, type);
  if (config?._source === "custom_module") return configured;
  return configured.length ? configured : null;
};

export const getDurationOptionsFromConfig = (config) =>
  config?._source === "custom_module"
    ? Array.isArray(config.durations)
      ? config.durations
      : []
    : config?.durations?.length
      ? config.durations
      : DEFAULT_DURATION_OPTIONS;

// Zoho Events require End_DateTime to be later than Start_DateTime. Keep zero
// available to history/edit flows, but never offer it for a newly created event.
export const getCreatableDurationOptionsFromConfig = (config) =>
  getDurationOptionsFromConfig(config).filter(
    (minutes) => Number.isFinite(minutes) && minutes > 0
  );

export const getResultMappingFromConfig = (config) =>
  config?._source === "custom_module"
    ? config?.resultMapping || {}
    : config?.resultMapping && Object.keys(config.resultMapping).length > 0
      ? config.resultMapping
      : defaultResultMapping;
