const STORAGE_KEY = "postpilot-india-trackings";
const REFRESH_KEY = "postpilot-india-last-refresh";

const form = document.querySelector("#tracking-form");
const trackingInput = document.querySelector("#tracking-input");
const noteInput = document.querySelector("#note-input");
const table = document.querySelector("#tracking-table");
const tableWrap = document.querySelector("#table-wrap");
const emptyState = document.querySelector("#empty-state");
const journeyBoard = document.querySelector("#journey-board");
const rowTemplate = document.querySelector("#row-template");
const journeyTemplate = document.querySelector("#journey-template");
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
    step: 0,
  },
  {
    key: "transit",
    label: "In transit",
    location: "Sorting hub",
    detail: "Bag dispatched",
    step: 1,
  },
  {
    key: "transit",
    label: "Out for delivery",
    location: "Destination post office",
    detail: "With delivery staff",
    step: 2,
  },
  {
    key: "delivered",
    label: "Delivered",
    location: "Customer address",
    detail: "Delivery confirmed",
    step: 3,
  },
  {
    key: "attention",
    label: "Needs attention",
    location: "Destination post office",
    detail: "No fresh scan",
    step: 2,
  },
];

const routeSteps = ["Booked", "Dispatched", "Hub scan", "Delivered"];

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
        step: 0,
        origin: "Booking office",
        destination: "Customer address",
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
    step: update.step,
    origin: pickOrigin(seed),
    destination: pickDestination(seed),
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

function pickOrigin(seed) {
  const origins = ["Local post office", "Seller pickup", "Booking counter", "Business booking centre"];
  return origins[seed % origins.length];
}

function pickDestination(seed) {
  const destinations = ["Customer address", "Destination city", "Delivery beat", "Final post office"];
  return destinations[(seed >>> 3) % destinations.length];
}

function render() {
  const filteredRecords = records.filter((record) => {
    return activeFilter === "all" || record.statusKey === activeFilter;
  });

  table.innerHTML = "";
  journeyBoard.innerHTML = "";
  filteredRecords.forEach((record) => {
    renderJourneyCard(record);
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

  journeyBoard.hidden = filteredRecords.length === 0;
  tableWrap.hidden = filteredRecords.length === 0;
  emptyState.hidden = records.length > 0;
  document.querySelector("#total-count").textContent = records.length;
  document.querySelector("#delivered-count").textContent = countByStatus("delivered");
  document.querySelector("#transit-count").textContent = countByStatus("transit");
  document.querySelector("#attention-count").textContent = countByStatus("attention");
  document.querySelector("#board-title").textContent =
    activeFilter === "all" ? "Saved consignments" : `${labelFor(activeFilter)} consignments`;
  document.querySelector("#last-refresh").textContent = lastRefreshLabel();
}

function renderJourneyCard(record) {
  const card = journeyTemplate.content.cloneNode(true);
  const stage = Math.max(0, Math.min(record.step ?? 0, routeSteps.length - 1));
  const progress = `${(stage / (routeSteps.length - 1)) * 100}%`;

  card.querySelector(".tracking-code").textContent = record.id;
  card.querySelector("h4").textContent = record.note || "Parcel journey";
  card.querySelector(".origin").textContent = record.origin || "Booking office";
  card.querySelector(".current").textContent = record.location;
  card.querySelector(".destination").textContent = record.destination || "Customer address";
  card.querySelector(".scan-line").textContent = `${record.detail} • ${formatDate(record.updatedAt)}`;

  const pill = card.querySelector(".status-pill");
  pill.textContent = record.statusLabel;
  pill.classList.add(`status-${record.statusKey}`);

  const progressBar = card.querySelector(".route-progress");
  progressBar.style.width = progress;

  const stops = card.querySelector(".route-stops");
  routeSteps.forEach((label, index) => {
    const stop = document.createElement("div");
    stop.className = "route-stop";
    if (index < stage) stop.classList.add("complete");
    if (index === stage) stop.classList.add("current");
    stop.style.left = `${(index / (routeSteps.length - 1)) * 100}%`;
    stop.innerHTML = `<span>${index + 1}</span><strong>${label}</strong>`;
    stops.appendChild(stop);
  });

  journeyBoard.appendChild(card);
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
          step: 0,
          origin: "Booking office",
          destination: "Customer address",
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
