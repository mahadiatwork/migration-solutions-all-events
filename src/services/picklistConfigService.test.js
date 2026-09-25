import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPicklistConfigCache,
  fetchPicklistConfig,
  getDurationOptionsFromConfig,
  getRegardingOptionsFromConfig,
  getResultOptionsFromConfig,
  getTypeOptionsFromConfig,
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
        Category: "History Result",
        Parent_Type: "Appointment Test",
        Sort_Order: 20,
      },
      {
        Name: { display_value: "Appointment Test" },
        Category: { actual_value: "History Type" },
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
      { Name: "0", Category: "Duration", Sort_Order: 5 },
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
      durations: [0, 60],
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

  it("retries the SDK alias after a nested invalid-module response", async () => {
    const getAllRecords = vi.fn(({ Entity }) =>
      Entity === "Widget_Picklist_Config"
        ? Promise.resolve({
            data: [
              {
                code: "INVALID_MODULE",
                status: "error",
                message: "invalid module",
              },
            ],
          })
        : Promise.resolve({ data: [], info: { more_records: false } })
    );

    const config = await fetchPicklistConfig({
      CRM: { API: { getAllRecords } },
    });

    expect(getAllRecords.mock.calls.map(([request]) => request.Entity)).toEqual([
      "Widget_Picklist_Config",
      "CustomModule15",
    ]);
    expect(config).toMatchObject({
      _source: "custom_module",
      types: [],
    });
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
        API: {},
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

  it("keeps earlier SDK pages when NO_DATA terminates pagination", async () => {
    const pageOneRecords = Array.from({ length: 200 }, (_, index) => ({
      Name: `Configured Type ${index}`,
      Category: "Type",
      Sort_Order: index + 1,
      Active: true,
    }));
    const getAllRecords = vi
      .fn()
      .mockResolvedValueOnce({
        data: pageOneRecords,
        info: { more_records: true },
      })
      .mockResolvedValueOnce({ code: "NO_DATA", status: "error" });

    const config = await fetchPicklistConfig({
      CRM: { API: { getAllRecords } },
    });

    expect(config.types).toHaveLength(200);
    expect(config.types[0]).toBe("Configured Type 0");
    expect(getAllRecords).toHaveBeenCalledTimes(2);
  });

  it("reads all SDK pages beyond ten even when each page is short", async () => {
    const getAllRecords = vi.fn(({ page }) =>
      Promise.resolve({
        data: [
          {
            Name: `Configured Type ${page}`,
            Category: "Type",
            Sort_Order: page,
            Active: true,
          },
        ],
        info: { more_records: page < 12 },
      })
    );

    const config = await fetchPicklistConfig({
      CRM: { API: { getAllRecords } },
    });

    expect(getAllRecords).toHaveBeenCalledTimes(12);
    expect(config.types).toHaveLength(12);
    expect(config.types.at(-1)).toBe("Configured Type 12");
  });

  it("follows pagination metadata in wrapped SDK responses", async () => {
    const getAllRecords = vi.fn(({ page }) =>
      Promise.resolve({
        data: {
          data: [
            {
              Name: `Wrapped Type ${page}`,
              Category: "Type",
              Sort_Order: page,
              Active: true,
            },
          ],
          info: { more_records: page === 1 },
        },
      })
    );

    const config = await fetchPicklistConfig({
      CRM: { API: { getAllRecords } },
    });

    expect(getAllRecords).toHaveBeenCalledTimes(2);
    expect(config.types).toEqual(["Wrapped Type 1", "Wrapped Type 2"]);
  });

  it("rejects an errored SDK wrapper even when it contains fake records", async () => {
    const getAllRecords = vi.fn().mockResolvedValue({
      data: {
        code: "INTERNAL_ERROR",
        status: "error",
        data: [
          {
            Name: "Must not load",
            Category: "Type",
            Active: true,
          },
        ],
      },
    });

    const config = await fetchPicklistConfig({
      CRM: { API: { getAllRecords } },
    });

    expect(config._source).toBe("fallback");
    expect(config.types).not.toContain("Must not load");
  });

  it("does not treat an error COQL envelope with empty data as authoritative", async () => {
    const invoke = vi.fn((_connectionName, { parameters }) =>
      parameters.select_query.includes("Widget_Picklist_Config")
        ? Promise.resolve({
            details: {
              statusMessage: JSON.stringify({
                code: "INVALID_MODULE",
                status: "error",
                data: [],
              }),
            },
          })
        : Promise.resolve({
            details: {
              statusMessage: JSON.stringify({ data: [] }),
            },
          })
    );

    const config = await fetchPicklistConfig({
      CRM: { API: {}, CONNECTION: { invoke } },
    });

    expect(config).toMatchObject({ _source: "custom_module", types: [] });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not let an empty COQL status message mask an outer data error", async () => {
    const invoke = vi.fn((_connectionName, { parameters }) =>
      parameters.select_query.includes("Widget_Picklist_Config")
        ? Promise.resolve({
            data: { code: "INTERNAL_ERROR", status: "error" },
            details: {
              statusMessage: JSON.stringify({ data: [] }),
            },
          })
        : Promise.resolve({
            details: {
              statusMessage: {
                data: [
                  {
                    Name: "Alias Type",
                    Category: "Type",
                    Sort_Order: 1,
                    Active: true,
                  },
                ],
              },
            },
          })
    );

    const config = await fetchPicklistConfig({
      CRM: { API: {}, CONNECTION: { invoke } },
    });

    expect(config.types).toEqual(["Alias Type"]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("treats nested COQL NO_CONTENT as authoritative empty", async () => {
    const invoke = vi.fn().mockResolvedValue({
      details: {
        statusMessage: JSON.stringify({
          code: "NO_CONTENT",
          status: "error",
        }),
      },
    });

    const config = await fetchPicklistConfig({
      CRM: { API: {}, CONNECTION: { invoke } },
    });

    expect(config).toMatchObject({ _source: "custom_module", types: [] });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("paginates COQL beyond 2000 rows", async () => {
    const firstPage = Array.from({ length: 2000 }, (_, index) => ({
      Name: `Configured Type ${index}`,
      Category: "Type",
      Sort_Order: index,
      Active: true,
    }));
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        details: { statusMessage: { data: firstPage } },
      })
      .mockResolvedValueOnce({
        details: {
          statusMessage: {
            data: [
              {
                Name: "Configured Type 2000",
                Category: "Type",
                Sort_Order: 2000,
                Active: true,
              },
            ],
          },
        },
      });

    const config = await fetchPicklistConfig({
      CRM: { API: {}, CONNECTION: { invoke } },
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1].parameters.select_query).toContain(
      "LIMIT 2000, 2000"
    );
    expect(config.types).toHaveLength(2001);
    expect(config.types.at(-1)).toBe("Configured Type 2000");
  });

  it.each(["statusMessage", "details", "top-level"])(
    "continues a short COQL page when %s info reports more records",
    async (infoLocation) => {
      const statusMessage = {
        data: [
          {
            Name: `Short ${infoLocation}`,
            Category: "Type",
            Sort_Order: 1,
            Active: true,
          },
        ],
      };
      const firstResponse = { details: { statusMessage } };
      if (infoLocation === "statusMessage") {
        statusMessage.info = { more_records: true };
      } else if (infoLocation === "details") {
        firstResponse.details.info = { more_records: true };
      } else {
        firstResponse.info = { more_records: true };
      }

      const invoke = vi
        .fn()
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce({
          details: {
            statusMessage: {
              data: [
                {
                  Name: `Final ${infoLocation}`,
                  Category: "Type",
                  Sort_Order: 2,
                  Active: true,
                },
              ],
              info: { more_records: false },
            },
          },
        });

      const config = await fetchPicklistConfig({
        CRM: { API: {}, CONNECTION: { invoke } },
      });

      expect(config.types).toEqual([
        `Short ${infoLocation}`,
        `Final ${infoLocation}`,
      ]);
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke.mock.calls[1][1].parameters.select_query).toContain(
        "LIMIT 2000, 2000"
      );
    }
  );

  it("treats a successful empty module read as authoritative and caches it", async () => {
    const getAllRecords = vi.fn().mockResolvedValue({ data: [] });
    const ZOHO = { CRM: { API: { getAllRecords } } };

    const first = await fetchPicklistConfig(ZOHO);
    const second = await fetchPicklistConfig(ZOHO);

    expect(first).toEqual({
      types: [],
      results: {},
      resultMapping: {},
      regarding: {},
      durations: [],
      _source: "custom_module",
    });
    expect(second).toBe(first);
    expect(getAllRecords).toHaveBeenCalledOnce();
  });

  it("uses hard-coded fallbacks only for a genuine fetch failure", async () => {
    const getAllRecords = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue({
        data: [
          {
            Name: "Appointment Test",
            Category: "Type",
            Sort_Order: 10,
            Active: "Yes",
          },
        ],
      });
    const ZOHO = { CRM: { API: { getAllRecords } } };

    const fallback = await fetchPicklistConfig(ZOHO);
    expect(fallback._source).toBe("fallback");
    const recovered = await fetchPicklistConfig(ZOHO);
    expect(recovered).toMatchObject({
      types: ["Appointment Test"],
      _source: "custom_module",
    });
    expect(getAllRecords).toHaveBeenCalledTimes(2);
  });

  it("keeps empty custom categories and parents empty", () => {
    const config = {
      types: [],
      durations: [],
      results: {
        Appointment: [],
        _default: ["Default Result"],
      },
      regarding: {
        Appointment: [],
        _default: ["Default Regarding"],
      },
      _source: "custom_module",
    };

    expect(getTypeOptionsFromConfig(config)).toEqual([]);
    expect(getDurationOptionsFromConfig(config)).toEqual([]);
    expect(getResultOptionsFromConfig("Appointment", config)).toEqual([]);
    expect(getRegardingOptionsFromConfig("Appointment", config)).toEqual([]);
    expect(getResultOptionsFromConfig("Meeting", config)).toEqual([
      "Default Result",
    ]);
    expect(getRegardingOptionsFromConfig("Meeting", config)).toEqual([
      "Default Regarding",
    ]);
    expect(
      getResultOptionsFromConfig("Meeting", {
        ...config,
        results: {},
      })
    ).toEqual([]);
  });
});
