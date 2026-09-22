import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

// --- Helper: Parse date from known formats ---
export const safeParseDateString = (dateString) => {
  if (!dateString || dateString === "NaN/NaN/NaN" || dateString === "") {
    return null;
  }

  // Try DD/MM/YYYY format explicitly
  const dmyPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

  if (dmyPattern.test(dateString)) {
    const [, day, month, year] = dateString.match(dmyPattern);
    const parsed = dayjs.utc(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      "YYYY-MM-DD",
      true
    );
    if (parsed.isValid()) return parsed.startOf("day");
    return null;
  }

  if (isoPattern.test(dateString)) {
    const [, year, month, day] = dateString.match(isoPattern);
    const parsed = dayjs.utc(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      "YYYY-MM-DD",
      true
    );
    if (parsed.isValid()) return parsed.startOf("day");
    return null;
  }

  // Fallback to default Day.js parsing
  const fallback = dayjs.utc(dateString);
  if (fallback.isValid()) return fallback.startOf("day");

  console.warn(`❌ Failed to parse date: "${dateString}"`);
  return null;
};

// --- Main Range Filter Function ---
export const isDateInRange = (date, rangeType) => {
  const parsedDate = safeParseDateString(date);
  if (!parsedDate) {
    console.warn(`⚠️ Invalid date for filtering: "${date}"`);
    return false;
  }

  const targetDate = parsedDate.valueOf();
  const today = dayjs.utc().startOf("day");

  let startDate, endDate;

  switch (rangeType) {
    case "Today":
      startDate = today.valueOf();
      endDate = today.endOf("day").valueOf();
      break;
    case "Current Week":
      startDate = today.startOf("week").valueOf();
      endDate = today.startOf("week").add(6, "day").endOf("day").valueOf();
      break;
    case "Current Month":
      startDate = today.startOf("month").valueOf();
      endDate = today.endOf("month").valueOf();
      break;
    case "Last 7 Days":
      startDate = today.subtract(6, "day").valueOf();
      endDate = today.valueOf();
      break;
    case "Last 30 Days":
      startDate = today.subtract(29, "day").valueOf();
      endDate = today.valueOf();
      break;
    case "Last 90 Days":
      startDate = today.subtract(89, "day").valueOf();
      endDate = today.valueOf();
      break;
    case "Last Month":
      // First day of previous month to last day of previous month
      startDate = today.subtract(1, "month").startOf("month").valueOf();
      endDate = today.subtract(1, "month").endOf("month").valueOf();
      break;
    case "Next Week":
      startDate = today.add(7 - today.day(), "day").startOf("day").valueOf();
      endDate = dayjs.utc(startDate).add(6, "day").endOf("day").valueOf();
      break;
    case "Default":
    default:
      // Start from the beginning of the previous month to match API logic
      startDate = today.subtract(1, "month").startOf("month").valueOf();
      endDate = today.add(1, "year").endOf("day").valueOf();
      break;
  }

  return endDate
    ? targetDate >= startDate && targetDate <= endDate
    : targetDate >= startDate;
};



export const typeOptions = [
  "Call Attempted",
  "Call Completed",
  "Call Left Message",
  "Call Received",
  "Meeting Held",
  "Meeting Not Held",
  "To-do Done",
  "To-do Not Done",
  "Appointment Completed",
  "Appointment Not Completed",
  "Boardroom - Completed",
  "Boardroom - Not Completed",
  "Call Billing - Completed",
  "Initial Consultation - Completed",
  "Initial Consultation - Not Completed",
  "Mail - Completed",
  "Mail - Not Completed",
  "Meeting Billing - Completed",
  "Meeting Billing - Not Completed",
  "Personal Activity - Completed",
  "Personal Activity - Not Completed",
  "Note",
  "Mail Received",
  "Mail Sent",
  "Email Received",
  "Courier Sent",
  "Email Sent",
  "Payment Received",
  "Room 1 - Completed",
  "Room 1 - Not Completed",
  "Room 2 - Completed",
  "Room 2 - Not Completed",
  "Room 3 - Completed",
  "Room 3 - Not Completed",
  "To Do Billing - Completed",
  "To Do Billing - Not Completed",
  "Vacation - Completed",
  "Vacation - Not Completed",
  "Vacation Cancelled",
  "Attachment",
  "E-mail Attachment",
];


export const getResultBasedOnActivityType = (activityType, picklistConfig) => {
  const configuredResults =
    picklistConfig?.results?.[activityType] ||
    picklistConfig?.results?._default;
  if (configuredResults?.length) return configuredResults[0];

  switch (activityType) {
    case "Meeting":
      return "Meeting Held";
    case "To-Do":
      return "To-do Done";
    case "Appointment":
      return "Appointment Completed";
    case "Boardroom":
      return "Boardroom - Completed";
    case "Call Billing":
      return "Call Billing - Completed";
    case "Email Billing":
      return "Email Billing - Completed";
    case "Initial Consultation":
      return "Initial Consultation - Completed";
    case "Call":
      return "Call Attempted";
    case "Mail":
      return "Mail - Completed";
    case "Meeting Billing":
      return "Meeting Billing - Completed";
    case "Personal Activity":
      return "Personal Activity - Completed";
    case "Room 1":
      return "Room 1 - Completed";
    case "Room 2":
      return "Room 2 - Completed";
    case "Room 3":
      return "Room 3 - Completed";
    case "To Do Billing":
      return "To Do Billing - Completed";
    case "Vacation":
      return "Vacation - Completed";
    default:
      return "Note"; // Default result if no specific type is matched
  }
};  

export const activityResultMapping = {
  "Call": ["Call Attempted", "Call Completed", "Call Left Message", "Call Received"],
  "Meeting": ["Meeting Held", "Meeting Not Held"],
  "To-Do": ["To-do Done", "To-do Not Done"],
  "Appointment": ["Appointment Completed", "Appointment Not Completed"],
  "Boardroom": ["Boardroom - Completed", "Boardroom - Not Completed"],
  "Call Billing": ["Call Billing - Completed", "Call Billing - Not Completed"],
  "Email Billing": ["Email Billing - Completed", "Email Billing - Not Completed"],
  "Initial Consultation": ["Initial Consultation - Completed", "Initial Consultation - Not Completed"],
  "Mail": ["Mail - Completed", "Mail - Not Completed"],
  "Meeting Billing": ["Meeting Billing - Completed", "Meeting Billing - Not Completed"],
  "Personal Activity": [
    "Personal Activity - Completed", "Personal Activity - Not Completed",
    "Note", "Mail Received", "Mail Sent", "Email Received", "Courier Sent", "Email Sent", "Payment Received"
  ],
  "Room 1": ["Room 1 - Completed", "Room 1 - Not Completed"],
  "Room 2": ["Room 2 - Completed", "Room 2 - Not Completed"],
  "Room 3": ["Room 3 - Completed", "Room 3 - Not Completed"],
  "To Do Billing": ["To Do Billing - Completed", "To Do Billing - Not Completed"],
  "Vacation": ["Vacation - Completed", "Vacation - Not Completed", "Vacation Cancelled"],
  "Other": ["Attachment", "E-mail Attachment", "E-mail Auto Attached", "E-mail Sent"]
};

export const getResultBasedOnActivityType2 = (activityType, picklistConfig) => {
  const configuredResults =
    picklistConfig?.results?.[activityType] ||
    picklistConfig?.results?._default;
  if (configuredResults?.length) return configuredResults;

  return activityResultMapping[activityType] || ["Note"]; // Default to "Note" if no match
};


export const getRegardingOptions = (type, existingValue, picklistConfig) => {
  const configuredOptions =
    picklistConfig?.regarding?.[type] ||
    picklistConfig?.regarding?._default;

  if (configuredOptions?.length) {
    const options = [...configuredOptions];
    const safeExistingValue =
      typeof existingValue === "string" ? existingValue : "";
    if (
      safeExistingValue.trim() !== "" &&
      !options.includes(safeExistingValue)
    ) {
      options.unshift(safeExistingValue);
    }
    return options;
  }

  const options = {
    Call: [
      "2nd Followup", "3rd Followup", "4th Followup", "5th Followup",
      "Cold call", "Confirm appointment", "Discuss legal points", "Follow up",
      "New Client", "Nomination and Visa Lodgement", "Payment Made?",
      "Returning call", "Schedule a meeting"
    ],
    Meeting: [
      "Hourly Consult $220", "Initial Consultation Fee $165.00",
      "No appointments today (check with Mark)", "No Appointments Tonight",
      "No clients or appointments 4.00-5.00pm"
    ],
    "To-Do": [
      "Assemble catalogs", "DEADLINE REMINDER", "Deadline to lodge app",
      "Deadline to provide additional docu", "Deadline to respond",
      "DEADLINE TODAY - Email received", "Make travel arrangements",
      "Send contract", "Send follow-up letter", "Send literature",
      "Send proposal", "Send quote", "Send SMS reminder"
    ],
    Appointment: [
      "Appointment", "Call", "Dentist Appointment", "Doctor Appointment",
      "Eye Doctor Appointment", "Make Appointment", "Meeting",
      "Parent-Teacher Conference", "Shopping", "Time Off", "Workout"
    ]
  };

  let predefinedOptions = options[type] || ["General"];

  // Only add existingValue if it's not empty and not already in the options
  if (existingValue && existingValue.trim() !== "" && !predefinedOptions.includes(existingValue)) {
    predefinedOptions = [existingValue, ...predefinedOptions];
  }

  return predefinedOptions;
};


export const reminderMapping = {
  "120 minutes before": 120,
  "60 minutes before": 60,
  "30 minutes before": 30,
  "5 minutes before": 5,
  "None": 0,
};
