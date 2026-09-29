export const getCreateActivityDefaults = () => ({
  Type_of_Activity: "",
  Event_Title: "New Activity",
  Regarding: "",
});

export const getActivityTypeSelection = (selectedType, resource) => ({
  Type_of_Activity: selectedType,
  resource,
  Regarding: "",
});
