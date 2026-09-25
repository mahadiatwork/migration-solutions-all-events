import * as React from "react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";

const asArray = (value) => (Array.isArray(value) ? value : []);

const staffName = (contact) =>
  contact.Full_Name ||
  contact.name ||
  `${contact.First_Name || ""} ${contact.Last_Name || ""}`.trim() ||
  String(contact.id);

function EditMultiSelect({ field, label, options, value, onChange, disabled }) {
  const labelId = `saved-filter-edit-${field}-label`;
  const selected = asArray(value);
  const available = new Map(options.map((option) => [option.value, option.label]));

  // A saved value can outlive the current picklist or the loaded staff list.
  selected.forEach((item) => {
    if (!available.has(item)) available.set(item, item);
  });

  return (
    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        multiple
        disabled={disabled}
        value={selected}
        onChange={(event) => {
          const next = event.target.value;
          onChange(typeof next === "string" ? next.split(",") : next);
        }}
        renderValue={(items) => items.map((item) => available.get(item) || item).join(", ")}
        MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
      >
        {[...available].map(([optionValue, optionLabel]) => (
          <MenuItem key={optionValue} value={optionValue}>
            <Checkbox checked={selected.includes(optionValue)} size="small" />
            <ListItemText primary={optionLabel} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export default function SavedFiltersDrawer({
  open,
  onClose,
  savedFilters = [],
  onApply,
  onSave,
  onUpdate,
  onDelete,
  busy = false,
  typeOptions = [],
  priorityOptions = [],
  users = [],
  staffList = [],
}) {
  const [saveName, setSaveName] = React.useState("");
  const [editIndex, setEditIndex] = React.useState(null);
  const [editFilter, setEditFilter] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const disabled = busy || pending;

  const editOptions = {
    filterType: asArray(typeOptions).map((value) => ({ value, label: value })),
    filterPriority: asArray(priorityOptions).map((value) => ({ value, label: value })),
    filterUser: asArray(users)
      .filter((user) => user?.full_name)
      .map((user) => ({ value: user.full_name, label: user.full_name })),
    filterStaff: asArray(staffList)
      .filter((contact) => contact?.id != null)
      .map((contact) => ({ value: String(contact.id), label: staffName(contact) })),
  };

  const openEdit = (event, index) => {
    event.stopPropagation();
    const filter = savedFilters[index];
    if (!filter) return;
    setEditFilter({
      name: filter.name || "",
      filterType: [...asArray(filter.filterType)],
      filterPriority: [...asArray(filter.filterPriority)],
      filterUser: [...asArray(filter.filterUser)],
      filterStaff: asArray(filter.filterStaff).map(String),
    });
    setEditIndex(index);
  };

  const closeEdit = () => {
    if (disabled) return;
    setEditIndex(null);
    setEditFilter(null);
  };

  const saveCurrent = async () => {
    if (!onSave || disabled) return;
    setPending(true);
    try {
      const result = await onSave(saveName.trim() || "Unnamed filter");
      if (result !== false) setSaveName("");
    } catch {
      // The parent owns persistence feedback; retain the name for retry.
    } finally {
      setPending(false);
    }
  };

  const updateFilter = async () => {
    if (editIndex === null || !editFilter || !savedFilters[editIndex] || !onUpdate || disabled) return;
    const updated = {
      ...savedFilters[editIndex],
      name: editFilter.name.trim() || "Unnamed filter",
      filterType: [...editFilter.filterType],
      filterPriority: [...editFilter.filterPriority],
      filterUser: [...editFilter.filterUser],
      filterStaff: [...editFilter.filterStaff],
    };
    setPending(true);
    try {
      const result = await onUpdate(editIndex, updated);
      if (result !== false) {
        await onApply?.(updated);
        setEditIndex(null);
        setEditFilter(null);
      }
    } catch {
      // Keep the edit dialog open so the user can retry.
    } finally {
      setPending(false);
    }
  };

  const deleteFilter = async (event, index) => {
    event.stopPropagation();
    if (!onDelete || disabled) return;
    setPending(true);
    try {
      await onDelete(index);
    } catch {
      // The parent owns persistence feedback.
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Drawer
        variant="persistent"
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ "aria-label": "Saved filters" }}
        sx={{ "& .MuiDrawer-paper": { width: { xs: "100%", sm: 320 }, boxSizing: "border-box" } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1 }}>
          <Typography variant="h6" sx={{ ml: 1 }}>Saved filters</Typography>
          <IconButton onClick={onClose} aria-label="Close saved filters" disabled={disabled}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          {savedFilters.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No saved filters yet.
            </Typography>
          ) : (
            <Box sx={{ mb: 3 }}>
              {savedFilters.map((filter, index) => {
                const name = filter.name || "Unnamed filter";
                return (
                  <Box
                    key={index}
                    sx={{ display: "flex", alignItems: "center", borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <ListItemButton
                      dense
                      disabled={disabled}
                      onClick={() => onApply?.(filter)}
                      aria-label={`Apply filter ${name}`}
                      sx={{ flex: 1, py: 0.5 }}
                    >
                      <ListItemText primary={name} primaryTypographyProps={{ variant: "body2" }} />
                    </ListItemButton>
                    <IconButton
                      size="small"
                      onClick={(event) => openEdit(event, index)}
                      aria-label={`Edit filter ${name}`}
                      disabled={disabled}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(event) => deleteFilter(event, index)}
                      aria-label={`Delete filter ${name}`}
                      disabled={disabled}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          )}

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Save current filter
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Filter name"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            disabled={disabled}
            sx={{ mb: 1 }}
          />
          <Button variant="contained" size="small" fullWidth onClick={saveCurrent} disabled={disabled}>
            {disabled ? <CircularProgress size={18} color="inherit" aria-label="Saving filter" /> : "Save"}
          </Button>
        </Box>
      </Drawer>

      <Dialog open={editIndex !== null} onClose={closeEdit} maxWidth="sm" fullWidth aria-labelledby="saved-filter-edit-title">
        <DialogTitle id="saved-filter-edit-title">Edit filter</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Filter name"
            value={editFilter?.name || ""}
            onChange={(event) => setEditFilter((current) => ({ ...current, name: event.target.value }))}
            disabled={disabled}
            sx={{ mt: 1, mb: 2 }}
          />
          {[
            ["filterType", "Type"],
            ["filterPriority", "Priority"],
            ["filterUser", "User"],
            ["filterStaff", "Staff"],
          ].map(([field, label]) => (
            <EditMultiSelect
              key={field}
              field={field}
              label={label}
              options={editOptions[field]}
              value={editFilter?.[field]}
              onChange={(value) => setEditFilter((current) => ({ ...current, [field]: value }))}
              disabled={disabled}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit} disabled={disabled}>Cancel</Button>
          <Button variant="contained" onClick={updateFilter} disabled={disabled}>
            {disabled ? <CircularProgress size={18} color="inherit" aria-label="Updating filter" /> : "Update"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
