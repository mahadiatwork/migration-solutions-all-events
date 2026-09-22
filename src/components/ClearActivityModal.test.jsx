import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClearActivityModal from "./ClearActivityModal";
import useEventsStore from "../store/eventsStore";

const selectedEvent = {
  id: "event-1",
  Event_Title: "Client meeting",
  Type_of_Activity: "Meeting",
  Event_Status: "Open",
  Description: "",
  Duration_Min: 60,
  Start_DateTime: "2026-08-21T10:00:00+10:00",
  Owner: { id: "u1", name: "Ada Lovelace" },
  What_Id: { id: "account-1", name: "Acme" },
  Regarding: "Follow up",
  Participants: [
    { participant: "contact-1", name: "Grace Hopper" },
  ],
};

const makeZoho = () => ({
  CRM: {
    API: {
      searchRecord: vi.fn().mockResolvedValue({ data: [] }),
      updateRecord: vi.fn().mockResolvedValue({
        data: [{ code: "SUCCESS", details: { id: "event-1" } }],
      }),
      insertRecord: vi.fn().mockImplementation(({ Entity }) =>
        Promise.resolve({
          data: [
            {
              code: "SUCCESS",
              details: { id: Entity === "History1" ? "history-1" : "link-1" },
            },
          ],
        })
      ),
      getRecord: vi.fn().mockResolvedValue({ data: [selectedEvent] }),
      deleteRecord: vi.fn().mockResolvedValue({
        data: [{ code: "SUCCESS" }],
      }),
      getRelatedRecords: vi.fn().mockResolvedValue({ data: [] }),
    },
  },
});

describe("ClearActivityModal", () => {
  beforeEach(() => {
    useEventsStore.setState({
      events: [selectedEvent],
      loading: false,
      cache: {
        Default: {
          data: [selectedEvent],
          range: {
            start: new Date("2026-08-01"),
            end: new Date("2026-08-31"),
          },
        },
      },
    });
  });

  it("renders safely while the selected record is still loading", () => {
    const ZOHO = makeZoho();

    render(
      <ClearActivityModal
        open
        handleClose={vi.fn()}
        selectedRowData={null}
        ZOHO={ZOHO}
        filterDate="Default"
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(ZOHO.CRM.API.searchRecord).not.toHaveBeenCalled();
  });

  it("marks an event closed without creating history unless requested", async () => {
    const ZOHO = makeZoho();

    render(
      <ClearActivityModal
        open
        handleClose={vi.fn()}
        selectedRowData={selectedEvent}
        ZOHO={ZOHO}
        filterDate="Default"
      />
    );

    await waitFor(() => expect(ZOHO.CRM.API.searchRecord).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("checkbox", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(ZOHO.CRM.API.updateRecord).toHaveBeenCalledWith({
        Entity: "Events",
        RecordID: "event-1",
        APIData: {
          id: "event-1",
          Event_Status: "Closed",
          result: "Meeting Held",
        },
      });
    });

    expect(ZOHO.CRM.API.insertRecord).not.toHaveBeenCalled();
    expect(useEventsStore.getState().events[0].Event_Status).toBe("Closed");
    expect(
      useEventsStore.getState().cache.Default.data[0].Event_Status
    ).toBe("Closed");
  });

  it("uses the CRM-managed Result for the activity type", async () => {
    const ZOHO = makeZoho();

    render(
      <ClearActivityModal
        open
        handleClose={vi.fn()}
        selectedRowData={selectedEvent}
        ZOHO={ZOHO}
        filterDate="Default"
        picklistConfig={{
          results: { Meeting: ["Meeting Finalized"] },
          _source: "custom_module",
        }}
      />
    );

    await waitFor(() => expect(ZOHO.CRM.API.searchRecord).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("checkbox", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(ZOHO.CRM.API.updateRecord).toHaveBeenCalledWith({
        Entity: "Events",
        RecordID: "event-1",
        APIData: {
          id: "event-1",
          Event_Status: "Closed",
          result: "Meeting Finalized",
        },
      });
    });
  });

  it("creates history and a participant link when requested", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ZOHO = makeZoho();

    render(
      <ClearActivityModal
        open
        handleClose={vi.fn()}
        selectedRowData={selectedEvent}
        ZOHO={ZOHO}
        filterDate="Default"
      />
    );

    await waitFor(() => expect(ZOHO.CRM.API.searchRecord).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Add Activity Details to History",
      })
    );
    fireEvent.change(screen.getByLabelText("Activity Details"), {
      target: { value: "Discussed next steps" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(ZOHO.CRM.API.insertRecord).toHaveBeenCalledTimes(2);
    });

    expect(ZOHO.CRM.API.insertRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        Entity: "History1",
        APIData: expect.objectContaining({
          Event_ID: "event-1",
          History_Details_Plain: "Discussed next steps",
          History_Result: "Meeting Held",
        }),
      })
    );
    expect(ZOHO.CRM.API.insertRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        Entity: "History_X_Contacts",
        APIData: expect.objectContaining({
          Contact_Details: { id: "contact-1" },
          Contact_History_Info: { id: "history-1" },
        }),
      })
    );
  });

  it("erases the event from the store and every cache entry", async () => {
    const ZOHO = makeZoho();

    render(
      <ClearActivityModal
        open
        handleClose={vi.fn()}
        selectedRowData={selectedEvent}
        ZOHO={ZOHO}
        filterDate="Default"
      />
    );

    await waitFor(() => expect(ZOHO.CRM.API.searchRecord).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("checkbox", { name: "Erase" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(ZOHO.CRM.API.deleteRecord).toHaveBeenCalledWith({
        Entity: "Events",
        RecordID: "event-1",
      });
    });

    expect(useEventsStore.getState().events).toEqual([]);
    expect(useEventsStore.getState().cache.Default.data).toEqual([]);
  });
});
