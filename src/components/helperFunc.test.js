import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityResultMapping,
  getActivityTimezone,
  getRegardingOptions,
  getResultBasedOnActivityType,
  getResultBasedOnActivityType2,
  isDateInRange,
  reminderMapping,
  safeParseDateString,
} from "./helperFunc";

describe("date range helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));
  });

  it.each([
    ["Today", "21/08/2026", true],
    ["Today", "20/08/2026", false],
    ["Current Week", "16/08/2026", true],
    ["Current Week", "22/08/2026", true],
    ["Current Week", "23/08/2026", false],
    ["Current Month", "01/08/2026", true],
    ["Current Month", "31/08/2026", true],
    ["Last 7 Days", "15/08/2026", true],
    ["Last 7 Days", "14/08/2026", false],
    ["Last 30 Days", "23/07/2026", true],
    ["Last 30 Days", "22/07/2026", false],
    ["Last 90 Days", "24/05/2026", true],
    ["Last 90 Days", "23/05/2026", false],
    ["Last Month", "01/07/2026", true],
    ["Last Month", "31/07/2026", true],
    ["Last Month", "01/08/2026", false],
    ["Next Week", "23/08/2026", true],
    ["Next Week", "29/08/2026", true],
    ["Next Week", "30/08/2026", false],
    ["Default", "01/07/2026", true],
    ["Default", "21/08/2027", true],
    ["Default", "22/08/2027", false],
  ])("applies the inclusive %s boundary to %s", (range, date, expected) => {
    expect(isDateInRange(date, range)).toBe(expected);
  });

  it("uses the user's local calendar day for Today", () => {
    // 23:30 UTC is already the following morning in an Australian timezone.
    vi.setSystemTime(new Date("2026-09-02T23:30:00Z"));

    expect(isDateInRange("03/09/2026", "Today")).toBe(true);
    expect(isDateInRange("02/09/2026", "Today")).toBe(false);
  });

  it("reads the timezone configured on the current device", () => {
    const dateTimeFormat = vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Australia/Brisbane" }),
    });

    expect(getActivityTimezone()).toBe("Australia/Brisbane");

    dateTimeFormat.mockRestore();
  });

  it("accepts supported padded, unpadded, and ISO dates", () => {
    expect(safeParseDateString("6/1/2026")?.format("YYYY-MM-DD")).toBe(
      "2026-01-06"
    );
    expect(safeParseDateString("06/01/2026")?.format("YYYY-MM-DD")).toBe(
      "2026-01-06"
    );
    expect(safeParseDateString("2026-1-6")?.format("YYYY-MM-DD")).toBe(
      "2026-01-06"
    );
  });

  it.each([null, "", "NaN/NaN/NaN", "not-a-date", "31/02/2026", "2025-02-29"])(
    "rejects invalid date %s",
    (date) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(safeParseDateString(date)).toBeNull();
      expect(isDateInRange(date, "Today")).toBe(false);
    }
  );

  it("accepts a real leap day", () => {
    expect(safeParseDateString("29/02/2024")?.format("YYYY-MM-DD")).toBe(
      "2024-02-29"
    );
  });
});

describe("activity mappings", () => {
  it.each([
    ["Meeting", "Meeting Held"],
    ["To-Do", "To-do Done"],
    ["Appointment", "Appointment Completed"],
    ["Boardroom", "Boardroom - Completed"],
    ["Call Billing", "Call Billing - Completed"],
    ["Email Billing", "Email Billing - Completed"],
    ["Initial Consultation", "Initial Consultation - Completed"],
    ["Call", "Call Attempted"],
    ["Mail", "Mail - Completed"],
    ["Meeting Billing", "Meeting Billing - Completed"],
    ["Personal Activity", "Personal Activity - Completed"],
    ["Room 1", "Room 1 - Completed"],
    ["Room 2", "Room 2 - Completed"],
    ["Room 3", "Room 3 - Completed"],
    ["To Do Billing", "To Do Billing - Completed"],
    ["Vacation", "Vacation - Completed"],
    ["Unknown", "Note"],
  ])("maps %s to its default result", (type, result) => {
    expect(getResultBasedOnActivityType(type)).toBe(result);
  });

  it("returns all result options and a safe fallback", () => {
    expect(getResultBasedOnActivityType2("Call")).toEqual(
      activityResultMapping.Call
    );
    expect(getResultBasedOnActivityType2("Unknown")).toEqual(["Note"]);
  });

  it("prefers CRM-managed Result and Regarding options when configured", () => {
    const config = {
      _source: "custom_module",
      results: {
        Appointment: ["Appointment Finished", "Appointment Cancelled"],
      },
      regarding: {
        Appointment: ["Appointment Test", "Dentist Appointment"],
      },
    };

    expect(getResultBasedOnActivityType("Appointment", config)).toBe(
      "Appointment Finished"
    );
    expect(getResultBasedOnActivityType2("Appointment", config)).toEqual([
      "Appointment Finished",
      "Appointment Cancelled",
    ]);
    expect(getRegardingOptions("Appointment", "Legacy value", config)).toEqual([
      "Appointment Test",
      "Dentist Appointment",
    ]);
    expect(
      getRegardingOptions("Appointment", "Legacy value", config, true)
    ).toEqual([
      "Legacy value",
      "Appointment Test",
      "Dentist Appointment",
    ]);
  });

  it("preserves a custom Regarding value without duplicating known values", () => {
    expect(getRegardingOptions("Call", "Custom reason", undefined, true)[0]).toBe(
      "Custom reason"
    );
    expect(
      getRegardingOptions("Call", "Cold call", undefined, true).filter(
        (value) => value === "Cold call"
      )
    ).toHaveLength(1);
    expect(getRegardingOptions("Unknown", "")).toEqual(["General"]);
  });

  it("does not fall back when custom-module parent options are empty", () => {
    const config = {
      _source: "custom_module",
      results: {
        Appointment: [],
        _default: ["Default Result"],
      },
      regarding: {
        Appointment: [],
        _default: ["Default Regarding"],
      },
    };

    expect(getResultBasedOnActivityType("Appointment", config)).toBe("");
    expect(getResultBasedOnActivityType2("Appointment", config)).toEqual([]);
    expect(getRegardingOptions("Appointment", "", config)).toEqual([]);
    expect(getResultBasedOnActivityType2("Meeting", config)).toEqual([
      "Default Result",
    ]);
    expect(getRegardingOptions("Meeting", "", config)).toEqual([
      "Default Regarding",
    ]);
  });

  it("keeps CRM reminder minute values stable", () => {
    expect(reminderMapping).toEqual({
      "120 minutes before": 120,
      "60 minutes before": 60,
      "30 minutes before": 30,
      "5 minutes before": 5,
      None: 0,
    });
  });
});
