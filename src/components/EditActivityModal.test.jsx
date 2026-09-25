import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditActivityModal, {
  buildEditActivityPayload,
} from "./EditActivityModal";
import useEventsStore from "../store/eventsStore";

vi.mock("./FirstComponent", () => ({
  default: ({ handleInputChange }) => (
    <button
      type="button"
      onClick={() => handleInputChange("Description", "Updated description")}
    >
      Change activity
    </button>
  ),
}));

vi.mock("./ThirdComponent", () => ({ default: () => <div>Recurrence form</div> }));

const selectedRowData = {
  id: "event-1",
  Event_Title: "Planning",
  Type_of_Activity: "Meeting",
  Start_DateTime: "2025-04-01T10:00:00.000Z",
  End_DateTime: "2025-04-01T11:00:00.000Z",
  Duration_Min: "60",
  What_Id: { id: "account-1", name: "Account" },
  Participants: [
    {
      Full_Name: "Ada Lovelace",
      Email: "ada@example.com",
      participant: "contact-1",
      type: "contact",
    },
  ],
  Owner: { id: "owner-1", name: "Owner" },
  Event_Priority: "Medium",
  Description: "Original description",
};

const baseEditForm = {
  ...selectedRowData,
  start: selectedRowData.Start_DateTime,
  end: selectedRowData.End_DateTime,
  scheduledWith: selectedRowData.Participants,
  scheduleFor: selectedRowData.Owner,
  priority: selectedRowData.Event_Priority,
  Reminder_Text: "None",
};

const renderModal = (ZOHO, overrides = {}) => {
  const props = {
    openEditModal: true,
    handleClose: vi.fn(),
    selectedRowData,
    ZOHO,
    users: [],
    updateEventState: vi.fn(),
    ...overrides,
  };

  render(<EditActivityModal {...props} />);
  return props;
};

describe("buildEditActivityPayload", () => {
  it("normalizes editable fields into the Zoho payload", () => {
    const payload = buildEditActivityPayload({
      id: "event-1",
      Event_Title: "Planning",
      Type_of_Activity: "Meeting",
      start: selectedRowData.Start_DateTime,
      end: selectedRowData.End_DateTime,
      Duration_Min: 60,
      What_Id: selectedRowData.What_Id,
      scheduledWith: selectedRowData.Participants,
      scheduleFor: selectedRowData.Owner,
      priority: "High",
      Description: "Updated",
      Reminder_Text: "None",
    });

    expect(payload).toMatchObject({
      id: "event-1",
      Start_DateTime: expect.any(String),
      End_DateTime: expect.any(String),
      Duration_Min: "60",
      Event_Priority: "High",
      Owner: { id: "owner-1" },
      Participants: [
        expect.objectContaining({
          Email: "ada@example.com",
          name: "Ada Lovelace",
          participant: "contact-1",
        }),
      ],
    });
    expect(payload).not.toHaveProperty("scheduledWith");
    expect(payload).not.toHaveProperty("scheduleFor");
    expect(payload).not.toHaveProperty("start");
    expect(payload).not.toHaveProperty("end");
    expect(payload).not.toHaveProperty("priority");
  });

  it("preserves zero duration and leaves a missing duration untouched", () => {
    expect(
      buildEditActivityPayload({
        ...baseEditForm,
        Duration_Min: 0,
      }).Duration_Min
    ).toBe("0");
    expect(
      buildEditActivityPayload({
        ...baseEditForm,
        Duration_Min: "",
      })
    ).not.toHaveProperty("Duration_Min");
  });
});

describe("EditActivityModal controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEventsStore.setState({ events: [selectedRowData], cache: {} });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("updates Zoho and publishes the merged server record", async () => {
    const updateRecord = vi.fn().mockResolvedValue({
      data: [
        {
          code: "SUCCESS",
          details: { Description: "Server description", Venue: "Room 1" },
        },
      ],
    });
    const props = renderModal({ CRM: { API: { updateRecord } } });

    fireEvent.click(screen.getByRole("button", { name: "Change activity" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ok" }));
    });

    expect(updateRecord).toHaveBeenCalledWith({
      Entity: "Events",
      APIData: expect.objectContaining({
        id: "event-1",
        Description: "Updated description",
        Event_Priority: "Medium",
        Participants: [
          expect.objectContaining({ participant: "contact-1", name: "Ada Lovelace" }),
        ],
      }),
      Trigger: ["workflow"],
    });
    expect(props.updateEventState).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-1",
        Description: "Server description",
        Venue: "Room 1",
      })
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Event updated successfully."
    );

    act(() => vi.advanceTimersByTime(1000));
    expect(props.handleClose).toHaveBeenCalledOnce();
  });

  it("shows an error without publishing local state when update rejects", async () => {
    const updateRecord = vi.fn().mockRejectedValue(new Error("Zoho unavailable"));
    const props = renderModal({ CRM: { API: { updateRecord } } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ok" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Error updating event.");
    expect(props.updateEventState).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(props.handleClose).not.toHaveBeenCalled();
  });
});
