import * as React from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  TextField,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  InputLabel,
  Typography,
  Divider,
  Tooltip,
  Snackbar,
  Alert,
  Box,
  Link,
} from "@mui/material";
import "react-quill/dist/quill.snow.css";
import { useEffect } from "react";
import {
  getResultBasedOnActivityType,
  getResultBasedOnActivityType2,
} from "./helperFunc";
import useEventsStore from "../store/eventsStore";

export default function ClearActivityModal({
  open,
  handleClose,
  selectedRowData,
  ZOHO,
  setEvents, // Keep for backward compatibility
  filterDate, // Add filterDate prop to know current filter
  picklistConfig,
}) {
  // --- Global State Management (Zustand) ---
  const { updateEvent, removeEvent, updateCacheEntry, removeEventFromCache, getCache, setEvents: setStoreEvents } = useEventsStore();
  
  /**
   * Restore events from cache for the current filter if needed
   * This ensures the table doesn't go empty after clearing/erasing
   * Only restores if the current events array is empty or very small
   */
  const restoreEventsFromCache = () => {
    const store = useEventsStore.getState();
    const currentEvents = store.events;
    
    // Only restore if events array is empty or suspiciously small (might have been cleared)
    if (currentEvents && currentEvents.length > 0) {
      // Events exist, no need to restore
      return;
    }
    
    if (!filterDate) return;
    
    // Try to restore from current filter's cache
    const currentCache = store.getCache(filterDate);
    if (currentCache && currentCache.data && currentCache.data.length > 0) {
      // Restore events from cache for current filter
      console.log(`✅ Restoring events from cache["${filterDate}"]:`, currentCache.data.length, 'events');
      store.setEvents(currentCache.data);
      return;
    }
    
    // Fallback to Default cache if current filter cache is empty
    if (filterDate !== "Default") {
      const defaultCache = store.getCache("Default");
      if (defaultCache && defaultCache.data && defaultCache.data.length > 0) {
        console.log('✅ Restoring events from cache["Default"]:', defaultCache.data.length, 'events');
        store.setEvents(defaultCache.data);
      }
    }
  };
  const calculateDuration = (durationInMinutes) => {
    if (!durationInMinutes) return "5 minutes";
    const minutes = parseInt(durationInMinutes, 10);
    if (minutes < 60) {
      return `${minutes} minutes`;
    } else {
      const hours = Math.floor(minutes / 60);
      return `${hours} hour${hours > 1 ? "s" : ""}`;
    }
  };

  const [duration, setDuration] = React.useState(
    calculateDuration(selectedRowData?.duration)
  );

  const [result, setResult] = React.useState(selectedRowData?.result || "");
  const [addActivityToHistory, setAddActivityToHistory] = React.useState(false);
  const [clearChecked, setClearChecked] = React.useState(
    selectedRowData?.Event_Status === "Closed" // true if the event is closed, false if open
  );

  const [eraseChecked, setEraseChecked] = React.useState(false);
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  const [snackbarMessage, setSnackbarMessage] = React.useState("");
  const [snackbarSeverity, setSnackbarSeverity] = React.useState("success");

  const handleEraseChange = (event) => {
    setEraseChecked(event.target.checked);
    setClearChecked(false);
    setResult(
      getResultBasedOnActivityType(
        selectedRowData.Type_of_Activity,
        picklistConfig
      )
    );
  };

  const [existingHistory, setExistingHistory] = React.useState([]);

  const [activityDetails, setActivityDetails] = React.useState(
    selectedRowData?.Description || ""
  );

  useEffect(() => {
    if (!selectedRowData || !ZOHO) return;

    if(selectedRowData.Description){
      setAddActivityToHistory(true)
    }
    const getRecords = async () => {
      try {
        const historyResponse = await ZOHO.CRM.API.searchRecord({
          Entity: "History1",
          Type: "criteria",
          Query: "(Event_ID:equals:" + selectedRowData.id + ")",
        });

        if (historyResponse?.data?.length > 0) {
          const historyData = historyResponse.data[0];
          setExistingHistory(historyResponse.data);
          setAddActivityToHistory(true);
          setActivityDetails(historyData?.History_Details_Plain || "");
          setResult(historyData?.History_Result || "");
        }
      } catch (error) {
        console.error("Error loading activity history:", error);
      }
    };

    getRecords();
  }, [selectedRowData, ZOHO]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Helper to update only the history record
      const updateHistoryOnly = async () => {
        const historyRecordId = existingHistory[0]?.id;
        const updatedHistoryData = {
          History_Details_Plain: activityDetails,
          History_Result: result,
          id: historyRecordId
        };

        const updateResponse = await ZOHO.CRM.API.updateRecord({
          Entity: "History1",
          RecordID: historyRecordId,
          APIData: updatedHistoryData,
        });

        if (updateResponse.data[0].code === "SUCCESS") {
          setSnackbarMessage("History updated successfully!");
          setSnackbarSeverity("success");
          setSnackbarOpen(true);
        } else {
          setSnackbarMessage("Failed to update history.");
          setSnackbarSeverity("warning");
          setSnackbarOpen(true);
          return false;
        }
        return true;
      };

      // Helper to create or update history
      const createOrUpdateHistory = async () => {
        const recordData = {
          Name:
            (selectedRowData.Participants || []).length > 0
              ? selectedRowData.Participants.map(
                  (participant) => participant.name
                ).join(", ")
              : selectedRowData?.Event_Title,
          Duration: selectedRowData?.Duration_Min,
          History_Type: selectedRowData?.Type_of_Activity,
          Stakeholder: { id: selectedRowData?.What_Id?.id },
          Regarding: selectedRowData?.Regarding,
          Date: selectedRowData?.Start_DateTime,
          Owner: selectedRowData?.Owner,
          History_Details_Plain: activityDetails,
          History_Result: result,
          Event_ID: selectedRowData?.id,
        };

        if (existingHistory.length > 0) {
          return await updateHistoryOnly();
        } else {
          console.log({ existingHistory });

          const historyResponse = await ZOHO.CRM.API.insertRecord({
            Entity: "History1",
            APIData: recordData,
            Trigger: ["workflow"],
          });

          if (historyResponse.data[0].code === "SUCCESS") {
            // Loop through each selected participant
            for (const participant of selectedRowData.Participants) {
              const historyXContactRecordData = {
                Contact_Details: { id: participant.participant },
                Contact_History_Info: {
                  id: historyResponse?.data[0]?.details?.id,
                },
                Duration: selectedRowData?.Duration_Min,
                History_Type: selectedRowData?.Type_of_Activity,
                Stakeholder: { id: selectedRowData?.What_Id?.id },
                Regarding: selectedRowData?.Regarding,
                History_Date_Time: selectedRowData?.Start_DateTime,
                Owner: selectedRowData?.Owner,
                History_Details: activityDetails,
                History_Result: result,
                Event_ID: selectedRowData?.id,
              };

              try {
                await ZOHO.CRM.API.insertRecord({
                  Entity: "History_X_Contacts",
                  APIData: historyXContactRecordData,
                  Trigger: ["workflow"],
                });
                console.log(
                  `Record inserted for participant ${participant.name}`
                );
              } catch (error) {
                console.error(
                  `Error inserting record for ${participant.name}:`,
                  error
                );
              }
            }

            setSnackbarMessage("New history created successfully!");
            setSnackbarSeverity("success");
            setSnackbarOpen(true);
          } else {
            setSnackbarMessage("Failed to create new history.");
            setSnackbarSeverity("warning");
            setSnackbarOpen(true);
            return false;
          }
          return true;
        }
      };

      // CASE 1: "Clear" checked and "Erase" unchecked → Close the event
      if (clearChecked && !eraseChecked) {
        const updateResponse = await ZOHO.CRM.API.updateRecord({
          Entity: "Events",
          RecordID: selectedRowData?.id,
          APIData: {
            id: selectedRowData?.id,
            Event_Status: "Closed",
            result: result,
          },
        });

        if (updateResponse.data[0].code === "SUCCESS") {
          setSnackbarMessage("Event marked as cleared successfully!");
          setSnackbarSeverity("success");
          setSnackbarOpen(true);

          // Update global store - only update the specific record
          const updatedEvent = { 
            ...selectedRowData, 
            Event_Status: "Closed", 
            result: result 
          };
          
          // Update master list
          updateEvent(updatedEvent);
          
          // Update all cache entries (so switching filters shows updated status)
          updateCacheEntry(updatedEvent);
          
          // Restore events from cache to ensure table doesn't go empty
          // This is critical - after updating, ensure events are restored from cache
          restoreEventsFromCache();
          
          // Also update via prop if provided (backward compatibility)
          // Do this AFTER cache restoration to avoid conflicts
          if (setEvents) {
            const store = useEventsStore.getState();
            setEvents(store.events);
          }
          
          if (addActivityToHistory) {
            await createOrUpdateHistory();
          }
        } else {
          throw new Error("Failed to update the event.");
        }
      }

      // CASE 2: Both "Clear" and "Erase" unchecked → Open the event
      if (!clearChecked && !eraseChecked) {
        const eventResponse = await ZOHO.CRM.API.getRecord({
          Entity: "Events",
          approved: "both",
          RecordID: selectedRowData?.id,
        });

        if (eventResponse.data.length > 0) {
          const latestHistory = eventResponse.data[0];
          const updateResponse = await ZOHO.CRM.API.updateRecord({
            Entity: "Events",
            RecordID: selectedRowData?.id,
            APIData: {
              id: selectedRowData?.id,
              Event_Status: "Open",
            },
          });

          if (updateResponse.data[0].code === "SUCCESS") {
            setSnackbarMessage(
              "Event status updated to Open with history restored."
            );
            setSnackbarSeverity("success");
            setSnackbarOpen(true);

            // Update global store - only update the specific record
            const updatedEvent = { ...selectedRowData, Event_Status: "Open" };
            
            // Update master list
            updateEvent(updatedEvent);
            
            // Update all cache entries (so switching filters shows updated status)
            updateCacheEntry(updatedEvent);
            
            // Restore events from cache to ensure table doesn't go empty
            restoreEventsFromCache();
            
            // Also update via prop if provided (backward compatibility)
            // Do this AFTER cache restoration to avoid conflicts
            if (setEvents) {
              const store = useEventsStore.getState();
              setEvents(store.events);
            }
          } else {
            throw new Error("Failed to update the event with history.");
          }
        } else {
          setSnackbarMessage("No related history found to restore.");
          setSnackbarSeverity("info");
          setSnackbarOpen(true);
        }
      }

      // CASE 3: "Erase" checked → Delete the event
      if (!clearChecked && eraseChecked) {
        const deleteResponse = await ZOHO.CRM.API.deleteRecord({
          Entity: "Events",
          RecordID: selectedRowData?.id,
        });

        if (deleteResponse.data[0].code === "SUCCESS") {
          setSnackbarMessage("Event erased successfully!");
          setSnackbarSeverity("success");
          setSnackbarOpen(true);

          // Remove from global store - only remove the specific record
          removeEvent(selectedRowData?.id);
          
          // Also remove from all cache entries - only remove the specific record
          removeEventFromCache(selectedRowData?.id);
          
          // Restore events from cache to ensure table doesn't go empty
          // This is critical - after removing, ensure remaining events are restored from cache
          restoreEventsFromCache();
          
          // Also update via prop if provided (backward compatibility)
          // Do this AFTER cache restoration to avoid conflicts
          if (setEvents) {
            const store = useEventsStore.getState();
            setEvents(store.events);
          }

          if (addActivityToHistory) {
            await createOrUpdateHistory();
          }
        } else {
          throw new Error("Failed to delete the event.");
        }
      }

      // Handle only history update when event data is unchanged
      if (!clearChecked && !eraseChecked && isActivityDetailsUpdated) {
        await updateHistoryOnly();
      }

      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (error) {
      console.error("Error during submission:", error);
      setSnackbarMessage("An unexpected error occurred, try again!");
      setSnackbarSeverity("error");
      setSnackbarOpen(true);
    }
  };

  const isUpdateDisabled =
    (selectedRowData?.Event_Status === null &&
      !clearChecked &&
      !eraseChecked) ||
    (selectedRowData?.Event_Status === "Closed" && clearChecked) ||
    (selectedRowData?.Event_Status === "Open" && !clearChecked);

  const handleClearChange = (event) => {
    setClearChecked(event.target.checked); // Update the checkbox state
    setEraseChecked(false); // Uncheck the "Erase" checkbox when "Clear" is changed
    setResult(
      getResultBasedOnActivityType(
        selectedRowData.Type_of_Activity,
        picklistConfig
      )
    );

    if (!event.target.checked) {
      // Log data when the checkbox is unchecked
      console.log("Clear checkbox unchecked. Current data:", {
        eventStatus: selectedRowData?.Event_Status,
        selectedRowData,
        result,
      });
    }
  };

  const [isActivityDetailsUpdated, setIsActivityDetailsUpdated] =
    React.useState(false);
  const handleActivityDetailsChange = (e) => {
    setActivityDetails(e.target.value);
    setIsActivityDetailsUpdated(true);
  };

  // Delete existing history
  const handleDeleteHistory = async () => {
    const historyRecordId = existingHistory[0]?.id;

    const getAllHistoryXcontacts = await ZOHO.CRM.API.getRelatedRecords({
      Entity: "History1",
      RecordID: historyRecordId,
      RelatedList: "Contacts3",
      page: 1,
      per_page: 200,
    });

    const deleteResponse = await ZOHO.CRM.API.deleteRecord({
      Entity: "History1",
      RecordID: historyRecordId,
    });

    if (deleteResponse.data[0].code === "SUCCESS") {
      setActivityDetails("");
      if (getAllHistoryXcontacts.data.length > 0) {
        for (const participant of getAllHistoryXcontacts.data) {
          const relatedRecordsDelete = await ZOHO.CRM.API.deleteRecord({
            Entity: "History_X_Contacts",
            RecordID: participant?.id,
          });
        }
      }
      setSnackbarMessage("History deleted successfully!");
      setSnackbarSeverity("success");
      setSnackbarOpen(true);
      setExistingHistory([]);
      setTimeout(() => {
        handleClose();
      }, 1000);
    } else {
      setSnackbarMessage("Failed to delete history.");
      setSnackbarSeverity("error");
      setSnackbarOpen(true);
    }
  };

  const handleActivityToHistory = (e) => {
    setAddActivityToHistory(e.target.checked);
    if (e.target.checked === false) {
      setActivityDetails("");
    } else {
      setActivityDetails(selectedRowData?.Description || "");
    }
  };

  const [filteredActivities, setFilteredActivities] = React.useState([]);
  
  useEffect(() => {
    if (selectedRowData?.Type_of_Activity) {
      const filteredOptions = getResultBasedOnActivityType2(
        selectedRowData.Type_of_Activity,
        picklistConfig
      );
      setFilteredActivities(filteredOptions);
  
      // Set the first option as the default if no result is already set
      if (filteredOptions.length > 0 && !selectedRowData?.result) {
        setResult(filteredOptions[0]);
      }
    }
  }, [selectedRowData?.Type_of_Activity, picklistConfig]);

  const displayedResultOptions =
    result && !filteredActivities.includes(result)
      ? [result, ...filteredActivities]
      : filteredActivities;





  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        PaperProps={{
          sx: {
            padding: "20px",
            borderRadius: "10px",
            maxWidth: "600px",
            "& .MuiTextField-root, & .MuiFormControl-root": {
              fontSize: "9pt",
            },
            "& .MuiInputBase-root": {
              fontSize: "9pt",
            },
            "& .MuiFormLabel-root": {
              fontSize: "9pt",
            },
            "& .MuiSelect-root": {
              fontSize: "9pt",
            },
            "& .MuiMenuItem-root": {
              fontSize: "9pt",
            },
            "& .MuiTypography-root": {
              fontSize: "9pt",
            },
            "& .MuiCheckbox-root + span": {
              fontSize: "9pt",
            },
            "& .MuiButton-root": {
              fontSize: "9pt",
            },
          },
        }}
      >
        {selectedRowData === null ? (
          <DialogContent>{/* <CircularProgress /> */}</DialogContent>
        ) : (
          <>
            <DialogTitle
              id="modal-title"
              sx={{ fontWeight: "bold", fontSize: "9pt" }}
            >
              Clear Activity
            </DialogTitle>
            <Divider />
            <form onSubmit={handleSubmit}>
              <DialogContent>
                <Typography
                  variant="subtitle1"
                  sx={{ marginBottom: "10px", fontSize: "9pt" }}
                >
                  <strong>Type:</strong> {selectedRowData?.Type_of_Activity}
                </Typography>
                <TextField
                  fullWidth
                  label="Title"
                  value={selectedRowData?.Event_Title || ""}
                  margin="dense"
                  multiline
                  disabled
                  size="small"
                />
                <TextField
                  fullWidth
                  label="Organiser"
                  value={selectedRowData?.Owner?.name || ""}
                  margin="dense"
                  size="small"
                  disabled
                />
                <TextField
                  fullWidth
                  label="Participants"
                  value={
                    selectedRowData?.Participants &&
                    selectedRowData.Participants.length > 0
                      ? selectedRowData.Participants.map(
                          (participant) => participant.name
                        ).join(", ")
                      : "No Participant"
                  }
                  margin="dense"
                  size="small"
                  disabled
                />
                <TextField
                  fullWidth
                  label="Associate With"
                  value={selectedRowData?.What_Id?.name || ""}
                  margin="dense"
                  size="small"
                  disabled
                />

                <FormGroup>
                  <InputLabel
                    id="duration-label"
                    sx={{ fontWeight: "bold", fontSize: "9pt" }}
                  >
                    Duration
                  </InputLabel>
                  <Select
                    labelId="duration-label"
                    value={duration}
                    size="small"
                    onChange={(e) => setDuration(e.target.value)}
                    sx={{ minWidth: 150 }}
                    disabled
                  >
                    <MenuItem value="5 minutes">5 minutes</MenuItem>
                    <MenuItem value="30 minutes">30 minutes</MenuItem>
                    <MenuItem value="1 hour">1 hour</MenuItem>
                    <MenuItem value="2 hours">2 hours</MenuItem>
                  </Select>
                </FormGroup>

                <Typography
                  variant="subtitle1"
                  sx={{
                    marginTop: "15px",
                    fontWeight: "bold",
                    fontSize: "9pt",
                  }}
                >
                  Results:
                </Typography>
                <FormGroup row>
                  <Tooltip
                    title="Mark this event as cleared and update its status"
                    arrow
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={clearChecked}
                          onChange={handleClearChange}
                          inputProps={{ "aria-label": "Clear" }}
                        />
                      }
                      label="Clear"
                    />
                  </Tooltip>
                  <Tooltip title="Delete this event permanently" arrow>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={eraseChecked}
                          onChange={handleEraseChange}
                          inputProps={{ "aria-label": "Erase" }}
                        />
                      }
                      label="Erase"
                    />
                  </Tooltip>
                  <Select
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    sx={{ marginLeft: 2, minWidth: 150, fontSize: "9pt" }} // Ensure font size for Select input
                    size="small"
                  >
                    {displayedResultOptions.map((option) => (
                      <MenuItem
                        key={option}
                        value={option}
                        sx={{ fontSize: "9pt" }}
                      >
                        {option}
                      </MenuItem>
                    ))}
                  </Select>
                </FormGroup>

                {existingHistory.length > 0 ? (
                  <Box sx={{ p: "20px 0px" }}>
                    <Typography variant="subtitle1">
                      Existing History:
                      <Link
                        href={`https://crm.zoho.com.au/crm/org7004396182/tab/CustomModule4/${existingHistory[0].id}`}
                        target="_blank"
                        style={{
                          marginLeft: "8px",
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        View History
                      </Link>
                      <Button
                        variant="outlined"
                        color="secondary"
                        size="small"
                        style={{ marginLeft: "16px" }}
                        onClick={handleDeleteHistory}
                      >
                        Delete History
                      </Button>
                    </Typography>
                  </Box>
                ) : (
                  <Tooltip
                    title="Add the activity details to history for future reference"
                    arrow
                  >
                    <FormControlLabel
                      control={
                          <Checkbox
                            checked={addActivityToHistory}
                            onChange={handleActivityToHistory}
                            inputProps={{
                              "aria-label": "Add Activity Details to History",
                            }}
                          // onChange={(e) =>
                          //   setAddActivityToHistory(e.target.checked)
                          // }
                          color="primary"
                        />
                      }
                      label="Add Activity Details to History"
                    />
                  </Tooltip>
                )}

                <TextField
                  fullWidth
                  label="Activity Details"
                  value={activityDetails}
                  onChange={handleActivityDetailsChange}
                  margin="dense"
                  multiline
                  minRows={4}
                  size="small"
                  disabled={!addActivityToHistory}
                />
              </DialogContent>

              <DialogActions>
                <Button
                  onClick={handleClose}
                  color="primary"
                  variant="outlined"
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSubmit}
                  // disabled={!addActivityToHistory || !isActivityDetailsUpdated}
                  disabled={false}
                >
                  Update
                </Button>
              </DialogActions>
            </form>
          </>
        )}
      </Dialog>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: "100%", fontSize: "9pt" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
}
