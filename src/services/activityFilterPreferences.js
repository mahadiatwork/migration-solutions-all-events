/**
 * All Activity and Activity Calendar share one User_Preferences record per user.
 * Keep Calendar's untagged Saved_Filters entries and the legacy Latest_Filter
 * fields intact when writing All Activity preferences.
 */
const MODULE = "User_Preferences";
const FIELD_USER = "Preference_Of";
const FIELD_SAVED_FILTERS = "Saved_Filters";
const FIELD_LATEST_FILTER = "Latest_Filter";
const WIDGET = "allActivity";

const emptyPreferences = () => ({ savedFilters: [], latestFilter: null });

const emptyCalendarLatest = () => ({
  priorityFilter: [],
  activityTypeFilter: [],
  userFilter: [],
});

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

const normalizeActivityFilter = (filter) => ({
  ...filter,
  filterType: Array.isArray(filter.filterType) ? filter.filterType : [],
  filterPriority: Array.isArray(filter.filterPriority) ? filter.filterPriority : [],
  filterUser: Array.isArray(filter.filterUser) ? filter.filterUser : [],
  filterStaff: Array.isArray(filter.filterStaff) ? filter.filterStaff : [],
});

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

const searchPreferenceRecord = async (api, userId) => {
  const response = await api.searchRecord({
    Entity: MODULE,
    Type: "criteria",
    Query: `(${FIELD_USER}:equals:${userId})`,
  });
  if (!response) throw new Error("Zoho returned no User_Preferences response");
  if (response?.code === "NO_DATA") return null;
  if (
    (response?.code && response.code !== "SUCCESS") ||
    String(response?.status || "").toLowerCase() === "error"
  ) {
    throw new Error(errorMessage(response, "Failed to load User_Preferences"));
  }
  const records = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.details)
      ? response.details
      : [];
  return records[0] || null;
};

const requireApi = (ZOHO, userId) => {
  if (!userId) throw new Error("User id required to save activity filters");
  const api = ZOHO?.CRM?.API;
  if (typeof api?.searchRecord !== "function") {
    throw new Error("Zoho CRM API is unavailable");
  }
  return api;
};

const writePreference = async (api, record, userId, userDisplayName, fields) => {
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
      Name: userDisplayName?.trim()
        ? `${userDisplayName.trim()} - Preference`
        : "User - Preference",
      [FIELD_USER]: userId,
      ...fields,
    },
  });
  assertWriteSucceeded(response, "create activity filters");
};

/** Read only this widget's preferences from the user's shared CRM record. */
export async function loadActivityFilterPreferences(ZOHO, userId) {
  if (!userId || typeof ZOHO?.CRM?.API?.searchRecord !== "function") {
    return emptyPreferences();
  }

  try {
    const record = await searchPreferenceRecord(ZOHO.CRM.API, userId);
    if (!record) return emptyPreferences();
    let allFilters = [];
    let latest = emptyCalendarLatest();
    try {
      allFilters = parseJsonField(
        record[FIELD_SAVED_FILTERS],
        FIELD_SAVED_FILTERS,
        []
      );
    } catch (error) {
      console.warn("Could not parse All Activity saved filters", error);
    }
    try {
      latest = parseJsonField(
        record[FIELD_LATEST_FILTER],
        FIELD_LATEST_FILTER,
        emptyCalendarLatest()
      );
    } catch (error) {
      console.warn("Could not parse All Activity latest filter", error);
    }
    return {
      savedFilters: allFilters
        .filter((filter) => isObject(filter) && filter.widget === WIDGET)
        .map(normalizeActivityFilter),
      latestFilter: isObject(latest.allActivity)
        ? normalizeActivityFilter(latest.allActivity)
        : null,
    };
  } catch (error) {
    if (error?.code === "NO_DATA") return emptyPreferences();
    throw error;
  }
}

/** Replace only All Activity presets; preserve Calendar and other widget entries. */
export async function saveActivityFilters(
  ZOHO,
  userId,
  userDisplayName,
  filtersArray
) {
  if (!Array.isArray(filtersArray) || !filtersArray.every(isObject)) {
    throw new Error("Activity filters must be an array of filter objects");
  }
  const api = requireApi(ZOHO, userId);
  const record = await searchPreferenceRecord(api, userId);
  const existing = record
    ? parseJsonField(record[FIELD_SAVED_FILTERS], FIELD_SAVED_FILTERS, [])
    : [];
  const otherFilters = existing.filter(
    (filter) => !isObject(filter) || filter.widget !== WIDGET
  );
  const activityFilters = filtersArray.map((filter) => ({
    ...normalizeActivityFilter(filter),
    widget: WIDGET,
  }));
  await writePreference(api, record, userId, userDisplayName, {
    [FIELD_SAVED_FILTERS]: JSON.stringify([...otherFilters, ...activityFilters]),
    ...(!record && {
      [FIELD_LATEST_FILTER]: JSON.stringify(emptyCalendarLatest()),
    }),
  });
}

/** Merge the latest All Activity selection into Calendar's legacy object. */
export async function saveLatestActivityFilter(ZOHO, userId, filter) {
  if (!isObject(filter)) throw new Error("Latest activity filter must be an object");
  const api = requireApi(ZOHO, userId);
  const record = await searchPreferenceRecord(api, userId);
  const latest = record
    ? parseJsonField(
        record[FIELD_LATEST_FILTER],
        FIELD_LATEST_FILTER,
        emptyCalendarLatest()
      )
    : emptyCalendarLatest();
  const mergedLatest = {
    ...emptyCalendarLatest(),
    ...latest,
    allActivity: normalizeActivityFilter(filter),
  };
  await writePreference(api, record, userId, null, {
    [FIELD_LATEST_FILTER]: JSON.stringify(mergedLatest),
    ...(!record && { [FIELD_SAVED_FILTERS]: JSON.stringify([]) }),
  });
}
