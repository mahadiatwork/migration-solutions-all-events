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

const ControlledEditField = () => {
  const [formData, setFormData] = React.useState({
    Type_of_Activity: "Meeting",
    Regarding: "Follow up",
  });

  return (
    <>
      <RegardingField
        formData={formData}
        handleInputChange={(field, value) =>
          setFormData((current) => ({ ...current, [field]: value }))
        }
        picklistConfig={{
          regarding: { Meeting: ["Follow up"] },
          _source: "custom_module",
        }}
        preserveExistingValue
      />
      <output data-testid="edit-regarding-value">{formData.Regarding}</output>
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

describe("RegardingField custom choices", () => {
  it("always appends Custom to configured choices", async () => {
    const { user } = renderField();

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));

    expect(screen.getByRole("option", { name: "Follow up" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Custom" })).toBeVisible();
  });

  it("renders a single manual Custom choice when CRM also contains Custom", async () => {
    const { user } = renderField({ options: ["Follow up", "Custom"] });

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));

    expect(screen.getAllByRole("option", { name: "Custom" })).toHaveLength(1);
  });

  it("offers Custom when the configured scope is empty", async () => {
    const { user } = renderField({ options: [] });

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));

    expect(screen.getByRole("option", { name: "Custom" })).toBeVisible();
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
    expect(screen.getByRole("option", { name: "Custom" })).toBeVisible();
  });

  it("opens manual input from Custom without CRM configuration", async () => {
    const { user } = renderField();

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));
    await user.click(screen.getByRole("option", { name: "Custom" }));

    expect(
      screen.getByRole("textbox", { name: "Custom Regarding" })
    ).toBeVisible();
  });

  it("keeps a configured Other value as a normal Regarding choice", async () => {
    const { handleInputChange, user } = renderField({ options: ["Other"] });

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));
    await user.click(screen.getByRole("option", { name: "Other" }));

    expect(handleInputChange).toHaveBeenCalledWith("Regarding", "Other");
    expect(
      screen.queryByRole("textbox", { name: "Custom Regarding" })
    ).not.toBeInTheDocument();
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
      screen.queryByRole("textbox", { name: "Custom Regarding" })
    ).not.toBeInTheDocument();
  });

  it("shows the legacy fallback and Custom when the type has no CRM scope", async () => {
    const { user } = renderField({ type: "Communication & Meetings" });

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));

    expect(screen.getByRole("option", { name: "General" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Custom" })).toBeVisible();
  });

  it("clears the fallback before saving a manual Regarding value", async () => {
    const user = userEvent.setup();
    render(<ControlledMissingScopeField />);

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));
    await user.click(screen.getByRole("option", { name: "Custom" }));

    expect(screen.getByTestId("regarding-value")).toBeEmptyDOMElement();

    await user.type(
      screen.getByRole("textbox", { name: "Custom Regarding" }),
      "Client follow-up"
    );

    expect(screen.getByTestId("regarding-value")).toHaveTextContent(
      "Client follow-up"
    );
  });

  it("keeps Custom open while an edited activity saves manual text", async () => {
    const user = userEvent.setup();
    render(<ControlledEditField />);

    await user.click(screen.getByRole("combobox", { name: "Regarding" }));
    await user.click(screen.getByRole("option", { name: "Custom" }));
    await user.type(
      screen.getByRole("textbox", { name: "Custom Regarding" }),
      "Bespoke reason"
    );

    expect(screen.getByRole("textbox", { name: "Custom Regarding" })).toHaveValue(
      "Bespoke reason"
    );
    expect(screen.getByTestId("edit-regarding-value")).toHaveTextContent(
      "Bespoke reason"
    );
  });
});
