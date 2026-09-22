import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPicklistConfigCache,
  fetchPicklistConfig,
  groupPicklistConfigRecords,
} from "./picklistConfigService";

describe("picklistConfigService", () => {
  beforeEach(() => {
    clearPicklistConfigCache();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("sorts, normalizes, and deduplicates configured values", () => {
    const config = groupPicklistConfigRecords([
      {
        Name: "Appointment Not Completed",
        Category: "Result",
        Parent_Type: "Appointment Test",
        Sort_Order: 20,
      },
      {
        Name: { display_value: "Appointment Test" },
        Category: { actual_value: "Type" },
        Sort_Order: 10,
      },
      {
        Name: "Appointment Completed",
        Category: "Result",
        Parent_Type: { name: "Appointment Test" },
        Sort_Order: 10,
      },
      {
        Name: "Appointment Completed",
        Category: "Result",
        Parent_Type: "Appointment Test",
        Sort_Order: 10,
      },
      {
        Name: "Appointment test",
        Category: "Regarding",
        Parent_Type: "Appointment Test",
        Sort_Order: 10,
      },
      { Name: "60", Category: "Duration", Sort_Order: 10 },
    ]);

    expect(config).toMatchObject({
      types: ["Appointment Test"],
      results: {
        "Appointment Test": [
          "Appointment Completed",
          "Appointment Not Completed",
        ],
      },
      resultMapping: {
        "Appointment Test": "Appointment Completed",
      },
      regarding: { "Appointment Test": ["Appointment test"] },
      durations: [60],
      _source: "custom_module",
    });
  });

  it("loads active records through the SDK and caches only that success", async () => {
    const getAllRecords = vi.fn().mockResolvedValue({
      data: [
        {
          Name: "Appointment Test",
          Category: "Type",
          Sort_Order: 10,
          Active: true,
        },
      ],
      info: { more_records: false },
    });
    const ZOHO = { CRM: { API: { getAllRecords } } };

    const first = await fetchPicklistConfig(ZOHO);
    const second = await fetchPicklistConfig(ZOHO);

    expect(first.types).toEqual(["Appointment Test"]);
    expect(second).toBe(first);
    expect(getAllRecords).toHaveBeenCalledOnce();
    expect(getAllRecords).toHaveBeenCalledWith({
      Entity: "Widget_Picklist_Config",
      sort_order: "asc",
      per_page: 200,
      page: 1,
    });
  });

  it("retries the SDK with the internal module name", async () => {
    const getAllRecords = vi.fn(({ Entity }) =>
      Entity === "Widget_Picklist_Config"
        ? Promise.resolve({ code: "INVALID_MODULE", status: "error" })
        : Promise.resolve({
            data: [
              {
                Name: "Appointment Test",
                Category: "Type",
                Sort_Order: 10,
                Active: true,
              },
            ],
          })
    );

    const config = await fetchPicklistConfig({
      CRM: { API: { getAllRecords } },
    });

    expect(config.types).toEqual(["Appointment Test"]);
    expect(getAllRecords.mock.calls.map(([request]) => request.Entity)).toEqual([
      "Widget_Picklist_Config",
      "CustomModule15",
    ]);
  });

  it("falls back to COQL and parses a string status message", async () => {
    const invoke = vi.fn().mockResolvedValue({
      details: {
        statusMessage: JSON.stringify({
          data: [
            {
              Name: "Appointment Test",
              Category: "Regarding",
              Parent_Type: "Appointment",
              Sort_Order: 10,
              Active: true,
            },
          ],
        }),
      },
    });
    const ZOHO = {
      CRM: {
        API: { getAllRecords: vi.fn().mockResolvedValue({ data: [] }) },
        CONNECTION: { invoke },
      },
    };

    const config = await fetchPicklistConfig(ZOHO);

    expect(config.regarding).toEqual({ Appointment: ["Appointment Test"] });
    expect(invoke).toHaveBeenCalledWith(
      "zoho_crm_conn",
      expect.objectContaining({
        url: "https://www.zohoapis.com.au/crm/v8/coql",
        method: "POST",
        parameters: {
          select_query: expect.stringContaining(
            "from Widget_Picklist_Config where Active = true"
          ),
        },
      })
    );
  });

  it("discards partial SDK pagination before falling back to COQL", async () => {
    const getAllRecords = vi.fn(({ Entity, page }) => {
      if (Entity === "Widget_Picklist_Config" && page === 1) {
        return Promise.resolve({
          data: Array.from({ length: 200 }, (_, index) => ({
            Name: `Partial ${index}`,
            Category: "Type",
            Sort_Order: index + 1,
            Active: true,
          })),
          info: { more_records: true },
        });
      }
      if (Entity === "Widget_Picklist_Config" && page === 2) {
        return Promise.reject(new Error("page failed"));
      }
      return Promise.resolve({ data: [] });
    });
    const invoke = vi.fn().mockResolvedValue({
      details: {
        statusMessage: {
          data: [
            {
              Name: "COQL Type",
              Category: "Type",
              Sort_Order: 10,
              Active: true,
            },
          ],
        },
      },
    });

    const config = await fetchPicklistConfig({
      CRM: { API: { getAllRecords }, CONNECTION: { invoke } },
    });

    expect(config.types).toEqual(["COQL Type"]);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("does not poison the cache when an empty read uses fallbacks", async () => {
    const getAllRecords = vi.fn().mockResolvedValue({ data: [] });
    const ZOHO = { CRM: { API: { getAllRecords } } };

    const fallback = await fetchPicklistConfig(ZOHO);
    expect(fallback._source).toBe("fallback");
    expect(getAllRecords).toHaveBeenCalledTimes(2);

    getAllRecords.mockResolvedValue({
      data: [
        {
          Name: "Appointment Test",
          Category: "Type",
          Sort_Order: 10,
          Active: "Yes",
        },
      ],
    });

    const recovered = await fetchPicklistConfig(ZOHO);
    expect(recovered).toMatchObject({
      types: ["Appointment Test"],
      _source: "custom_module",
    });
    expect(getAllRecords).toHaveBeenCalledTimes(3);
  });
});
