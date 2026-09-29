import { describe, expect, it, vi } from "vitest";
import {
  loadActivityFilterPreferences,
  saveActivityFilters,
  saveLatestActivityFilter,
} from "./activityFilterPreferences";

const makeZoho = (records = null) => ({
  CRM: {
    API: {
      searchRecord: vi.fn().mockResolvedValue({
        data: Array.isArray(records) ? records : records ? [records] : [],
      }),
      updateRecord: vi.fn().mockResolvedValue({
        data: [{ code: "SUCCESS", status: "success" }],
      }),
      insertRecord: vi.fn().mockResolvedValue({
        data: [{ code: "SUCCESS", status: "success" }],
      }),
    },
  },
});

const activityFilter = {
  name: "Follow ups",
  filterType: ["To-Do"],
  filterPriority: ["High"],
  filterUser: ["Alice"],
  filterStaff: ["12345"],
  filterDate: "Current Month",
  showCleared: true,
};

const dedicatedRecord = (overrides = {}) => ({
  id: "all-activity-preference",
  Name: "All Activity Preference",
  Saved_Filters: JSON.stringify([activityFilter]),
  Latest_Filter: JSON.stringify({ filterType: ["Meeting"] }),
  ...overrides,
});

describe("activityFilterPreferences", () => {
  it("selects and updates the dedicated All Activity row when Calendar is returned first", async () => {
    const calendar = {
      id: "calendar-preference",
      Name: "Calendar Preference",
      Saved_Filters: JSON.stringify([{ name: "Calendar" }]),
      Latest_Filter: JSON.stringify({ priorityFilter: ["Low"] }),
    };
    const zoho = makeZoho([calendar, dedicatedRecord()]);

    await expect(loadActivityFilterPreferences(zoho, "user-1")).resolves.toEqual({
      savedFilters: [activityFilter],
      latestFilter: {
        filterType: ["Meeting"],
        filterPriority: [],
        filterUser: [],
        filterStaff: [],
      },
    });

    await saveActivityFilters(zoho, "user-1", "Alice", [activityFilter]);

    expect(zoho.CRM.API.searchRecord).toHaveBeenCalledWith({
      Entity: "User_Preferences",
      Type: "criteria",
      Query: "(Preference_Of:equals:user-1)",
    });
    expect(zoho.CRM.API.updateRecord).toHaveBeenCalledWith({
      Entity: "User_Preferences",
      RecordID: "all-activity-preference",
      APIData: {
        id: "all-activity-preference",
        Saved_Filters: JSON.stringify([activityFilter]),
      },
    });
    expect(zoho.CRM.API.insertRecord).not.toHaveBeenCalled();
  });

  it("reads tagged shared data only as a legacy fallback and strips its marker", async () => {
    const zoho = makeZoho({
      id: "legacy-calendar-preference",
      Name: "Alice - Preference",
      Saved_Filters: JSON.stringify([
        { name: "Calendar", priorityFilter: ["High"] },
        { widget: "allActivity", ...activityFilter },
      ]),
      Latest_Filter: JSON.stringify({
        priorityFilter: ["Low"],
        allActivity: { filterType: ["Call"], filterUser: ["Alice"] },
      }),
    });

    await expect(loadActivityFilterPreferences(zoho, "user-1")).resolves.toEqual({
      savedFilters: [activityFilter],
      latestFilter: {
        filterType: ["Call"],
        filterPriority: [],
        filterUser: ["Alice"],
        filterStaff: [],
      },
    });
  });

  it("does not fall back to Calendar when a dedicated row exists", async () => {
    const zoho = makeZoho([
      {
        id: "legacy-calendar-preference",
        Saved_Filters: JSON.stringify([
          { widget: "allActivity", name: "Legacy preset" },
        ]),
        Latest_Filter: JSON.stringify({
          allActivity: { filterType: ["Legacy"] },
        }),
      },
      dedicatedRecord({ Saved_Filters: "[]", Latest_Filter: "" }),
    ]);

    await expect(loadActivityFilterPreferences(zoho, "user-1")).resolves.toEqual({
      savedFilters: [],
      latestFilter: null,
    });
  });

  it("still loads dedicated presets when its latest data is malformed", async () => {
    const zoho = makeZoho(dedicatedRecord({ Latest_Filter: "not JSON" }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(await loadActivityFilterPreferences(zoho, "user-1")).toEqual({
        savedFilters: [activityFilter],
        latestFilter: null,
      });
    } finally {
      warning.mockRestore();
    }
  });

  it("updates latest state directly without rewriting saved presets", async () => {
    const zoho = makeZoho(dedicatedRecord());

    await saveLatestActivityFilter(zoho, "user-1", activityFilter);

    expect(zoho.CRM.API.updateRecord).toHaveBeenCalledWith({
      Entity: "User_Preferences",
      RecordID: "all-activity-preference",
      APIData: {
        id: "all-activity-preference",
        Latest_Filter: JSON.stringify(activityFilter),
      },
    });
    expect(zoho.CRM.API.updateRecord.mock.calls[0][0].APIData).not.toHaveProperty(
      "Saved_Filters"
    );
  });

  it("migrates legacy presets when the first dedicated write saves latest state", async () => {
    const zoho = makeZoho({
      id: "legacy-calendar-preference",
      Name: "Alice - Preference",
      Saved_Filters: JSON.stringify([
        { name: "Calendar" },
        { widget: "allActivity", ...activityFilter },
      ]),
      Latest_Filter: JSON.stringify({ priorityFilter: ["Low"] }),
    });

    await saveLatestActivityFilter(zoho, "user-1", {
      filterType: ["Meeting"],
    });

    const request = zoho.CRM.API.insertRecord.mock.calls[0][0];
    expect(request).toEqual({
      Entity: "User_Preferences",
      APIData: {
        Name: "All Activity Preference",
        Preference_Of: "user-1",
        Saved_Filters: JSON.stringify([activityFilter]),
        Latest_Filter: JSON.stringify({
          filterType: ["Meeting"],
          filterPriority: [],
          filterUser: [],
          filterStaff: [],
        }),
      },
    });
    expect(zoho.CRM.API.updateRecord).not.toHaveBeenCalled();
  });

  it("migrates legacy latest state when the first dedicated write saves presets", async () => {
    const zoho = makeZoho({
      id: "legacy-calendar-preference",
      Name: "Alice - Preference",
      Saved_Filters: JSON.stringify([{ name: "Calendar" }]),
      Latest_Filter: JSON.stringify({
        priorityFilter: ["Low"],
        allActivity: { filterType: ["Call"], filterStaff: ["12345"] },
      }),
    });

    await saveActivityFilters(zoho, "user-1", "Alice", [
      { widget: "allActivity", ...activityFilter },
    ]);

    const request = zoho.CRM.API.insertRecord.mock.calls[0][0];
    expect(request.APIData).toMatchObject({
      Name: "All Activity Preference",
      Preference_Of: "user-1",
      Saved_Filters: JSON.stringify([activityFilter]),
    });
    expect(JSON.parse(request.APIData.Latest_Filter)).toEqual({
      filterType: ["Call"],
      filterStaff: ["12345"],
      filterPriority: [],
      filterUser: [],
    });
    expect(zoho.CRM.API.updateRecord).not.toHaveBeenCalled();
  });

  it("creates an isolated preference row when no prior preference exists", async () => {
    const zoho = makeZoho();
    zoho.CRM.API.searchRecord.mockResolvedValue({
      code: "NO_DATA",
      status: "error",
    });

    await saveActivityFilters(zoho, "user-1", "Alice", [activityFilter]);

    expect(zoho.CRM.API.insertRecord).toHaveBeenCalledWith({
      Entity: "User_Preferences",
      APIData: {
        Name: "All Activity Preference",
        Preference_Of: "user-1",
        Saved_Filters: JSON.stringify([activityFilter]),
      },
    });
  });

  it("rejects failed writes and malformed dedicated data without touching Calendar", async () => {
    const failedWrite = makeZoho(dedicatedRecord());
    failedWrite.CRM.API.updateRecord.mockResolvedValue({
      data: [{ code: "INVALID_DATA", message: "Permission denied" }],
    });
    await expect(
      saveActivityFilters(failedWrite, "user-1", "Alice", [activityFilter])
    ).rejects.toThrow("Permission denied");

    const malformed = makeZoho(
      dedicatedRecord({ Saved_Filters: "not JSON" })
    );
    await expect(
      saveActivityFilters(malformed, "user-1", "Alice", [activityFilter])
    ).rejects.toThrow("Invalid Saved_Filters JSON");
    expect(malformed.CRM.API.updateRecord).not.toHaveBeenCalled();
  });

  it("handles missing user or SDK without writing", async () => {
    expect(await loadActivityFilterPreferences(null, "user-1")).toEqual({
      savedFilters: [],
      latestFilter: null,
    });
    await expect(
      saveActivityFilters(null, "user-1", "Alice", [])
    ).rejects.toThrow("Zoho CRM API is unavailable");
    await expect(saveLatestActivityFilter(makeZoho(), "", {})).rejects.toThrow(
      "User id required"
    );
  });

  it("rejects a failed lookup instead of replacing preferences as empty", async () => {
    const zoho = makeZoho();
    zoho.CRM.API.searchRecord.mockRejectedValue(new Error("Network unavailable"));

    await expect(loadActivityFilterPreferences(zoho, "user-1")).rejects.toThrow(
      "Network unavailable"
    );
  });
});
