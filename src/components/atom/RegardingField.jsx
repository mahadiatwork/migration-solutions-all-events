import React, { useState, useEffect } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Box,
} from "@mui/material";
import { getRegardingOptions } from "../helperFunc"; // Import the function

const RegardingField = ({
  formData,
  handleInputChange,
  picklistConfig,
  preserveExistingValue = false,
}) => {
  const existingValue = formData.Regarding;
  const predefinedOptions = getRegardingOptions(
    formData.Type_of_Activity,
    existingValue,
    picklistConfig,
    preserveExistingValue
  ); // Get dynamic options based on type
  const configuredOptions = getRegardingOptions(
    formData.Type_of_Activity,
    "",
    picklistConfig
  );
  const configuredRegarding = picklistConfig?.regarding;
  const hasConfiguredScope =
    picklistConfig?._source === "custom_module" &&
    configuredRegarding &&
    typeof configuredRegarding === "object" &&
    (Object.prototype.hasOwnProperty.call(
      configuredRegarding,
      formData.Type_of_Activity
    ) ||
      Object.prototype.hasOwnProperty.call(configuredRegarding, "_default"));
  const allowManualOther =
    !hasConfiguredScope || configuredOptions.includes("Other");

  const [selectedValue, setSelectedValue] = useState(existingValue);
  const [manualInput, setManualInput] = useState("");

  useEffect(() => {
    // Keep the manual editor open while clearing or replacing the prior value.
    if (allowManualOther && selectedValue === "Other" && existingValue === "") {
      return;
    }

    // If existingValue is not in the predefined options, set it to "Other" and show manual input
    if (
      allowManualOther &&
      existingValue &&
      !predefinedOptions.includes(existingValue)
    ) {
      setSelectedValue("Other");
      setManualInput(existingValue);
    } else if (predefinedOptions.includes(existingValue)) {
      setSelectedValue(existingValue);
      setManualInput("");
    } else {
      setSelectedValue("");
      setManualInput("");
    }
  }, [
    allowManualOther,
    existingValue,
    formData.Type_of_Activity,
    picklistConfig,
    preserveExistingValue,
    selectedValue,
  ]);

  const handleSelectChange = (event) => {
    const value = event.target.value;
    setSelectedValue(value);

    if (value !== "Other" || !allowManualOther) {
      setManualInput(""); // Clear manual input when a predefined option is selected
      handleInputChange("Regarding", value);
    } else {
      setManualInput(""); // Reset manual input when "Other" is selected
      handleInputChange("Regarding", "");
    }
  };

  const handleManualInputChange = (event) => {
    const value = event.target.value;
    setManualInput(value);
    handleInputChange("Regarding", value);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <FormControl fullWidth size="small" variant="outlined">
        <InputLabel id="regarding-label" sx={{ fontSize: "9pt" }}>
          Regarding
        </InputLabel>
        <Select
          labelId="regarding-label"
          id="regarding-select"
          value={selectedValue}
          onChange={handleSelectChange}
          label="Regarding"
          sx={{ fontSize: "9pt" }}
        >
          {predefinedOptions.map((option) => (
            <MenuItem key={option} value={option} sx={{ fontSize: "9pt" }}>
              {option}
            </MenuItem>
          ))}
          {allowManualOther && !predefinedOptions.includes("Other") && (
            <MenuItem value="Other" sx={{ fontSize: "9pt" }}>
              Other (Manually enter)
            </MenuItem>
          )}
        </Select>
      </FormControl>

      {allowManualOther && selectedValue === "Other" && (
        <TextField
          label="Enter your custom regarding"
          fullWidth
          size="small"
          value={manualInput}
          onChange={handleManualInputChange}
          sx={{
            mt: 2,
            fontSize: "9pt",
          }}
        />
      )}
    </Box>
  );
};

export default RegardingField;
