import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateActivityModal, {
  buildCreateActivityPayload,
} from "./CreateActivityModal";
import useEventsStore from "../store/eventsStore";

vi.mock("./FirstComponent", () => ({
  default: ({ formData, handleInputChange }) => (
    <div>
      <output data-testid="create-type">{formData.Type_of_Activity}</output>
      <output data-testid="create-title">{formData.Event_Title}</output>
      <output data-testid="create-regarding">{formData.Regarding}</output>
      <button
        type="button"
        onClick={() => {
          handleInputChange("Type_of_Activity", "Meeting");
          handleInputChange("duration", 60);
          handleInputChange("scheduledWith", [
            {
              id: "contact-1",
              Full_Name: "Ada Lovelace",
              Email: "ada@example.com",
            },
          ]);
        }}
      >
        Fill ordinary activity
      </button>
      <button
        type="button"
        onClick={() => {
          handleInputChange("Type_of_Activity", "Meeting");
          handleInputChange("duration", 60);
          handleInputChange("Create_Separate_Event_For_Each_Contact", true);
          handleInputChange("scheduledWith", [
            { id: "contact-1", Full_Name: "Ada Lovelace" },
            { id: "contact-2", Full_Name: "Grace Hopper" },
          ]);
        }}
      >
        Fill separate activities
      </button>
    </div>
  ),
}));

vi.mock("./ThirdComponent", () => ({ default: () => <div>Recurrence form</div> }));

const baseForm = {
  Type_of_Activity: "Meeting",
  Event_Title: "Planning",
  start: "2025-04-01T10:00:00.000Z",
  end: "2025-04-01T11:00:00.000Z",
  startTime: "2025-04-01T10:00:00",
  endTime: "2025-05-01T10:00:00",
  scheduledWith: [
    { id: "contact-1", Full_Name: "Ada Lovelace", Email: "ada@example.com" },
  ],
  scheduleFor: { id: "owner-1", full_name: "Owner" },
  What_Id: { id: "account-1", name: "Account" },
  Description: "Discuss the plan",
  Duration_Min: 60,
  priority: "High",
  duration: 60,
  occurrence: "once",
  noEndDate: false,
  Reminder_Text: "None",
  Send_Reminders: false,
  Send_Invites: false,
};

const renderModal = (ZOHO, overrides = {}) => {
  const props = {
    openCreateModal: true,
    handleClose: vi.fn(),
    ZOHO,
    users: [],
    loggedInUser: { id: "owner-1", full_name: "Owner" },
    setEvents: vi.fn(),
    setSelectedRowIndex: vi.fn(),
    setHighlightedRow: vi.fn(),
    ...overrides,
  };

  render(<CreateActivityModal {...props} />);
  return props;
};

describe("buildCreateActivityPayload", () => {
  it("builds a non-recurring CRM payload and removes form-only fields", () => {
    const payload = buildCreateActivityPayload(baseForm);

    expect(payload).toMatchObject({
      Event_Title: "Planning",
      Event_Priority: "High",
      Duration_Min: "60",
      Owner: { id: "owner-1" },
      Participants: [
        {
          name: "Ada Lovelace",
          participant: "contact-1",
          invited: false,
          status: "not_known",
          type: "contact",
        },
      ],
    });
    expect(new Date(payload.Start_DateTime).getTime()).toBe(
      new Date(baseForm.start).getTime()
    );
    expect(payload).not.toHaveProperty("Recurring_Activity");
    expect(payload).not.toHaveProperty("scheduledWith");
    expect(payload).not.toHaveProperty("scheduleFor");
    expect(payload).not.toHaveProperty("start");
    expect(payload).not.toHaveProperty("end");
    expect(payload).not.toHaveProperty("occurrence");
  });

  it("preserves a configured zero duration without inventing one when missing", () => {
    expect(
      buildCreateActivityPayload({ ...baseForm, Duration_Min: 0 })
        .Duration_Min
    ).toBe("0");
    expect(
      buildCreateActivityPayload({ ...baseForm, Duration_Min: "" })
    ).not.toHaveProperty("Duration_Min");
  });

  it("builds a weekly recurrence rule", () => {
    const payload = buildCreateActivityPayload({
      ...baseForm,
      occurrence: "weekly",
    });

    expect(payload.Recurring_Activity.RRULE).toMatch(
      /^FREQ=WEEKLY;INTERVAL=1;UNTIL=2025-05-01;BYDAY=TU;DTSTART=2025-04-01$/
    );
  });

  it("uses one participant and personalizes separate activity titles", () => {
    const payload = buildCreateActivityPayload(baseForm, {
      id: "contact-2",
      Full_Name: "Grace Hopper",
    });

    expect(payload.Event_Title).toBe("Planning - Grace Hopper");
    expect(payload.Participants).toEqual([
      {
        name: "Grace Hopper",
        invited: false,
        type: "contact",
        participant: "contact-2",
        status: "not_known",
      },
    ]);
  });
});

describe("CreateActivityModal controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-01T10:00:00.000Z"));
    useEventsStore.setState({ events: [], cache: {} });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not use the first CRM picklist rows as create defaults", () => {
    renderModal(
      { CRM: { API: { insertRecord: vi.fn() } } },
      {
        picklistConfig: {
          _source: "custom_module",
          types: ["Fruit"],
          regarding: { Fruit: ["Pear"] },
          durations: [5],
        },
      }
    );

    expect(screen.getByTestId("create-type")).toHaveTextContent("");
    expect(screen.getByTestId("create-title")).toHaveTextContent("New Activity");
    expect(screen.getByTestId("create-regarding")).toHaveTextContent("");
  });

  it("creates an ordinary event, logs it, and updates local state", async () => {
    const insertRecord = vi.fn(async ({ Entity }) =>
      Entity === "Events"
        ? { data: [{ code: "SUCCESS", details: { id: "event-1" } }] }
        : { data: [{ code: "SUCCESS", details: { id: "log-1" } }] }
    );
    const props = renderModal({ CRM: { API: { insertRecord } } });

    fireEvent.click(screen.getByRole("button", { name: "Fill ordinary activity" }));
    const submit = screen.getByRole("button", { name: "Ok" });
    expect(submit).toBeEnabled();

    await act(async () => {
      fireEvent.click(submit);
    });

    const eventCall = insertRecord.mock.calls.find(
      ([request]) => request.Entity === "Events"
    )[0];
    expect(eventCall).toMatchObject({
      Entity: "Events",
      Trigger: ["workflow"],
      APIData: {
        Event_Title: "New Activity",
        Participants: [
          expect.objectContaining({ participant: "contact-1", name: "Ada Lovelace" }),
        ],
      },
    });
    expect(eventCall.APIData).not.toHaveProperty("Recurring_Activity");
    expect(insertRecord).toHaveBeenCalledWith(
      expect.objectContaining({ Entity: "Log_Module" })
    );
    expect(useEventsStore.getState().events).toEqual([
      expect.objectContaining({ id: "event-1", Event_Title: "New Activity" }),
    ]);
    expect(props.setEvents).toHaveBeenCalledOnce();
    expect(props.setSelectedRowIndex).toHaveBeenCalledWith("event-1");
    expect(props.setHighlightedRow).toHaveBeenCalledWith("event-1");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Event Created Successfully"
    );

    act(() => vi.advanceTimersByTime(1000));
    expect(props.handleClose).toHaveBeenCalledOnce();
  });

  it("uses the first positive configured duration for a new event", async () => {
    const insertRecord = vi.fn(async ({ Entity }) =>
      Entity === "Events"
        ? { data: [{ code: "SUCCESS", details: { id: "event-1" } }] }
        : { data: [{ code: "SUCCESS", details: { id: "log-1" } }] }
    );
    renderModal(
      { CRM: { API: { insertRecord } } },
      {
        picklistConfig: {
          _source: "custom_module",
          types: ["Communication & Meetings"],
          regarding: {},
          durations: [0, 5, 10],
        },
      }
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill ordinary activity" }));
    const submit = screen.getByRole("button", { name: "Ok" });
    expect(submit).toBeEnabled();

    await act(async () => {
      fireEvent.click(submit);
    });

    const eventCall = insertRecord.mock.calls.find(
      ([request]) => request.Entity === "Events"
    )[0];
    expect(eventCall.APIData.Duration_Min).toBe("5");
    expect(new Date(eventCall.APIData.End_DateTime).getTime()).toBeGreaterThan(
      new Date(eventCall.APIData.Start_DateTime).getTime()
    );
  });

  it("shows an error and leaves state unchanged when ordinary create rejects", async () => {
    const insertRecord = vi.fn(async ({ Entity }) => {
      if (Entity === "Events") throw new Error("Zoho unavailable");
      return { data: [{ code: "SUCCESS", details: { id: "log-1" } }] };
    });
    const props = renderModal({ CRM: { API: { insertRecord } } });

    fireEvent.click(screen.getByRole("button", { name: "Fill ordinary activity" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ok" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Error creating event.");
    expect(useEventsStore.getState().events).toEqual([]);
    expect(props.setEvents).not.toHaveBeenCalled();
    expect(props.handleClose).not.toHaveBeenCalled();
  });

  it("creates one personalized event for each selected contact", async () => {
    let eventNumber = 0;
    const insertRecord = vi.fn(async ({ Entity }) => {
      if (Entity === "Events") {
        eventNumber += 1;
        return {
          data: [
            { code: "SUCCESS", details: { id: `event-${eventNumber}` } },
          ],
        };
      }
      return { data: [{ code: "SUCCESS", details: { id: `log-${eventNumber}` } }] };
    });
    renderModal({ CRM: { API: { insertRecord } } });

    fireEvent.click(screen.getByRole("button", { name: "Fill separate activities" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ok" }));
    });

    const eventCalls = insertRecord.mock.calls
      .map(([request]) => request)
      .filter((request) => request.Entity === "Events");
    expect(eventCalls).toHaveLength(2);
    expect(eventCalls.map((request) => request.APIData.Event_Title)).toEqual([
      "New Activity - Ada Lovelace",
      "New Activity - Grace Hopper",
    ]);
    expect(
      eventCalls.map((request) => request.APIData.Participants[0].participant)
    ).toEqual(["contact-1", "contact-2"]);
    expect(useEventsStore.getState().events).toHaveLength(2);
  });
});
