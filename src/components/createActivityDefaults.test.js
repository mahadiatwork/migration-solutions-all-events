import { describe, expect, it } from "vitest";
import {
  getActivityTypeSelection,
  getCreateActivityDefaults,
} from "./createActivityDefaults";

describe("create activity defaults", () => {
  it("does not use the first CRM picklist rows as create defaults", () => {
    const picklistConfig = {
      types: ["Fruit"],
      regarding: { Fruit: ["Pear"] },
    };

    expect(picklistConfig.types[0]).toBe("Fruit");
    expect(picklistConfig.regarding.Fruit[0]).toBe("Pear");
    expect(getCreateActivityDefaults()).toEqual({
      Type_of_Activity: "",
      Event_Title: "New Activity",
      Regarding: "",
    });
  });

  it("clears Regarding when an activity type is explicitly selected", () => {
    expect(getActivityTypeSelection("Fruit", 7)).toEqual({
      Type_of_Activity: "Fruit",
      resource: 7,
      Regarding: "",
    });
  });
});
