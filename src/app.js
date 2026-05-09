const STORAGE_KEY = "postpilot-india-trackings";
const REFRESH_KEY = "postpilot-india-last-refresh";

const form = document.querySelector("#tracking-form");
const trackingInput = document.querySelector("#tracking-input");
const noteInput = document.querySelector("#note-input");
const table = document.querySelector("#tracking-table");
const tableWrap = document.querySelector("#table-wrap");
const emptyState = document.querySelector("#empty-state");
const rowTemplate = document.querySelector("#row-template");
const refreshButton = document.querySelector("#refresh-btn");
const exportButton = document.querySelector("#export-btn");
const importButton = document.querySelector("#import-btn");
const csvInput = document.querySelector("#csv-input");
const filterButtons = document.querySelectorAll("[data-filter]");

let activeFilter = "all";
let records = loadRecords();

const statusFlow = [
  {
    key: "transit",
    label: "Booked",
    location: "Booking office",
    detail: "Shipment created",
  },
  {
    key: "transit",
    label: "In transit",
    location: "Sorting hub",
    detail: "Bag dispatched",
  },
  {
    key: "transit",
    label: "Out for delivery",
    location: "Destination post office",
    detail: "With delivery staff",
  },
  {
    key: "delivered",
    label: "Delivered",
    location: "Customer address",
    detail: "Delivery confirmed",
  },
  {
    key: "attention",
    label: "Needs attention",
    location: "Destination post office",
    detail: "No fresh scan",
  },
];

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const ids = trackingInput.value
    .split(/[\n, ]+/)
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);

  const existingIds = new Set(records.map((record) => record.id));
  const createdAt = new Date().toISOString();
  const note = noteInput.value.trim();

  ids.forEach((id) => {
    if (!existingIds.has(id)) {
      records.push({
        id,
        note,
        createdAt,
        statusKey: "transit",
        statusLabel: "Queued",
        location: "Waiting for first refresh",
        detail: "Saved locally",
        updatedAt: null,
      });
    }
  });

  trackingInput.value = "";
  noteInput.value = "";
  saveRecords();
  refreshAll();
});

refreshButton.addEventListener("click", refreshAll);
exportButton.addEventListener("click", exportCsv);
importButton.addEventListener("click", () => csvInput.click());
csvInput.addEventListener("change", importCsv);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    render();
  });
});

table.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".icon-btn");
  if (!removeButton) return;
  const id = removeButton.dataset.id;
  records = records.filter((record) => record.id !== id);
  saveRecords();
  render();
});

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function refreshAll() {
  const refreshedAt = new Date().toISOString();
  records = records.map((record) => ({
    ...record,
    ...getTrackingUpdate(record, refreshedAt),
  }));

  localStorage.setItem(REFRESH_KEY, refreshedAt);
  saveRecords();
  render();
}

function getTrackingUpdate(record, refreshedAt) {
  const ageDays = Math.max(0, daysBetween(record.createdAt, refreshedAt));
  const seed = hash(record.id);
  const hasDelay = seed % 11 === 0 && ageDays >= 4;
  const stage = hasDelay ? 4 : Math.min(3, Math.floor(ageDays / 2) + (seed % 2));
  const update = statusFlow[stage];

  return {
    statusKey: update.key,
    statusLabel: update.label,
    location: pickLocation(seed, update.location),
    detail: update.detail,
    updatedAt: refreshedAt,
  };
}

function pickLocation(seed, fallback) {
  const locations = [
    "Delhi RMS",
    "Mumbai NSH",
    "Kolkata RMS",
    "Bengaluru NSH",
    "Lucknow RMS",
    "Patna RMS",
    "Jaipur Hub",
    "Destination post office",
  ];

  return fallback === "Customer address" || fallback === "Booking office"
    ? fallback
    : locations[seed % locations.length];
}

function render() {
  const filteredRecords = records.filter((record) => {
    return activeFilter === "all" || record.statusKey === activeFilter;
  });

  table.innerHTML = "";
  filteredRecords.forEach((record) => {
    const row = rowTemplate.content.cloneNode(true);
    row.querySelector(".tracking-code").textContent = record.id;
    row.querySelector(".location").textContent = record.location;
    row.querySelector(".updated").textContent = formatDate(record.updatedAt);
    row.querySelector(".age").textContent = `${daysBetween(record.createdAt, new Date().toISOString())}d`;
    row.querySelector(".note").textContent = record.note || "-";

    const pill = row.querySelector(".status-pill");
    pill.textContent = record.statusLabel;
    pill.title = record.detail;
    pill.classList.add(`status-${record.statusKey}`);

    row.querySelector(".icon-btn").dataset.id = record.id;
    table.appendChild(row);
  });

  tableWrap.hidden = records.length === 0;
  emptyState.hidden = records.length > 0;
  document.querySelector("#total-count").textContent = records.length;
  document.querySelector("#delivered-count").textContent = countByStatus("delivered");
  document.querySelector("#transit-count").textContent = countByStatus("transit");
  document.querySelector("#attention-count").textContent = countByStatus("attention");
  document.querySelector("#board-title").textContent =
    activeFilter === "all" ? "Saved consignments" : `${labelFor(activeFilter)} consignments`;
  document.querySelector("#last-refresh").textContent = lastRefreshLabel();
}

function countByStatus(status) {
  return records.filter((record) => record.statusKey === status).length;
}

function labelFor(status) {
  return {
    delivered: "Delivered",
    transit: "In transit",
    attention: "Attention",
  }[status];
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function lastRefreshLabel() {
  const value = localStorage.getItem(REFRESH_KEY);
  return value ? `Last refreshed ${formatDate(value)}` : "Not refreshed yet";
}

function daysBetween(start, end) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(diff / 86_400_000);
}

function hash(value) {
  return value.split("").reduce((total, char) => {
    return (total * 31 + char.charCodeAt(0)) >>> 0;
  }, 7);
}

function exportCsv() {
  const header = ["tracking_id", "status", "location", "last_update", "note"];
  const rows = records.map((record) => [
    record.id,
    record.statusLabel,
    record.location,
    record.updatedAt || "",
    record.note || "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "postpilot-trackings.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const ids = lines
      .flatMap((line) => line.split(","))
      .map((item) => item.replaceAll('"', "").trim().toUpperCase())
      .filter((item) => item && !item.includes("TRACKING"));

    const existingIds = new Set(records.map((record) => record.id));
    const createdAt = new Date().toISOString();
    ids.forEach((id) => {
      if (!existingIds.has(id)) {
        records.push({
          id,
          note: "CSV import",
          createdAt,
          statusKey: "transit",
          statusLabel: "Queued",
          location: "Waiting for first refresh",
          detail: "Saved locally",
          updatedAt: null,
        });
      }
    });
    saveRecords();
    refreshAll();
  };
  reader.readAsText(file);
  event.target.value = "";
}

refreshAll();
