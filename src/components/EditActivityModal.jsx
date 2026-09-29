import React from "react";
import "@mobiscroll/react/dist/css/mobiscroll.min.css";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import FirstComponent from "./FirstComponent";
import SecondComponent from "./SecondComponent";
import ThirdComponent from "./ThirdComponent";
import CloseIcon from "@mui/icons-material/Close";
import dayjs from "dayjs";
import useEventsStore from "../store/eventsStore";
import {
  formatDateTimeForCrm,
  parseCrmDateTime,
} from "./helperFunc";

// Function to calculate Remind_At based on Reminder_Text
function calculateRemindAt(reminderText, startDateTime) {
  const startDate = parseCrmDateTime(startDateTime)?.toDate();
  if (!startDate) return null;
  // Calculate the amount of time to subtract based on Reminder_Text
  switch (reminderText) {
    case "At time of meeting":
      break;
    case "5 minutes before":
      startDate.setMinutes(startDate.getMinutes() - 5);
      break;
    case "15 minutes before":
      startDate.setMinutes(startDate.getMinutes() - 15);
      break;
    case "30 minutes before":
      startDate.setMinutes(startDate.getMinutes() - 30);
      break;
    case "1 hour before":
      startDate.setHours(startDate.getHours() - 1);
      break;
    case "2 hours before":
      startDate.setHours(startDate.getHours() - 2);
      break;
    case "1 day before":
      startDate.setDate(startDate.getDate() - 1);
      break;
    case "2 days before":
      startDate.setDate(startDate.getDate() - 2);
      break;
    case "None":
    default:
      return null; // No reminder
  }
  // Format the updated date back into the required ISO string format
  return formatDateTimeForCrm(startDate);
}

export function buildEditActivityPayload(data) {
  // Function to transform scheduleWith data into the Participants format
  const transformScheduleWithToParticipants = (scheduleWith) => {
    return scheduleWith.map((contact) => ({
      Email: contact.Email || null, // Use Email if available, or set to null
      name: contact.Full_Name || contact.name || null,
      invited: false, // Default to false
      type: "contact", // Default type to "contact"
      participant: contact.id || contact.participant, // Use id as participant ID
      status: "not_known", // Default status to "not_known"
    }));
  };

  const participantsFromScheduleWith = data.scheduledWith
    ? transformScheduleWithToParticipants(data.scheduledWith)
    : [];

  const hasDuration = data.Duration_Min !== "" && data.Duration_Min != null;
  let transformedData = {
    ...data,
    Start_DateTime: formatDateTimeForCrm(data.start),
    End_DateTime: formatDateTimeForCrm(data.end),
    Description: data.Description, // Map `description` to `Description`
    Event_Priority: data.priority, // Map `priority` to `Event_Priority`

    // Updated `What_Id` with both name and id from `associateWith`
    What_Id: data.What_Id,
    se_module: "Accounts",

    Participants: participantsFromScheduleWith,
    ...(hasDuration ? { Duration_Min: String(data.Duration_Min) } : {}),
    Owner: {
      id: data?.scheduleFor?.id,
    },
  };
  if (!hasDuration) delete transformedData.Duration_Min;

  if (
    data?.Reminder_Text !== null &&
    data?.Reminder_Text !== "" &&
    data?.Reminder_Text !== "None"
  ) {
    const remindAt = calculateRemindAt(
      data?.Reminder_Text,
      formatDateTimeForCrm(data.start)
    );
    transformedData["Remind_At"] = remindAt;
    delete transformedData.User_Reminder;
  }

  if (data.Send_Reminders) {
    const startTime = dayjs(data.start);

    let modifiedReminderDate = null;

    if (data.Reminder_Text === "At time of meeting") {
      modifiedReminderDate = startTime.format("YYYY-MM-DDTHH:mm:ssZ");
    } else {
      const reminderTime = startTime.subtract(
        parseInt(data?.Reminder_Text.split(" ")[0]),
        "minute"
      );
      modifiedReminderDate = reminderTime.format("YYYY-MM-DDTHH:mm:ssZ");
      transformedData.Remind_At = modifiedReminderDate;
      // transformedData.Participant_Reminder = modifiedReminderDate;
      transformedData.User_Reminder = modifiedReminderDate;
    }
    transformedData.Send_Reminders = true;
  }

  if (data.Send_Invites) {
    const startTime = dayjs(data.start);

    let modifiedReminderDate = null;

    if (data.Reminder_Text === "At time of meeting") {
      modifiedReminderDate = startTime.format("YYYY-MM-DDTHH:mm:ssZ");
    } else {
      const reminderTime = startTime.subtract(
        parseInt(data?.Reminder_Text.split(" ")[0]),
        "minute"
      );
      modifiedReminderDate = reminderTime.format("YYYY-MM-DDTHH:mm:ssZ");
      transformedData.Remind_At = modifiedReminderDate;
      transformedData.User_Reminder = modifiedReminderDate;
    }
    transformedData.send_notification = true;
  }

  // Explicitly remove the scheduleWith, scheduleFor, and description keys
  delete transformedData.scheduledWith;
  delete transformedData.scheduleFor;
  delete transformedData.description;
  delete transformedData.associateWith;
  delete transformedData.start;
  delete transformedData.end;
  delete transformedData.priority;

  // Remove keys that have null or undefined values
  Object.keys(transformedData).forEach((key) => {
    if (transformedData[key] === null || transformedData[key] === undefined) {
      delete transformedData[key];
    }
  });

  return transformedData;
}

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box p={3}>{children}</Box>}
    </div>
  );
}

const EditActivityModal = ({
  openEditModal,
  handleClose,
  selectedRowData,
  ZOHO,
  users,
  updateEventState, // provided by parent/context; updates events + cache immutably (backward compatibility)
  picklistConfig,
}) => {
  // --- Global State Management (Zustand) ---
  // Use store directly for optimistic updates
  const { updateEvent, updateCacheEntry } = useEventsStore();
  const theme = useTheme();
  const [value, setValue] = useState(0);
  const [textvalue, setTextValue] = useState("");
  const [formData, setFormData] = useState({
    id: selectedRowData?.id,
    Event_Title: selectedRowData?.Event_Title || "",
    Type_of_Activity: selectedRowData?.Type_of_Activity || "",
    start: selectedRowData?.Start_DateTime || "",
    end: selectedRowData?.End_DateTime || "",
    Duration_Min: selectedRowData?.Duration_Min ?? "",
    What_Id: selectedRowData?.What_Id || "",
    scheduledWith: selectedRowData?.Participants
      ? selectedRowData.Participants
      : [], // Map 'name' and 'participant' to create the appropriate structure for Autocomplete
    Venue: selectedRowData?.Venue || "",
    priority: selectedRowData?.Event_Priority || "",
    ringAlarm: selectedRowData?.ringAlarm || "",
    Colour: selectedRowData?.Colour || "#ff0000",
    Regarding: selectedRowData?.Regarding || "",
    Description: selectedRowData?.Description || "",
    Banner: selectedRowData?.Banner || false,
    scheduleFor: selectedRowData?.Owner || null,
    Reminder_Text: selectedRowData?.Reminder_Text || null,
    reminder: selectedRowData.$send_notification || false,
    Send_Invites: selectedRowData.$send_notification || null,
    Send_Reminders: selectedRowData.Send_Reminders || null,
  });

  const [isSnackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState("success");

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  // Handlers for Next and Back buttons
  const handleNext = () => {
    if (value < 2) setValue(value + 1); // Increment to next tab
  };

  const handleBack = () => {
    if (value > 0) setValue(value - 1); // Decrement to previous tab
  };

  const handleInputChange = (field, value) => {
    if (field === "resource") {
      value = parseInt(value, 10); // Convert the input to an integer
    }

    if (field === "scheduleWith") {
      setFormData((prev) => ({
        ...prev,
        [field]: Array.isArray(value) ? [...value] : value, // Spread array values for multiple selections
      }));
    }
    setFormData((prevState) => ({
      ...prevState,
      [field]: value,
    }));
  };
  const handleSubmit = async () => {
    const transformedData = buildEditActivityPayload(formData);

    const timeFormatted = dayjs(formData.start).format("hh:mm A");
    formData.time = timeFormatted;
    formData.Participants = formData.scheduledWith;
    formData.Owner = formData.scheduleFor;

    try {
      // STEP 1: API First - Call ZOHO.CRM.API.updateRecord to save to database
      const data = await ZOHO.CRM.API.updateRecord({
        Entity: "Events",
        APIData: transformedData,
        Trigger: ["workflow"],
      });

      if (data?.data?.[0]?.code === "SUCCESS") {
        setSnackbarSeverity("success");
        setSnackbarMessage("Event updated successfully.");
        setSnackbarOpen(true);
        
        // STEP 2: Build the complete updated record object
        // Prefer server-returned fields, fall back to what we just sent
        const updatedEventData = data.data[0].details || {};

        const updatedRecord = {
          ...selectedRowData,
          ...transformedData,
          ...updatedEventData,
          id: selectedRowData?.id,
          Start_DateTime:
            updatedEventData.Start_DateTime ||
            transformedData.Start_DateTime ||
            formData.start,
          End_DateTime:
            updatedEventData.End_DateTime ||
            transformedData.End_DateTime ||
            formData.end,
          Event_Priority:
            updatedEventData.Event_Priority ||
            transformedData.Event_Priority ||
            formData.priority,
          Type_of_Activity:
            updatedEventData.Type_of_Activity ||
            transformedData.Type_of_Activity ||
            formData.Type_of_Activity,
          Description:
            updatedEventData.Description ||
            transformedData.Description ||
            formData.Description,
          Duration_Min:
            updatedEventData.Duration_Min ??
            transformedData.Duration_Min ??
            formData.Duration_Min,
          Participants:
            updatedEventData.Participants ||
            transformedData.Participants ||
            formData.scheduledWith ||
            [],
          Owner:
            updatedEventData.Owner ||
            transformedData.Owner ||
            formData.scheduleFor ||
            selectedRowData?.Owner,
          What_Id:
            updatedEventData.What_Id ||
            transformedData.What_Id ||
            selectedRowData?.What_Id,
        };

        // STEP 3: Update Global State (No Refetch)
        // The updateEventState function will:
        // - Update the master events list in store
        // - Update all cache entries
        // - Re-validate if event still matches current filter
        // - Keep visible if it matches, remove from view if it doesn't (but keep in cache)
        if (updateEventState) {
          updateEventState(updatedRecord);
        } else {
          // Fallback: Direct store update if updateEventState not provided
          updateEvent(updatedRecord);
          updateCacheEntry(updatedRecord);
        }

        setTimeout(() => {
          handleClose();
        }, 1000);
      } else {
        throw new Error("Failed to update event");
      }
    } catch (error) {
      console.error("Error updating event:", error);
      setSnackbarSeverity("error");
      setSnackbarMessage("Error updating event.");
      setSnackbarOpen(true);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  console.log({ selectedRowData });

  return (
    <Box
      sx={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "90%",
        maxWidth: "750px",
        bgcolor: "background.paper",
        borderRadius: 4,
        boxShadow: 24,
        overflowY: "auto",
        maxHeight: "90vh", // Ensure the modal is scrollable if content exceeds the viewport
        zIndex: 100,
        p: "15px 30px  20px 30px",
        fontSize: "9pt", // Set the font size to 9pt
      }}
    >
      <Box display="flex" justifyContent="space-between" mb={2}>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: "bold" }}
          align="center"
        >
          Edit Activity
        </Typography>

        {/* Replacing IconButton with Cancel Button */}
        <Button
          variant="outlined"
          color="error"
          onClick={handleClose}
          endIcon={<CloseIcon />}
        >
          Cancel
        </Button>
      </Box>
      <Box>
        <Tabs
          value={value}
          onChange={handleChange}
          textColor="inherit"
          aria-label="simple tabs example"
          TabIndicatorProps={{ style: { display: "none" } }} // hide default underline
        >
          <Tab label="General" />
          <Tab label="Details" />
          <Tab
            label="Recurrence"
            sx={
              selectedRowData?.Recurring_Activity && value !== 2
                ? {
                    backgroundColor: "#1976d2", // MUI blue
                    color: "#fff",
                    borderRadius: 1,
                    fontWeight: "bold",
                    "&:hover": {
                      backgroundColor: "#1565c0",
                    },
                  }
                : {}
            }
          />
        </Tabs>
      </Box>
      {value === 0 && (
        <Box sx={{ p: 0, borderRadius: 1 }}>
          <FirstComponent
            formData={formData}
            handleInputChange={handleInputChange}
            users={users}
            selectedRowData={selectedRowData}
            ZOHO={ZOHO}
            isEditMode={true} // Pass true if it's the EditModal, false otherwise
            picklistConfig={picklistConfig}
          />
          <Box display="flex" justifyContent="space-between" mt={2}>
            <Button size="small" onClick={handleBack}>
              Back
            </Button>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                variant="contained"
                color="secondary"
                onClick={handleSubmit}
              >
                Ok
              </Button>
              <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={handleNext}
              >
                Next
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {value === 1 && (
        <Box sx={{ p: 1, borderRadius: 1 }}>
          <TextField
            multiline
            rows={10}
            fullWidth
            value={formData?.Description}
            onChange={(event) =>
              handleInputChange("Description", event.target.value)
            }
          />
          <Box display="flex" justifyContent="space-between" mt={2}>
            <Button size="small" onClick={handleBack}>
              Back
            </Button>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                variant="contained"
                color="secondary"
                onClick={handleSubmit}
              >
                Ok
              </Button>
              <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={handleNext}
              >
                Next
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {value === 2 && (
        <Box sx={{ p: 2, borderRadius: 1 }}>
          <ThirdComponent
            formData={formData}
            handleInputChange={handleInputChange}
            selectedRowData={selectedRowData}
          />
          <Box display="flex" justifyContent="space-between" mt={2}>
            <Button size="small" onClick={handleBack}>
              Back
            </Button>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                variant="contained"
                color="secondary"
                onClick={handleSubmit}
              >
                Ok
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      <Snackbar
        open={isSnackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbarSeverity}
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default EditActivityModal;
