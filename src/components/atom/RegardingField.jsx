import React, { useState, useEffect } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Box,
} from "@mui/material";
import {
  CUSTOM_REGARDING_LABEL,
  CUSTOM_REGARDING_VALUE,
  getRegardingOptions,
} from "../helperFunc";

const RegardingField = ({
  formData,
  handleInputChange,
  picklistConfig,
  preserveExistingValue = false,
}) => {
  const existingValue = formData.Regarding;
  const predefinedOptions = React.useMemo(
    () =>
      getRegardingOptions(
        formData.Type_of_Activity,
        existingValue,
        picklistConfig,
        preserveExistingValue
      ),
    [
      existingValue,
      formData.Type_of_Activity,
      picklistConfig,
      preserveExistingValue,
    ]
  );
  const selectableOptions = React.useMemo(
    () =>
      predefinedOptions.filter((option) => option !== CUSTOM_REGARDING_VALUE),
    [predefinedOptions]
  );

  const [selectedValue, setSelectedValue] = useState(existingValue);
  const [manualInput, setManualInput] = useState("");
  const previousActivityType = React.useRef(formData.Type_of_Activity);

  useEffect(() => {
    const activityTypeChanged =
      previousActivityType.current !== formData.Type_of_Activity;
    previousActivityType.current = formData.Type_of_Activity;

    // Values entered in edit mode are deliberately preserved as options. Keep
    // an actively selected Custom editor open as its controlled value changes.
    if (selectedValue === CUSTOM_REGARDING_VALUE && !activityTypeChanged) {
      return;
    }

    if (existingValue && !selectableOptions.includes(existingValue)) {
      setSelectedValue(CUSTOM_REGARDING_VALUE);
      setManualInput(existingValue);
    } else if (selectableOptions.includes(existingValue)) {
      setSelectedValue(existingValue);
      setManualInput("");
    } else {
      setSelectedValue("");
      setManualInput("");
    }
  }, [
    existingValue,
    formData.Type_of_Activity,
    selectableOptions,
    selectedValue,
  ]);

  const handleSelectChange = (event) => {
    const value = event.target.value;
    setSelectedValue(value);

    if (value !== CUSTOM_REGARDING_VALUE) {
      setManualInput(""); // Clear manual input when a predefined option is selected
      handleInputChange("Regarding", value);
    } else {
      setManualInput("");
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
          {selectableOptions.map((option) => (
            <MenuItem key={option} value={option} sx={{ fontSize: "9pt" }}>
              {option}
            </MenuItem>
          ))}
          <MenuItem value={CUSTOM_REGARDING_VALUE} sx={{ fontSize: "9pt" }}>
            {CUSTOM_REGARDING_LABEL}
          </MenuItem>
        </Select>
      </FormControl>

      {selectedValue === CUSTOM_REGARDING_VALUE && (
        <TextField
          label="Custom Regarding"
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
