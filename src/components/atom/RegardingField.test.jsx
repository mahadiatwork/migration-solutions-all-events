import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RegardingField from "./RegardingField";

const missingScopeConfig = {
  regarding: { Meeting: ["Follow up"] },
  _source: "custom_module",
};

const ControlledMissingScopeField = () => {
  const [formData, setFormData] = React.useState({
    Type_of_Activity: "Communication & Meetings",
    Regarding: "General",
  });

  return (
    <>
      <RegardingField
        formData={formData}
        handleInputChange={(field, value) =>
          setFormData((current) => ({ ...current, [field]: value }))
        }
        picklistConfig={missingScopeConfig}
      />
      <output data-testid="regarding-value">{formData.Regarding}</output>
    </>
  );
};

const renderField = ({
  regarding = "",
  options = ["Follow up"],
  preserveExistingValue = false,
  type = "Meeting",
} = {}) => {
  const handleInputChange = vi.fn();
  const user = userEvent.setup();
  render(
    <RegardingField
      formData={{ Type_of_Activity: type, Regarding: regarding }}
      handleInputChange={handleInputChange}
      picklistConfig={{
        regarding: { Meeting: options },
        _source: "custom_module",
      }}
      preserveExistingValue={preserveExistingValue}
    />
  );
  return { handleInputChange, user };
};

describe("RegardingField custom-module choices", () => {
  it("does not append an unconditional manual Other choice", async () => {
    const { user } = renderField();

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));

    expect(screen.getByRole("option", { name: "Follow up" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Other (Manually enter)" })
    ).not.toBeInTheDocument();
  });

  it("keeps an explicitly empty CRM scope empty", async () => {
    const { user } = renderField({ options: [] });

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));

    expect(
      screen.getByRole("listbox", { name: "Regarding" })
    ).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("option", { name: "Other (Manually enter)" })
    ).not.toBeInTheDocument();
  });

  it("preserves the existing edit value without adding other legacy values", async () => {
    const { user } = renderField({
      regarding: "Legacy reason",
      preserveExistingValue: true,
    });

    expect(screen.getByRole("combobox", { name: "Regarding" })).toHaveTextContent(
      "Legacy reason"
    );
    await user.click(screen.getByRole("combobox", { name: "Regarding" }));
    expect(screen.getByRole("option", { name: "Legacy reason" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Follow up" })).toBeVisible();
  });

  it("allows manual input only when Other is configured", async () => {
    const { user } = renderField({ options: ["Other"] });

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));
    await user.click(screen.getByRole("option", { name: "Other" }));

    expect(
      screen.getByRole("textbox", { name: "Enter your custom regarding" })
    ).toBeVisible();
  });

  it("treats a saved legacy Other as a preserved value, not a manual choice", () => {
    renderField({
      regarding: "Other",
      preserveExistingValue: true,
    });

    expect(screen.getByRole("combobox", { name: "Regarding" })).toHaveTextContent(
      "Other"
    );
    expect(
      screen.queryByRole("textbox", { name: "Enter your custom regarding" })
    ).not.toBeInTheDocument();
  });

  it("shows the legacy fallback and manual choice when the type has no CRM scope", async () => {
    const { user } = renderField({ type: "Communication & Meetings" });

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));

    expect(screen.getByRole("option", { name: "General" })).toBeVisible();
    expect(
      screen.getByRole("option", { name: "Other (Manually enter)" })
    ).toBeVisible();
  });

  it("clears the fallback before saving a manual Regarding value", async () => {
    const user = userEvent.setup();
    render(<ControlledMissingScopeField />);

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));
    await user.click(
      screen.getByRole("option", { name: "Other (Manually enter)" })
    );

    expect(screen.getByTestId("regarding-value")).toBeEmptyDOMElement();

    await user.type(
      screen.getByRole("textbox", { name: "Enter your custom regarding" }),
      "Client follow-up"
    );

    expect(screen.getByTestId("regarding-value")).toHaveTextContent(
      "Client follow-up"
    );
  });
});
