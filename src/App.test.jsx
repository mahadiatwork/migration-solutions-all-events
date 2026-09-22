import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import useEventsStore from "./store/eventsStore";

vi.mock("./components/ActivityTable", () => ({
  default: ({
    events,
    users,
    loggedInUser,
    filterDate,
    setFilterDate,
  }) => (
    <section aria-label="activity table stub">
      <div data-testid="events">
        {events.map((event) => event.Event_Title).join("|")}
      </div>
      <div data-testid="users">
        {users.map((user) => user.full_name).join("|")}
      </div>
      <div data-testid="logged-user">
        {loggedInUser
          ? `${loggedInUser.full_name}|${loggedInUser.User_Type}`
          : ""}
      </div>
      <div data-testid="filter-date">{filterDate}</div>
      <button onClick={() => setFilterDate("Last 7 Days")}>Last 7 Days</button>
    </section>
  ),
}));

vi.mock("./components/atom/DateRangeModal", () => ({
  default: () => null,
}));

const zoho = {
  embeddedApp: { init: vi.fn() },
  CRM: {
    CONFIG: { getCurrentUser: vi.fn() },
    API: {
      getRecord: vi.fn(),
      getOrgVariable: vi.fn(),
      getAllRecords: vi.fn(),
      searchRecord: vi.fn(),
    },
    CONNECTION: { invoke: vi.fn() },
  },
};

let App;

beforeAll(async () => {
  window.ZOHO = zoho;
  ({ default: App } = await import("./App"));
});

describe("App Zoho integration", () => {
  beforeEach(() => {
    useEventsStore.setState({ events: [], loading: false, cache: {} });

    zoho.embeddedApp.init.mockResolvedValue();
    zoho.CRM.CONFIG.getCurrentUser.mockResolvedValue({
      users: [{ id: "u1", full_name: "Ada Lovelace" }],
    });
    zoho.CRM.API.getRecord.mockResolvedValue({
      users: [
        { id: "u1", full_name: "Ada Lovelace", User_Type: "Generic" },
      ],
    });
    zoho.CRM.API.getOrgVariable.mockResolvedValue({
      Success: { Content: '["#123456"]' },
    });
    zoho.CRM.API.getAllRecords.mockImplementation(({ Entity }) => {
      if (Entity === "Widget_Picklist_Config") {
        return Promise.resolve({
          data: [
            {
              Name: "Meeting",
              Category: "Type",
              Sort_Order: 10,
              Active: true,
            },
          ],
          info: { more_records: false },
        });
      }

      return Promise.resolve({
        users: [
          { id: "u1", full_name: "Ada Lovelace" },
          { id: "u2", full_name: "Grace Hopper" },
        ],
      });
    });
    zoho.CRM.API.searchRecord.mockResolvedValue({
      data: [
        { id: "staff-1", Full_Name: "Staff One", Staff_Type: "Active" },
      ],
      info: { more_records: false },
    });

    const earlier = {
      id: "e1",
      Event_Title: "Earlier",
      Start_DateTime: "2026-08-20T09:00:00+10:00",
    };
    const later = {
      id: "e2",
      Event_Title: "Later",
      Start_DateTime: "2026-08-22T09:00:00+10:00",
    };
    const latest = {
      id: "e3",
      Event_Title: "Latest",
      Start_DateTime: "2026-08-23T09:00:00+10:00",
    };

    zoho.CRM.CONNECTION.invoke
      .mockResolvedValueOnce({
        details: {
          statusMessage: {
            data: [later, earlier],
            info: { more_records: true },
          },
        },
      })
      .mockResolvedValueOnce({
        details: {
          statusMessage: {
            data: [earlier, latest],
            info: { more_records: false },
          },
        },
      });
  });

  it("initializes Zoho, enriches metadata, paginates events, and reuses the default cache", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("events")).toHaveTextContent(
        "Earlier|Later|Latest"
      );
    });

    expect(zoho.embeddedApp.init).toHaveBeenCalledOnce();
    expect(zoho.CRM.CONFIG.getCurrentUser).toHaveBeenCalledOnce();
    expect(zoho.CRM.API.getRecord).toHaveBeenCalledWith({
      Entity: "users",
      approved: "both",
      RecordID: "u1",
    });
    expect(zoho.CRM.API.getOrgVariable).toHaveBeenCalledWith("recent_colors");
    expect(zoho.CRM.API.getAllRecords).toHaveBeenCalledWith({
      Entity: "users",
      sort_order: "asc",
      per_page: 100,
      page: 1,
    });
    await waitFor(() => {
      expect(screen.getByTestId("users")).toHaveTextContent(
        "Ada Lovelace|Grace Hopper"
      );
      expect(screen.getByTestId("logged-user")).toHaveTextContent(
        "Ada Lovelace|Generic"
      );
    });

    expect(zoho.CRM.CONNECTION.invoke).toHaveBeenCalledTimes(2);
    expect(zoho.CRM.CONNECTION.invoke.mock.calls[0][1].url).toContain("page=1");
    expect(zoho.CRM.CONNECTION.invoke.mock.calls[1][1].url).toContain("page=2");
    expect(useEventsStore.getState().cache.Default.data).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Last 7 Days" }));
    await waitFor(() => {
      expect(screen.getByTestId("filter-date")).toHaveTextContent(
        "Last 7 Days"
      );
    });
    expect(zoho.CRM.CONNECTION.invoke).toHaveBeenCalledTimes(2);
  });
});
