import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScheduleTable from "./ActivityTable";
import useEventsStore from "../store/eventsStore";

vi.mock("./CreateActivityModal", () => ({
  default: ({ open }) =>
    open ? <div role="dialog" aria-label="create activity" /> : null,
}));

vi.mock("./EditActivityModal", () => ({
  default: ({ open, selectedRowData }) =>
    open ? (
      <div role="dialog" aria-label="edit activity">
        {selectedRowData?.Event_Title || selectedRowData?.title}
      </div>
    ) : null,
}));

vi.mock("./ClearActivityModal", () => ({
  default: ({ open, selectedRowData }) =>
    open ? (
      <div role="dialog" aria-label="clear activity">
        {selectedRowData?.Event_Title || selectedRowData?.title}
      </div>
    ) : null,
}));

const users = [
  { id: "user-ann", full_name: "Ann" },
  { id: "user-anna", full_name: "Anna" },
  { id: "user-bob", full_name: "Bob" },
];

const adminUser = {
  id: "admin-1",
  full_name: "Admin User",
  User_Type: "Admin",
};

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
const currentDay = String(now.getDate()).padStart(2, "0");
const currentIsoDate = `${currentYear}-${currentMonth}-${currentDay}`;
const currentDisplayDate = `${currentDay}/${currentMonth}/${currentYear}`;

const makeEvent = (overrides = {}) => ({
  id: "event-alpha",
  Event_Title: "Alpha Meeting",
  Type_of_Activity: "Meeting",
  Start_DateTime: `${currentIsoDate}T10:00:00`,
  End_DateTime: `${currentIsoDate}T10:45:00`,
  Duration_Min: "45",
  Event_Priority: "High",
  Owner: { name: "Alice" },
  Participants: [
    { name: "Pat Contact", participant: "contact-1", type: "contact" },
  ],
  Regarding: "Client consultation",
  What_Id: { id: "account-1", name: "Account A" },
  Event_Status: "Open",
  ...overrides,
});

const makeZoho = (getRecord = vi.fn(), searchRecord) => ({
  CRM: { API: { getRecord, searchRecord } },
});

function TableHarness({
  ZOHO,
  loggedInUser = adminUser,
  staff = [],
  initialFilterDate = "Default",
  initialCustomDateRange = null,
  onFilterDateChange = () => {},
  onCustomDateRangeChange = () => {},
  picklistConfig,
}) {
  const [filterDate, setFilterDate] = React.useState(initialFilterDate);
  const [customDateRange, setCustomDateRange] = React.useState(
    initialCustomDateRange
  );

  const handleFilterDateChange = (value) => {
    onFilterDateChange(value);
    setFilterDate(value);
  };

  const handleCustomDateRangeChange = (value) => {
    onCustomDateRangeChange(value);
    setCustomDateRange(value);
  };

  return (
    <ScheduleTable
      ZOHO={ZOHO}
      users={users}
      staff={staff}
      filterDate={filterDate}
      setFilterDate={handleFilterDateChange}
      loggedInUser={loggedInUser}
      customDateRange={customDateRange}
      setCustomDateRange={handleCustomDateRangeChange}
      setEvents={() => {}}
      picklistConfig={picklistConfig}
    />
  );
}

function renderTable(options = {}) {
  const ZOHO = options.ZOHO || makeZoho();
  return {
    user: userEvent.setup(),
    ZOHO,
    ...render(<TableHarness {...options} ZOHO={ZOHO} />),
  };
}

describe("ActivityTable", () => {
  beforeEach(() => {
    useEventsStore.setState({ events: [], cache: {}, loading: false });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("renders CRM event fields and the participant link", () => {
    useEventsStore.setState({ events: [makeEvent()] });

    renderTable();

    expect(screen.getByText("Alpha Meeting")).toBeInTheDocument();
    expect(screen.getByText(currentDisplayDate)).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("45 minutes")).toBeInTheDocument();
    expect(screen.getByText("Client consultation")).toBeInTheDocument();
    expect(screen.getByText("Account A")).toBeInTheDocument();
    expect(screen.getByText("Total Records 1")).toBeInTheDocument();

    const participant = screen.getByRole("link", { name: "Pat Contact" });
    expect(participant).toHaveAttribute(
      "href",
      expect.stringContaining("/Contacts/contact-1/")
    );
    expect(participant).toHaveAttribute("target", "_blank");
    expect(participant).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("displays a configured zero-minute duration without deriving another value", () => {
    useEventsStore.setState({
      events: [makeEvent({ Duration_Min: 0 })],
    });

    renderTable();

    expect(screen.getByText("0 minutes")).toBeInTheDocument();
  });

  it("does not relabel a blank stored Type as Other", () => {
    useEventsStore.setState({
      events: [makeEvent({ Type_of_Activity: "" })],
    });

    renderTable({
      picklistConfig: {
        types: ["Meeting"],
        _source: "custom_module",
      },
    });

    expect(screen.queryByText("Other")).not.toBeInTheDocument();
  });

  it("hides closed events until Show Cleared is enabled", async () => {
    useEventsStore.setState({
      events: [
        makeEvent(),
        makeEvent({
          id: "event-closed",
          Event_Title: "Closed Meeting",
          Event_Status: "Closed",
        }),
      ],
    });
    const { user } = renderTable();

    expect(screen.queryByText("Closed Meeting")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Show Cleared" })
    );

    expect(screen.getByText("Closed Meeting")).toBeInTheDocument();
    expect(screen.getByText("Total Records 2")).toBeInTheDocument();
    expect(screen.getByText("Filter By Cleared")).toBeInTheDocument();
  });

  it("combines type and priority filters", async () => {
    useEventsStore.setState({
      events: [
        makeEvent(),
        makeEvent({
          id: "event-low",
          Event_Title: "Low Meeting",
          Event_Priority: "Low",
        }),
        makeEvent({
          id: "event-call",
          Event_Title: "High Call",
          Type_of_Activity: "Call",
        }),
      ],
    });
    const { user } = renderTable();

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Meeting" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Alpha Meeting")).toBeInTheDocument();
    expect(screen.getByText("Low Meeting")).toBeInTheDocument();
    expect(screen.queryByText("High Call")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Priority" }));
    await user.click(screen.getByRole("option", { name: "High" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Alpha Meeting")).toBeInTheDocument();
    expect(screen.queryByText("Low Meeting")).not.toBeInTheDocument();
    expect(screen.getByText("Filter By Type, Priority")).toBeInTheDocument();
  });

  it("saves, applies, edits, and deletes a named Type/Priority/User/Staff preset", async () => {
    useEventsStore.setState({
      events: [
        makeEvent({
          id: "ann-meeting",
          Event_Title: "Ann Meeting",
          Owner: { name: "Ann" },
          Participants: [{ name: "Grace", participant: "staff-grace" }],
        }),
        makeEvent({
          id: "bob-call",
          Event_Title: "Bob Call",
          Type_of_Activity: "Call",
          Owner: { name: "Bob" },
          Participants: [{ name: "Ada", participant: "staff-ada" }],
        }),
      ],
    });
    const calendarPreference = {
      id: "calendar-preference",
      Name: "Calendar Preference",
      Saved_Filters: JSON.stringify([
        { name: "Calendar preset", priorityFilter: ["Low"] },
      ]),
      Latest_Filter: JSON.stringify({ priorityFilter: ["Low"] }),
    };
    const preference = {
      id: "preference-1",
      Name: "All Activity Preference",
      Saved_Filters: "[]",
      Latest_Filter: "",
    };
    const searchRecord = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: [{ ...calendarPreference }, { ...preference }] })
    );
    const updateRecord = vi.fn().mockImplementation(({ APIData }) => {
      Object.assign(preference, APIData);
      return Promise.resolve({ data: [{ code: "SUCCESS" }] });
    });
    const ZOHO = { CRM: { API: { searchRecord, updateRecord, getRecord: vi.fn() } } };
    const { user } = renderTable({
      ZOHO,
      staff: [
        { id: "staff-grace", Full_Name: "Grace Hopper" },
        { id: "staff-ada", Full_Name: "Ada Lovelace" },
      ],
    });

    await waitFor(() => expect(searchRecord).toHaveBeenCalled());
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Meeting" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: "Priority" }));
    await user.click(screen.getByRole("option", { name: "High" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: "User" }));
    await user.click(screen.getByRole("option", { name: "Ann" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: "Staff" }));
    await user.click(screen.getByRole("option", { name: "Grace Hopper" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Ann Meeting")).toBeInTheDocument();
    expect(screen.queryByText("Bob Call")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Saved filters" }));
    await user.type(screen.getByRole("textbox", { name: "Filter name" }), "Team focus");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Apply filter Team focus" })).toBeInTheDocument();
    expect(JSON.parse(preference.Saved_Filters)).toEqual([
      {
        name: "Team focus",
        filterType: ["Meeting"],
        filterPriority: ["High"],
        filterUser: ["Ann"],
        filterStaff: ["staff-grace"],
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Close saved filters" }));
    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByText("Bob Call")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saved filters" }));
    await user.click(screen.getByRole("button", { name: "Apply filter Team focus" }));
    expect(screen.queryByText("Bob Call")).not.toBeInTheDocument();
    expect(JSON.parse(preference.Latest_Filter)).toEqual({
      filterType: ["Meeting"],
      filterPriority: ["High"],
      filterUser: ["Ann"],
      filterStaff: ["staff-grace"],
    });

    await user.click(screen.getByRole("button", { name: "Edit filter Team focus" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit filter" });
    await user.clear(within(editDialog).getByRole("textbox", { name: "Filter name" }));
    await user.type(within(editDialog).getByRole("textbox", { name: "Filter name" }), "Team updated");
    await user.click(within(editDialog).getByRole("button", { name: "Update" }));
    expect(await screen.findByRole("button", { name: "Apply filter Team updated" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete filter Team updated" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Apply filter Team updated" })).not.toBeInTheDocument());
    expect(JSON.parse(preference.Saved_Filters)).toEqual([]);
    expect(JSON.parse(calendarPreference.Saved_Filters)).toEqual([
      { name: "Calendar preset", priorityFilter: ["Low"] },
    ]);
  });

  it("waits for preferences to load before opening saved filters", async () => {
    let resolveSearch;
    const searchRecord = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveSearch = resolve; })
    );
    const { user } = renderTable({
      ZOHO: { CRM: { API: { searchRecord, getRecord: vi.fn() } } },
    });

    const savedButton = screen.getByRole("button", { name: "Saved filters" });
    expect(savedButton).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Meeting" }));
    await user.keyboard("{Escape}");

    await act(async () => {
      resolveSearch({
        data: [{
          id: "preference-1",
          Name: "All Activity Preference",
          Saved_Filters: JSON.stringify([{
            name: "Existing preset",
            filterType: ["Call"],
          }]),
          Latest_Filter: JSON.stringify({ filterType: ["Call"] }),
        }],
      });
    });

    expect(savedButton).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Meeting");
    await user.click(savedButton);
    expect(screen.getByRole("button", { name: "Apply filter Existing preset" })).toBeInTheDocument();
  });

  it("uses only configured Type filters when the module is authoritative", async () => {
    useEventsStore.setState({ events: [makeEvent()] });
    const { user } = renderTable({
      picklistConfig: {
        types: ["Appointment Test"],
        _source: "custom_module",
      },
    });

    await user.click(screen.getByRole("combobox", { name: "Type" }));

    expect(
      screen.getByRole("option", { name: "Appointment Test" })
    ).toBeVisible();
    expect(screen.queryByRole("option", { name: "Meeting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Call" })).not.toBeInTheDocument();
  });

  it("uses an exact normalized owner match and can select all users", async () => {
    useEventsStore.setState({
      events: [
        makeEvent({
          id: "event-ann",
          Event_Title: "Ann Event",
          Owner: { name: "  ANN  " },
        }),
        makeEvent({
          id: "event-anna",
          Event_Title: "Anna Event",
          Owner: { name: "Anna" },
        }),
      ],
    });
    const { user } = renderTable({
      loggedInUser: { id: "user-ann", full_name: "Ann", User_Type: "Generic" },
    });

    await waitFor(() => {
      expect(screen.getByText("Ann Event")).toBeInTheDocument();
      expect(screen.queryByText("Anna Event")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("combobox", { name: "User" }));
    await user.click(screen.getByRole("option", { name: "Select All" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Anna Event")).toBeInTheDocument();
  });

  it("filters activities by Staff contacts", async () => {
    useEventsStore.setState({
      events: [
        makeEvent({
          id: "event-grace",
          Event_Title: "Grace Event",
          Participants: [
            { name: "Old Display Name", participant: "staff-grace" },
          ],
        }),
        makeEvent({
          id: "event-ada",
          Event_Title: "Ada Event",
          Participants: [
            { name: "Ada Lovelace", participant: "staff-ada" },
          ],
        }),
        makeEvent({
          id: "event-client",
          Event_Title: "Client Event",
          Participants: [
            { name: "Client Contact", participant: "contact-client" },
          ],
        }),
      ],
    });
    const searchRecord = vi.fn(({ Entity, page }) => {
      if (Entity === "User_Preferences") return Promise.resolve({ data: [] });
      if (page === 1) return Promise.resolve({
        data: [
          {
            id: "staff-grace",
            First_Name: "Grace",
            Last_Name: "Hopper",
            Staff_Type: "Active",
          },
          {
            id: "contact-client",
            First_Name: "Client",
            Last_Name: "Contact",
            Staff_Type: "Client",
          },
        ],
        info: { more_records: true },
      });
      return Promise.resolve({
        data: [
          {
            id: "staff-ada",
            First_Name: "Ada",
            Last_Name: "Lovelace",
            Staff_Type: "Active",
          },
        ],
        info: { more_records: false },
      });
    });
    const { user } = renderTable({ ZOHO: makeZoho(vi.fn(), searchRecord) });

    expect(
      searchRecord.mock.calls.filter(([request]) => request.Entity === "Contacts")
    ).toHaveLength(0);
    const documentAlias = document.document;
    delete document.document;
    try {
      await user.click(screen.getByRole("combobox", { name: "Staff" }));
    } finally {
      Object.defineProperty(document, "document", {
        configurable: true,
        value: documentAlias,
      });
    }

    await waitFor(() =>
      expect(searchRecord.mock.calls.filter(([request]) => request.Entity === "Contacts")).toHaveLength(2)
    );
    const staffCalls = searchRecord.mock.calls
      .filter(([request]) => request.Entity === "Contacts")
      .map(([request]) => request);
    expect(staffCalls[0]).toEqual({
      Entity: "Contacts",
      Type: "criteria",
      Query: "(Staff_Type:equals:Active)",
      page: 1,
      per_page: 200,
    });
    expect(staffCalls[1]).toEqual({
      Entity: "Contacts",
      Type: "criteria",
      Query: "(Staff_Type:equals:Active)",
      page: 2,
      per_page: 200,
    });

    const graceOption = await screen.findByRole("option", {
      name: "Grace Hopper",
    });
    expect(screen.getByRole("option", { name: "Ada Lovelace" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Client Contact" })
    ).not.toBeInTheDocument();

    await user.click(graceOption);
    await user.keyboard("{Escape}");

    expect(screen.getByText("Grace Event")).toBeInTheDocument();
    expect(screen.queryByText("Ada Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Client Event")).not.toBeInTheDocument();
    expect(screen.getByText("Total Records 1")).toBeInTheDocument();
    expect(screen.getByText("Filter By Staff")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(screen.getByText("Ada Event")).toBeInTheDocument();
    expect(screen.getByText("Client Event")).toBeInTheDocument();
    expect(screen.queryByText("Filter By Staff")).not.toBeInTheDocument();
  });

  it("applies an inclusive custom range with strict DD/MM/YYYY parsing", () => {
    useEventsStore.setState({
      events: [
        makeEvent({
          id: "event-january",
          Event_Title: "January Event",
          Start_DateTime: "2026-01-06T10:00:00",
          End_DateTime: "2026-01-06T10:45:00",
        }),
        makeEvent({
          id: "event-june",
          Event_Title: "June Event",
          Start_DateTime: "2026-06-01T10:00:00",
          End_DateTime: "2026-06-01T10:45:00",
        }),
      ],
    });

    renderTable({
      initialFilterDate: "Custom Range",
      initialCustomDateRange: {
        startDate: "2026-01-06",
        endDate: "2026-01-06",
      },
    });

    expect(screen.getByText("January Event")).toBeInTheDocument();
    expect(screen.queryByText("June Event")).not.toBeInTheDocument();
    expect(screen.getByText("Total Records 1")).toBeInTheDocument();
  });

  it("clears filters and restores the Default cache", async () => {
    const currentEvent = makeEvent({ Event_Title: "Current Event" });
    const cachedEvent = makeEvent({
      id: "event-cached",
      Event_Title: "Cached Default Event",
    });
    useEventsStore.setState({
      events: [currentEvent],
      cache: { Default: { data: [cachedEvent], range: null } },
    });
    const onFilterDateChange = vi.fn();
    const onCustomDateRangeChange = vi.fn();
    const { user } = renderTable({
      initialFilterDate: "Custom Range",
      initialCustomDateRange: {
        startDate: currentIsoDate,
        endDate: currentIsoDate,
      },
      onFilterDateChange,
      onCustomDateRangeChange,
    });

    await user.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(onFilterDateChange).toHaveBeenCalledWith("Default");
    expect(onCustomDateRangeChange).toHaveBeenCalledWith(null);
    expect(screen.getByText("Cached Default Event")).toBeInTheDocument();
    expect(screen.queryByText("Current Event")).not.toBeInTheDocument();
    expect(useEventsStore.getState().events).toEqual([cachedEvent]);
  });

  it("opens the create modal", async () => {
    const { user } = renderTable();

    await user.click(
      screen.getByRole("button", { name: "Create New Activity" })
    );

    expect(
      screen.getByRole("dialog", { name: "create activity" })
    ).toBeInTheDocument();
  });

  it("fetches the full Zoho record before opening edit", async () => {
    useEventsStore.setState({ events: [makeEvent()] });
    const fullRecord = { id: "event-alpha", Event_Title: "Fetched Alpha" };
    const getRecord = vi.fn().mockResolvedValue({ data: [fullRecord] });
    const { user } = renderTable({ ZOHO: makeZoho(getRecord) });

    await user.dblClick(
      screen.getByRole("row", { name: /Alpha Meeting/ })
    );

    expect(getRecord).toHaveBeenCalledWith({
      Entity: "Events",
      approved: "both",
      RecordID: "event-alpha",
    });
    expect(
      await screen.findByRole("dialog", { name: "edit activity" })
    ).toHaveTextContent("Fetched Alpha");
  });

  it("fetches the full Zoho record before opening clear and keeps the checkbox selected", async () => {
    useEventsStore.setState({ events: [makeEvent()] });
    const fullRecord = { id: "event-alpha", Event_Title: "Fetched Alpha" };
    const getRecord = vi.fn().mockResolvedValue({ data: [fullRecord] });
    const { user } = renderTable({ ZOHO: makeZoho(getRecord) });
    const row = screen.getByRole("row", { name: /Alpha Meeting/ });
    const checkbox = within(row).getByRole("checkbox");

    await user.click(checkbox);

    expect(getRecord).toHaveBeenCalledWith({
      Entity: "Events",
      approved: "both",
      RecordID: "event-alpha",
    });
    expect(
      await screen.findByRole("dialog", { name: "clear activity" })
    ).toHaveTextContent("Fetched Alpha");
    expect(checkbox).toBeChecked();
  });

  it("opens clear locally without calling Zoho when an event has no id", async () => {
    useEventsStore.setState({
      events: [
        makeEvent({ id: undefined, Event_Title: "Unsaved Local Event" }),
      ],
    });
    const getRecord = vi.fn();
    const { user } = renderTable({ ZOHO: makeZoho(getRecord) });
    const row = screen.getByRole("row", { name: /Unsaved Local Event/ });

    await user.click(within(row).getByRole("checkbox"));

    expect(getRecord).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "clear activity" })
    ).toHaveTextContent("Unsaved Local Event");
  });
});
