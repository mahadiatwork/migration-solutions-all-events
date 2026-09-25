import React, { useEffect, useState, createContext } from "react";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import "./App.css";
import ActivityTable from "./components/ActivityTable";
import { CircularProgress, Box } from "@mui/material";
import DateRangeModal from "./components/atom/DateRangeModal";
import { ACTIVITY_TIMEZONE } from "./components/helperFunc";
import useEventsStore from "./store/eventsStore";
import { fetchPicklistConfig } from "./services/picklistConfigService";

dayjs.extend(timezone);

const ZOHO = window.ZOHO;

export const ZohoContext = createContext();

function App() {
  // --- Global State Management (Zustand) ---
  const { 
    events, 
    setEvents, 
    addEvents,
    loading, 
    setLoading,
    cache,
    setCache,
    getCache,
    updateCacheEntry
  } = useEventsStore();
  
  // --- Local State Management ---
  const [zohoLoaded, setZohoLoaded] = useState(false);
  const [users, setUsers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [recentColors, setRecentColor] = useState("");
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [picklistConfig, setPicklistConfig] = useState(null);
  
  // Filter States
  const [filterDate, setFilterDate] = useState("Default");
  const [customDateRange, setCustomDateRange] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- 1. Initialization ---
  useEffect(() => {
    ZOHO.embeddedApp.init().then(() => {
      setZohoLoaded(true);
      ZOHO.CRM.CONFIG.getCurrentUser().then((data) => {
        const currentUser = data?.users?.[0];
        if (currentUser?.id) {
          // Enrich with full user record so User_Type (Admin / Super Admin / Generic) is available
          ZOHO.CRM.API.getRecord({
            Entity: "users",
            approved: "both",
            RecordID: currentUser.id,
          }).then((record) => {
            setLoggedInUser(record?.users?.[0] || currentUser);
          });
        } else if (currentUser) {
          setLoggedInUser(currentUser);
        }
      });
    });
  }, []);

  // --- 2. Initial Metadata Fetch (Users, Staff & Colors) ---
  useEffect(() => {
    if (zohoLoaded) {
      fetchInitialMetadata();
    }
  }, [zohoLoaded]);

  useEffect(() => {
    if (!zohoLoaded) return undefined;

    let cancelled = false;
    fetchPicklistConfig(ZOHO).then((config) => {
      if (!cancelled) setPicklistConfig(config);
    });

    return () => {
      cancelled = true;
    };
  }, [zohoLoaded]);

  const fetchInitialMetadata = async () => {
    try {
      const orgVar = await ZOHO.CRM.API.getOrgVariable("recent_colors");
      const colorsArray = JSON.parse(orgVar?.Success?.Content || "[]");
      setRecentColor(colorsArray);

      const usersResponse = await ZOHO.CRM.API.getAllRecords({
        Entity: "users",
        sort_order: "asc",
        per_page: 100,
        page: 1,
      });
      setUsers(usersResponse.users || []);

      // Fetch Staff Contacts (Staff_Type: equals Active)
      if (ZOHO?.CRM?.API?.searchRecord) {
        try {
          const staffContacts = [];
          let page = 1;
          let response;
          do {
            response = await ZOHO.CRM.API.searchRecord({
              Entity: "Contacts",
              Type: "criteria",
              Query: "(Staff_Type:equals:Active)",
              page,
              per_page: 200,
            });
            staffContacts.push(
              ...(response?.data || []).filter(
                (contact) =>
                  contact.Staff_Type === "Active" || contact.Staff_Type === "Staff"
              )
            );
            page += 1;
          } while (response?.info?.more_records && page <= 10);
          setStaff(staffContacts);
        } catch (staffErr) {
          console.error("Error fetching staff metadata:", staffErr);
        }
      }
    } catch (error) {
      console.error("Error fetching metadata:", error);
    }
  };

  // --- 3. Date Utility Helper ---
  // Returns standard JS Date objects whose day boundaries are in the user's local time.
  const calculateDateRange = (filterType, customRange) => {
    const currentDate = dayjs().tz(ACTIVITY_TIMEZONE);

    let beginDate, closeDate;

    switch (filterType) {
      case "Default":
        // Last month start to 1 year future
        beginDate = currentDate.subtract(1, "month").startOf("month");
        closeDate = currentDate.add(1, "year").endOf("day");
        break;
      case "All":
        beginDate = dayjs.tz("2023-01-01T00:00:00", ACTIVITY_TIMEZONE);
        closeDate = currentDate;
        break;
      case "Today":
        beginDate = currentDate.startOf("day");
        closeDate = currentDate.endOf("day");
        break;
      case "Current Week":
        beginDate = currentDate.startOf("week");
        closeDate = beginDate.add(6, "day").endOf("day");
        break;
      case "Last 7 Days":
        beginDate = currentDate.subtract(6, "day").startOf("day");
        closeDate = currentDate.endOf("day");
        break;
      case "Last 30 Days":
        beginDate = currentDate.subtract(29, "day").startOf("day");
        closeDate = currentDate.endOf("day");
        break;
      case "Last 90 Days":
        beginDate = currentDate.subtract(89, "day").startOf("day");
        closeDate = currentDate.endOf("day");
        break;
      case "Last Month":
        beginDate = currentDate.subtract(1, "month").startOf("month");
        closeDate = currentDate.subtract(1, "month").endOf("month");
        break;
      case "Current Month":
        beginDate = currentDate.startOf("month");
        closeDate = currentDate.endOf("month");
        break;
      case "Next Week":
        beginDate = currentDate.startOf("week").add(7, "day");
        closeDate = beginDate.add(6, "day").endOf("day");
        break;
      case "Custom Range":
        if (customRange) {
          beginDate = dayjs.tz(
            `${customRange.startDate}T00:00:00`,
            ACTIVITY_TIMEZONE
          );
          closeDate = dayjs.tz(
            `${customRange.endDate}T23:59:59`,
            ACTIVITY_TIMEZONE
          );
        }
        break;
      default:
        return null;
    }
    return {
      beginDate: beginDate?.toDate(),
      closeDate: closeDate?.toDate(),
    };
  };

  const formatDateForZoho = (date, hours = 0, minutes = 0, seconds = 0) => {
    if (!date || isNaN(date.getTime())) return null;
    const pad = (num) => String(num).padStart(2, "0");

    const zonedDate = dayjs(date).tz(ACTIVITY_TIMEZONE);
    const datePart = zonedDate.format("YYYY-MM-DD");
    const formattedTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return `${datePart}T${formattedTime}${zonedDate.format("Z")}`;
  };

  // --- 4. Robust Event Update Logic with Re-Validation ---
  /**
   * Handles event updates with smart caching and filter re-validation
   * 
   * Workflow:
   * 1. Updates global store (events master list) - ALWAYS
   * 2. Updates all cache entries - ALWAYS
   * 3. Re-validates if event still matches current filter's date range
   * 4. If matches: keeps in current view (already in store, reactive filtering will show it)
   * 5. If doesn't match: removes from current view but keeps updated in cache
   * 
   * @param {Object} updatedEvent - The updated event object with all fields
   */
  const updateEventState = (updatedEvent) => {
    const store = useEventsStore.getState();
    
    // Step 1: Update global store master list (ALWAYS - this is the source of truth)
    store.updateEvent(updatedEvent);
    
    // Step 2: Update all cache entries (ALWAYS - ensures cache stays fresh)
    store.updateCacheEntry(updatedEvent);
    
    // Step 3: Re-validate if the event still matches the current filter's date range
    const eventDate = new Date(updatedEvent.Start_DateTime);
    if (isNaN(eventDate.getTime())) {
      console.warn('⚠️ Invalid event date, cannot re-validate filter match:', updatedEvent.Start_DateTime);
      // Still update the store and cache, just skip re-validation
      return;
    }
    
    // Calculate the current filter's date range
    let currentRange = null;
    if (filterDate === "Custom Range" && customDateRange) {
      currentRange = calculateDateRange("Custom Range", customDateRange);
    } else if (filterDate && filterDate !== "Default") {
      currentRange = calculateDateRange(filterDate);
    } else {
      // Default filter - check against its range (last month to 1 year future)
      currentRange = calculateDateRange("Default");
    }
    
    if (!currentRange || !currentRange.beginDate || !currentRange.closeDate) {
      console.warn('⚠️ Could not calculate current filter range, keeping event in view');
      // If we can't determine the range, keep the event visible
      return;
    }
    
    // Step 4: Check if event's date falls within current filter range
    const eventFitsInRange = 
      eventDate >= currentRange.beginDate && 
      eventDate <= currentRange.closeDate;
    
    // Step 5: Handle visibility based on filter match
    const currentEvents = store.events;
    const eventExists = currentEvents.some(e => e.id === updatedEvent.id);
    
    if (eventFitsInRange) {
      // Event still matches filter - ensure it's in the master list
      // (It's already updated via updateEvent, but we ensure it exists)
      if (!eventExists) {
        // Event was somehow removed but should be visible - add it back
        store.addEvent(updatedEvent);
        console.log('✅ Event updated and still matches filter - kept in view');
      } else {
        console.log('✅ Event updated and still matches filter - visible with new data');
      }
    } else {
      // Event no longer matches current filter - remove from current view
      // But it's already updated in cache, so switching filters will show the updated data
      if (eventExists) {
        const filteredEvents = currentEvents.filter(e => e.id !== updatedEvent.id);
        store.setEvents(filteredEvents);
        console.log('⚠️ Event updated but no longer matches current filter - removed from view (still in cache)');
      }
    }
  };

  // --- 5. Core API Fetch Logic ---
  const fetchEventsFromZoho = async (beginDate, closeDate) => {
    const formattedBegin = formatDateForZoho(beginDate, 0, 0, 0);
    const formattedClose = formatDateForZoho(closeDate, 23, 59, 59);

    let allEventsData = [];
    let currentPage = 1;
    let hasMoreRecords = true;
    const recordsPerPage = 100;

    while (hasMoreRecords && currentPage < 11) {
      const searchUrl = `((Start_DateTime:greater_equal:${encodeURIComponent(formattedBegin)})and(End_DateTime:less_equal:${encodeURIComponent(formattedClose)}))`;
      
      const req_data = {
        url: `https://www.zohoapis.com.au/crm/v3/Events/search?criteria=${searchUrl}&per_page=${recordsPerPage}&page=${currentPage}`,
        method: "GET",
        param_type: 1,
      };

      try {
        const data = await ZOHO.CRM.CONNECTION.invoke("zoho_crm_conn", req_data);
        const pageEvents = data?.details?.statusMessage?.data || [];
        const moreRecords = data?.details?.statusMessage?.info?.more_records || false;

        allEventsData = [...allEventsData, ...pageEvents];
        hasMoreRecords = moreRecords;
        currentPage++;
      } catch (error) {
        console.error("Pagination error:", error);
        hasMoreRecords = false;
      }
    }
    return allEventsData;
  };

  const processEvents = (rawEvents) => {
    const uniqueEventsMap = new Map();
    rawEvents.forEach((event) => {
      if (!uniqueEventsMap.has(event.id)) {
        uniqueEventsMap.set(event.id, event);
      }
    });
    return Array.from(uniqueEventsMap.values()).sort((a, b) => {
      return new Date(a.Start_DateTime) - new Date(b.Start_DateTime);
    });
  };

  // --- 6. Intelligent Caching Logic ---
  
  // This checks if we already have a "superset" of data that covers the needed range
  const findCachedSubset = (neededStart, neededEnd) => {
    // Get current cache from store
    const currentCache = useEventsStore.getState().cache;
    const cacheKeys = Object.keys(currentCache);
    
    for (const key of cacheKeys) {
      const cachedItem = currentCache[key];
      if (!cachedItem || !cachedItem.range) continue;
      
      const cachedStart = cachedItem.range.start;
      const cachedEnd = cachedItem.range.end;

      // Check if the needed range is INSIDE the cached range
      // We use a small buffer (1000ms) to handle slight time diffs
      if (cachedStart <= neededStart && cachedEnd >= neededEnd) {
        console.log(`Optimization: Found data in cache [${key}] for requested range.`);
        
        // Filter the cached data to return ONLY what fits the needed range
        return cachedItem.data.filter(event => {
          const eDate = new Date(event.Start_DateTime);
          return eDate >= neededStart && eDate <= neededEnd;
        });
      }
    }
    return null; // No suitable cache found
  };

  const handleStandardFilter = async (filterType) => {
    // 1. Calculate needed dates
    const dates = calculateDateRange(filterType);
    if (!dates) return;

    // 2. Check Cache (Exact Match)
    const cachedData = getCache(filterType);
    if (cachedData) {
      // Add cached events to global store (they may already be there, but this ensures they are)
      addEvents(cachedData.data);
      setLoading(false);
      return;
    }

    // 3. Check Cache (Superset Match - The Optimization)
    // "If I have Last 30 Days, Last 7 Days shouldn't fetch."
    const subsetData = findCachedSubset(dates.beginDate, dates.closeDate);
    if (subsetData) {
      // Add subset to global store
      addEvents(subsetData);
      setLoading(false);
      return;
    }

    // 4. Fetch from API (If we really need it)
    setLoading(true);
    try {
      const rawData = await fetchEventsFromZoho(dates.beginDate, dates.closeDate);
      const processedData = processEvents(rawData);

      // Add to global store (merges with existing, deduplicates)
      addEvents(processedData);
      
      // Save to cache with metadata about the Date Range
      setCache(filterType, processedData, { start: dates.beginDate, end: dates.closeDate });
    } catch (error) {
      console.error(`Error loading ${filterType}:`, error);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomRange = async (range) => {
    if (!range) return;
    setLoading(true);
    try {
      const dates = calculateDateRange("Custom Range", range);
      const rawData = await fetchEventsFromZoho(dates.beginDate, dates.closeDate);
      const processedData = processEvents(rawData);
      // Add to global store (merges with existing events)
      addEvents(processedData);
      // We do NOT cache custom ranges as they are too specific
    } catch (error) {
      console.error("Error loading custom range:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- 7. Main Effect ---
  useEffect(() => {
    if (!zohoLoaded) return;

    if (filterDate === "Custom Range") {
      if (customDateRange) handleCustomRange(customDateRange);
    } else {
      handleStandardFilter(filterDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zohoLoaded, filterDate, customDateRange]);

  const handleCustomRangeSave = (range) => {
    setCustomDateRange(range);
    setFilterDate("Custom Range");
  };

  return (
    <ZohoContext.Provider
      value={{
        users,
        staff,
        events,
        ZOHO,
        filterDate,
        setFilterDate,
        customDateRange,
        setCustomDateRange,
        recentColors,
        setRecentColor,
        picklistConfig,
        // Expose the updater so child components can fix state without refetching
        updateEventState, 
      }}
    >
      {loading || !picklistConfig ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          <CircularProgress />
        </Box>
      ) : (
        <ActivityTable
          events={events}
          ZOHO={ZOHO}
          users={users}
          staff={staff}
          filterDate={filterDate}
          setFilterDate={setFilterDate}
          recentColors={recentColors}
          setRecentColor={setRecentColor}
          loggedInUser={loggedInUser}
          setEvents={setEvents}
          customDateRange={customDateRange}
          setCustomDateRange={setCustomDateRange}
          updateEventState={updateEventState} // Pass this down
          picklistConfig={picklistConfig}
        />
      )}
      <DateRangeModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCustomRangeSave}
      />
    </ZohoContext.Provider>
  );
}

export default App;
