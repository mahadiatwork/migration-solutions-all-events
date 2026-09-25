import { describe, expect, it, vi } from "vitest";
import {
  loadActivityFilterPreferences,
  saveActivityFilters,
  saveLatestActivityFilter,
} from "./activityFilterPreferences";

const makeZoho = (record = null) => ({
  CRM: {
    API: {
      searchRecord: vi.fn().mockResolvedValue({ data: record ? [record] : [] }),
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

describe("activityFilterPreferences", () => {
  it("loads only All Activity presets and its latest filter", async () => {
    const zoho = makeZoho({
      Saved_Filters: JSON.stringify([
        { name: "Calendar", priorityFilter: ["High"] },
        { widget: "other", name: "Other" },
        { widget: "allActivity", ...activityFilter },
      ]),
      Latest_Filter: JSON.stringify({
        priorityFilter: ["Low"],
        activityTypeFilter: [],
        userFilter: ["Alice"],
        allActivity: { filterType: ["Meeting"], showCleared: false },
      }),
    });

    expect(await loadActivityFilterPreferences(zoho, "user-1")).toEqual({
      savedFilters: [{ widget: "allActivity", ...activityFilter }],
      latestFilter: {
        filterType: ["Meeting"],
        filterPriority: [],
        filterUser: [],
        filterStaff: [],
        showCleared: false,
      },
    });
    expect(zoho.CRM.API.searchRecord).toHaveBeenCalledWith({
      Entity: "User_Preferences",
      Type: "criteria",
      Query: "(Preference_Of:equals:user-1)",
    });
  });

  it("still loads saved presets when latest data is malformed", async () => {
    const zoho = makeZoho({
      Saved_Filters: JSON.stringify([{ widget: "allActivity", ...activityFilter }]),
      Latest_Filter: "not JSON",
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(await loadActivityFilterPreferences(zoho, "user-1")).toEqual({
        savedFilters: [{ widget: "allActivity", ...activityFilter }],
        latestFilter: null,
      });
    } finally {
      warning.mockRestore();
    }
  });

  it("replaces only tagged presets while preserving Calendar and other entries", async () => {
    const calendar = {
      name: "Calendar",
      priorityFilter: ["High"],
      activityTypeFilter: ["Meeting"],
      userFilter: ["Alice"],
    };
    const other = { widget: "anotherWidget", name: "Other" };
    const zoho = makeZoho({
      id: "record-1",
      Saved_Filters: JSON.stringify([
        calendar,
        { widget: "allActivity", name: "Old" },
        other,
      ]),
      Latest_Filter: JSON.stringify({ priorityFilter: ["Low"] }),
    });

    await saveActivityFilters(zoho, "user-1", "Alice", [activityFilter]);

    expect(zoho.CRM.API.updateRecord).toHaveBeenCalledOnce();
    const request = zoho.CRM.API.updateRecord.mock.calls[0][0];
    expect(request).toMatchObject({
      Entity: "User_Preferences",
      RecordID: "record-1",
      APIData: { id: "record-1" },
    });
    expect(JSON.parse(request.APIData.Saved_Filters)).toEqual([
      calendar,
      other,
      { ...activityFilter, widget: "allActivity" },
    ]);
    expect(request.APIData).not.toHaveProperty("Latest_Filter");
    expect(zoho.CRM.API.insertRecord).not.toHaveBeenCalled();
  });

  it("merges latest All Activity state without changing Calendar's legacy fields", async () => {
    const zoho = makeZoho({
      id: "record-2",
      Saved_Filters: JSON.stringify([{ name: "Calendar" }]),
      Latest_Filter: JSON.stringify({
        priorityFilter: ["High"],
        activityTypeFilter: ["Meeting"],
        userFilter: ["Alice"],
        selectedColumns: ["user-1"],
        allActivity: { filterType: ["Old"] },
      }),
    });

    await saveLatestActivityFilter(zoho, "user-1", activityFilter);

    const request = zoho.CRM.API.updateRecord.mock.calls[0][0];
    expect(JSON.parse(request.APIData.Latest_Filter)).toEqual({
      priorityFilter: ["High"],
      activityTypeFilter: ["Meeting"],
      userFilter: ["Alice"],
      selectedColumns: ["user-1"],
      allActivity: activityFilter,
    });
    expect(request.APIData).not.toHaveProperty("Saved_Filters");
  });

  it("creates a preference record when saving the latest filter first", async () => {
    const zoho = makeZoho();

    await saveLatestActivityFilter(zoho, "user-1", activityFilter);

    const request = zoho.CRM.API.insertRecord.mock.calls[0][0];
    expect(request).toMatchObject({
      Entity: "User_Preferences",
      APIData: {
        Name: "User - Preference",
        Preference_Of: "user-1",
        Saved_Filters: "[]",
      },
    });
    expect(JSON.parse(request.APIData.Latest_Filter)).toEqual({
      priorityFilter: [],
      activityTypeFilter: [],
      userFilter: [],
      allActivity: activityFilter,
    });
  });

  it("creates a preference record with a tagged preset and Calendar-compatible latest", async () => {
    const zoho = makeZoho();
    zoho.CRM.API.searchRecord.mockResolvedValue({ code: "NO_DATA", status: "error" });

    await saveActivityFilters(zoho, "user-1", "Alice", [activityFilter]);

    const request = zoho.CRM.API.insertRecord.mock.calls[0][0];
    expect(request.APIData).toMatchObject({
      Name: "Alice - Preference",
      Preference_Of: "user-1",
    });
    expect(JSON.parse(request.APIData.Saved_Filters)).toEqual([
      { ...activityFilter, widget: "allActivity" },
    ]);
    expect(JSON.parse(request.APIData.Latest_Filter)).toEqual({
      priorityFilter: [],
      activityTypeFilter: [],
      userFilter: [],
    });
  });

  it("rejects failed Zoho writes and malformed shared data instead of overwriting it", async () => {
    const failedWrite = makeZoho({ id: "record-3", Saved_Filters: "[]" });
    failedWrite.CRM.API.updateRecord.mockResolvedValue({
      data: [{ code: "INVALID_DATA", message: "Permission denied" }],
    });
    await expect(
      saveActivityFilters(failedWrite, "user-1", "Alice", [activityFilter])
    ).rejects.toThrow("Permission denied");

    const malformed = makeZoho({ id: "record-4", Saved_Filters: "not JSON" });
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
    await expect(saveActivityFilters(null, "user-1", "Alice", [])).rejects.toThrow(
      "Zoho CRM API is unavailable"
    );
    await expect(saveLatestActivityFilter(makeZoho(), "", {})).rejects.toThrow(
      "User id required"
    );
  });

  it("rejects a failed preference lookup so existing presets cannot be replaced as an empty list", async () => {
    const zoho = makeZoho();
    zoho.CRM.API.searchRecord.mockRejectedValue(new Error("Network unavailable"));

    await expect(loadActivityFilterPreferences(zoho, "user-1")).rejects.toThrow(
      "Network unavailable"
    );
  });
});
