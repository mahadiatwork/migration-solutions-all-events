const MODULE = "User_Preferences";
const FIELD_NAME = "Name";
const FIELD_USER = "Preference_Of";
const FIELD_SAVED_FILTERS = "Saved_Filters";
const FIELD_LATEST_FILTER = "Latest_Filter";
const PREFERENCE_NAME = "All Activity Preference";
const LEGACY_WIDGET = "allActivity";

const emptyPreferences = () => ({ savedFilters: [], latestFilter: null });

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseJsonField = (raw, field, fallback) => {
  if (raw == null || raw === "") return fallback;
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error(`Invalid ${field} JSON in User_Preferences`);
  }
  if (field === FIELD_SAVED_FILTERS && !Array.isArray(value)) {
    throw new Error(`${field} must contain a JSON array`);
  }
  if (field === FIELD_LATEST_FILTER && !isObject(value)) {
    throw new Error(`${field} must contain a JSON object`);
  }
  return value;
};

const normalizeActivityFilter = (filter) => {
  const normalized = { ...filter };
  delete normalized.widget;
  return {
    ...normalized,
    filterType: Array.isArray(filter.filterType) ? filter.filterType : [],
    filterPriority: Array.isArray(filter.filterPriority)
      ? filter.filterPriority
      : [],
    filterUser: Array.isArray(filter.filterUser) ? filter.filterUser : [],
    filterStaff: Array.isArray(filter.filterStaff) ? filter.filterStaff : [],
  };
};

const errorMessage = (result, fallback) =>
  result?.details?.message || result?.message || fallback;

const assertWriteSucceeded = (response, action) => {
  const result = Array.isArray(response?.data) ? response.data[0] : response;
  if (!result) throw new Error(`Zoho returned no response for ${action}`);
  if (
    (result.code && result.code !== "SUCCESS") ||
    String(result.status || "").toLowerCase() === "error"
  ) {
    throw new Error(errorMessage(result, `Failed to ${action}`));
  }
};

const searchPreferenceRecords = async (api, userId) => {
  const response = await api.searchRecord({
    Entity: MODULE,
    Type: "criteria",
    Query: `(${FIELD_USER}:equals:${userId})`,
  });
  if (!response) throw new Error("Zoho returned no User_Preferences response");
  if (response?.code === "NO_DATA") return [];
  if (
    (response?.code && response.code !== "SUCCESS") ||
    String(response?.status || "").toLowerCase() === "error"
  ) {
    throw new Error(errorMessage(response, "Failed to load User_Preferences"));
  }
  return Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.details)
      ? response.details
      : [];
};

const findActivityPreference = (records) =>
  records.find((record) => record?.[FIELD_NAME] === PREFERENCE_NAME) || null;

const readLegacySavedFilters = (records) => {
  for (const record of records) {
    let filters;
    try {
      filters = parseJsonField(
        record?.[FIELD_SAVED_FILTERS],
        FIELD_SAVED_FILTERS,
        []
      );
    } catch (error) {
      console.warn("Could not parse legacy All Activity saved filters", error);
      continue;
    }
    const activityFilters = filters.filter(
      (filter) => isObject(filter) && filter.widget === LEGACY_WIDGET
    );
    if (activityFilters.length > 0) {
      return activityFilters.map(normalizeActivityFilter);
    }
  }
  return [];
};

const readLegacyLatestFilter = (records) => {
  for (const record of records) {
    let latest;
    try {
      latest = parseJsonField(
        record?.[FIELD_LATEST_FILTER],
        FIELD_LATEST_FILTER,
        {}
      );
    } catch (error) {
      console.warn("Could not parse legacy All Activity latest filter", error);
      continue;
    }
    if (isObject(latest.allActivity)) {
      return normalizeActivityFilter(latest.allActivity);
    }
  }
  return null;
};

const loadDedicatedPreferences = (record) => {
  let savedFilters = [];
  let latestFilter = null;
  try {
    savedFilters = parseJsonField(
      record[FIELD_SAVED_FILTERS],
      FIELD_SAVED_FILTERS,
      []
    )
      .filter(isObject)
      .map(normalizeActivityFilter);
  } catch (error) {
    console.warn("Could not parse All Activity saved filters", error);
  }
  try {
    const latest = parseJsonField(
      record[FIELD_LATEST_FILTER],
      FIELD_LATEST_FILTER,
      null
    );
    latestFilter = isObject(latest) ? normalizeActivityFilter(latest) : null;
  } catch (error) {
    console.warn("Could not parse All Activity latest filter", error);
  }
  return { savedFilters, latestFilter };
};

const requireApi = (ZOHO, userId) => {
  if (!userId) throw new Error("User id required to save activity filters");
  const api = ZOHO?.CRM?.API;
  if (typeof api?.searchRecord !== "function") {
    throw new Error("Zoho CRM API is unavailable");
  }
  return api;
};

const writePreference = async (api, record, userId, fields) => {
  if (record) {
    if (typeof api.updateRecord !== "function") {
      throw new Error("Zoho CRM updateRecord is unavailable");
    }
    const recordId = record.id ?? record.Id ?? record.record_id;
    if (!recordId) throw new Error("User_Preferences record has no id");
    const response = await api.updateRecord({
      Entity: MODULE,
      RecordID: String(recordId),
      APIData: { id: String(recordId), ...fields },
    });
    assertWriteSucceeded(response, "update activity filters");
    return;
  }

  if (typeof api.insertRecord !== "function") {
    throw new Error("Zoho CRM insertRecord is unavailable");
  }
  const response = await api.insertRecord({
    Entity: MODULE,
    APIData: {
      [FIELD_NAME]: PREFERENCE_NAME,
      [FIELD_USER]: userId,
      ...fields,
    },
  });
  assertWriteSucceeded(response, "create activity filters");
};

/** Load this widget's dedicated row, with a read-only fallback for shared legacy data. */
export async function loadActivityFilterPreferences(ZOHO, userId) {
  if (!userId || typeof ZOHO?.CRM?.API?.searchRecord !== "function") {
    return emptyPreferences();
  }

  try {
    const records = await searchPreferenceRecords(ZOHO.CRM.API, userId);
    const preference = findActivityPreference(records);
    if (preference) return loadDedicatedPreferences(preference);
    return {
      savedFilters: readLegacySavedFilters(records),
      latestFilter: readLegacyLatestFilter(records),
    };
  } catch (error) {
    if (error?.code === "NO_DATA") return emptyPreferences();
    throw error;
  }
}

/** Replace only the presets in the dedicated All Activity preference row. */
export async function saveActivityFilters(
  ZOHO,
  userId,
  userDisplayName,
  filtersArray
) {
  // Keep the existing call signature; record identity must not depend on a mutable name.
  void userDisplayName;
  if (!Array.isArray(filtersArray) || !filtersArray.every(isObject)) {
    throw new Error("Activity filters must be an array of filter objects");
  }
  const api = requireApi(ZOHO, userId);
  const records = await searchPreferenceRecords(api, userId);
  const preference = findActivityPreference(records);
  if (preference) {
    parseJsonField(
      preference[FIELD_SAVED_FILTERS],
      FIELD_SAVED_FILTERS,
      []
    );
  }
  const fields = {
    [FIELD_SAVED_FILTERS]: JSON.stringify(
      filtersArray.map(normalizeActivityFilter)
    ),
  };
  if (!preference) {
    const legacyLatest = readLegacyLatestFilter(records);
    if (legacyLatest) {
      fields[FIELD_LATEST_FILTER] = JSON.stringify(legacyLatest);
    }
  }
  await writePreference(api, preference, userId, fields);
}

/** Save the latest selection in the dedicated All Activity preference row. */
export async function saveLatestActivityFilter(ZOHO, userId, filter) {
  if (!isObject(filter)) {
    throw new Error("Latest activity filter must be an object");
  }
  const api = requireApi(ZOHO, userId);
  const records = await searchPreferenceRecords(api, userId);
  const preference = findActivityPreference(records);
  const fields = {
    [FIELD_LATEST_FILTER]: JSON.stringify(normalizeActivityFilter(filter)),
  };
  if (!preference) {
    fields[FIELD_SAVED_FILTERS] = JSON.stringify(
      readLegacySavedFilters(records)
    );
  }
  await writePreference(api, preference, userId, fields);
}
