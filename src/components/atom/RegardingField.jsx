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

const RegardingField = ({ formData, handleInputChange, picklistConfig }) => {
  const existingValue = formData.Regarding;
  const predefinedOptions = getRegardingOptions(
    formData.Type_of_Activity,
    existingValue,
    picklistConfig
  ); // Get dynamic options based on type

  const [selectedValue, setSelectedValue] = useState(existingValue);
  const [manualInput, setManualInput] = useState("");

  useEffect(() => {
    // If existingValue is not in the predefined options, set it to "Other" and show manual input
    if (existingValue && !predefinedOptions.includes(existingValue)) {
      setSelectedValue("Other");
      setManualInput(existingValue);
    } else {
      setSelectedValue(existingValue);
      setManualInput("");
    }
  }, [formData.Type_of_Activity, existingValue, picklistConfig]);

  const handleSelectChange = (event) => {
    const value = event.target.value;
    setSelectedValue(value);

    if (value !== "Other") {
      setManualInput(""); // Clear manual input when a predefined option is selected
      handleInputChange("Regarding", value);
    } else {
      setManualInput(""); // Reset manual input when "Other" is selected
    }
  };

  const handleManualInputChange = (event) => {
    const value = event.target.value;
    setManualInput(value);
    
  };

  const handleBlur = () => {
    handleInputChange("Regarding", manualInput);
  }

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
          <MenuItem value="Other" sx={{ fontSize: "9pt" }}>
            Other (Manually enter)
          </MenuItem>
        </Select>
      </FormControl>

      {selectedValue === "Other" && (
        <TextField
          label="Enter your custom regarding"
          fullWidth
          size="small"
          value={manualInput}
          onChange={handleManualInputChange}
          onBlur={handleBlur}
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
