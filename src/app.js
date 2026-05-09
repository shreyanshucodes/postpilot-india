const STORAGE_KEY = "postpilot-india-batches";
const LEGACY_KEY = "postpilot-india-trackings";
const REFRESH_KEY = "postpilot-india-last-refresh";

const form = document.querySelector("#tracking-form");
const trackingInput = document.querySelector("#tracking-input");
const formHint = document.querySelector("#form-hint");
const batchBoard = document.querySelector("#batch-board");
const consignmentBoard = document.querySelector("#consignment-board");
const emptyState = document.querySelector("#empty-state");
const batchTemplate = document.querySelector("#batch-template");
const consignmentTemplate = document.querySelector("#consignment-template");
const refreshButton = document.querySelector("#refresh-btn");
const exportButton = document.querySelector("#export-btn");
const importButton = document.querySelector("#import-btn");
const csvInput = document.querySelector("#csv-input");
const backButton = document.querySelector("#back-btn");
const apiStatus = document.querySelector("#api-status");

let batches = loadBatches();
let activeBatchId = null;

const routeSteps = ["Booked", "Dispatched", "In Transit", "Out for Delivery", "Delivered"];

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const ids = parseTrackingIds(trackingInput.value);
  const rejectedCount = trackingInput.value.split(/[\n, ]+/).filter(Boolean).length - ids.length;

  if (!ids.length) {
    formHint.textContent = "Paste valid India Post tracking IDs, one per line.";
    formHint.classList.add("is-error");
    return;
  }

  const batch = createBatch(ids);
  batches.unshift(batch);
  activeBatchId = batch.id;
  trackingInput.value = "";
  formHint.textContent = rejectedCount
    ? `Created batch with ${ids.length} ID(s). Ignored ${rejectedCount} invalid entry.`
    : `Created batch with ${ids.length} ID(s).`;
  formHint.classList.remove("is-error");
  saveBatches();
  render();
  refreshBatch(batch.id);
});

refreshButton.addEventListener("click", () => {
  if (activeBatchId) {
    refreshBatch(activeBatchId);
  } else {
    refreshAll();
  }
});

backButton.addEventListener("click", () => {
  activeBatchId = null;
  render();
});

importButton.addEventListener("click", () => csvInput.click());
csvInput.addEventListener("change", importCsv);
exportButton.addEventListener("click", exportCsv);

batchBoard.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".batch-remove");
  if (removeButton) {
    const batchId = removeButton.dataset.batchId;
    batches = batches.filter((batch) => batch.id !== batchId);
    if (activeBatchId === batchId) activeBatchId = null;
    saveBatches();
    render();
    return;
  }

  const button = event.target.closest(".batch-open");
  if (!button) return;
  activeBatchId = button.dataset.batchId;
  render();
  refreshBatch(activeBatchId);
});

consignmentBoard.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".parcel-remove");
  if (removeButton) {
    const batch = batches.find((item) => item.id === activeBatchId);
    if (!batch) return;
    batch.records = batch.records.filter((record) => record.id !== removeButton.dataset.id);
    if (!batch.records.length) {
      batches = batches.filter((item) => item.id !== batch.id);
      activeBatchId = null;
    }
    saveBatches();
    render();
    return;
  }

  const button = event.target.closest(".parcel-main");
  if (!button) return;
  const card = button.closest(".parcel-card");
  const details = card.querySelector(".parcel-details");
  details.hidden = !details.hidden;
  card.classList.toggle("is-open", !details.hidden);
});

function parseTrackingIds(value) {
  return [...new Set(
    value
      .split(/[\n, ]+/)
      .map((id) => id.trim().toUpperCase())
      .filter(isValidConsignmentId),
  )];
}

function createBatch(ids) {
  const createdAt = new Date().toISOString();
  return {
    id: `batch-${Date.now()}`,
    createdAt,
    records: ids.map((id) => createRecord(id, createdAt)),
  };
}

function createRecord(id, createdAt) {
  return {
    id,
    createdAt,
    statusKey: "transit",
    statusLabel: "Queued",
    location: "Awaiting live scan",
    detail: "Saved locally. Live carrier data has not arrived yet.",
    step: 0,
    articleType: "Not provided",
    expectedDeliveryDate: null,
    routingSteps: [],
    updatedAt: null,
    source: "Local",
  };
}

function loadBatches() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      return saved.map(normalizeBatch).filter((batch) => batch.records.length);
    }
  } catch {
    // Fall through to legacy migration.
  }

  return migrateLegacyRecords();
}

function migrateLegacyRecords() {
  try {
    const legacy = (JSON.parse(localStorage.getItem(LEGACY_KEY)) || []).filter((record) =>
      isValidConsignmentId(record.id),
    );
    if (!legacy.length) return [];

    const batch = {
      id: `batch-${Date.now()}`,
      createdAt: legacy[0].createdAt || new Date().toISOString(),
      records: legacy.map((record) => ({
        ...createRecord(record.id, record.createdAt || new Date().toISOString()),
        statusKey: record.statusKey || "transit",
        statusLabel: record.statusLabel || "Queued",
        updatedAt: record.updatedAt || null,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([batch]));
    return [batch];
  } catch {
    return [];
  }
}

function normalizeBatch(batch) {
  return {
    id: batch.id || `batch-${Date.now()}`,
    createdAt: batch.createdAt || new Date().toISOString(),
    records: Array.isArray(batch.records)
      ? batch.records.filter((record) => isValidConsignmentId(record.id)).map(normalizeRecord)
      : [],
  };
}

function normalizeRecord(record) {
  return {
    ...createRecord(record.id, record.createdAt || new Date().toISOString()),
    ...record,
    location: record.location || "Awaiting live scan",
    detail: record.detail || "No carrier detail available yet.",
    articleType: record.articleType || "Not provided",
    source: record.source || "Local",
    routingSteps: Array.isArray(record.routingSteps) ? record.routingSteps : [],
  };
}

function saveBatches() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
}

function isValidConsignmentId(value) {
  return /^[A-Z]{2}\d{9}IN$/.test(String(value || "").toUpperCase());
}

async function refreshAll() {
  for (const batch of batches) {
    await refreshBatch(batch.id, { silent: true });
  }
  render();
}

async function refreshBatch(batchId, options = {}) {
  const batch = batches.find((item) => item.id === batchId);
  if (!batch) return;

  const refreshedAt = new Date().toISOString();
  batch.records = batch.records.map((record) => ({
    ...record,
    updatedAt: refreshedAt,
  }));
  localStorage.setItem(REFRESH_KEY, refreshedAt);
  saveBatches();
  if (!options.silent) render();

  if (location.protocol === "file:") {
    setApiStatus("Open via 127.0.0.1 for live API", "offline");
    return;
  }

  try {
    setApiStatus("Syncing live", "syncing");
    const response = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courier: "speedpost",
        trackingNumbers: batch.records.map((record) => record.id),
      }),
    });

    if (!response.ok) {
      setApiStatus("API server error", "offline");
      return;
    }
    const payload = await response.json();
    if (!payload.success || !Array.isArray(payload.data)) {
      setApiStatus("API returned no data", "offline");
      return;
    }

    const updates = new Map(
      payload.data
        .filter((item) => item.success)
        .map((item) => [item.trackingNumber, mapLiveTracking(item, refreshedAt)]),
    );

    batch.records = batch.records.map((record) => ({
      ...record,
      ...(updates.get(record.id) || {}),
    }));
    saveBatches();
    setApiStatus(updates.size ? "Live API connected" : "No carrier scans yet", updates.size ? "online" : "waiting");
    if (!options.silent) render();
  } catch {
    setApiStatus("API not reachable", "offline");
  }
}

function setApiStatus(message, state) {
  apiStatus.textContent = message;
  apiStatus.dataset.state = state;
}

function mapLiveTracking(item, refreshedAt) {
  const checkpoints = Array.isArray(item.checkpoints) ? item.checkpoints.filter(Boolean) : [];
  const latest = checkpoints[checkpoints.length - 1];
  const statusKey = mapProviderStatus(item.status);
  const statusLabel = labelFromProviderStatus(item.status, item.mostRecentStatus);
  const step = stepFromStatus(statusKey, item.status, statusLabel);

  return {
    statusKey,
    statusLabel,
    location: latest?.location || item.destinationCity || item.originCity || "Not provided by carrier",
    detail: latest?.status || item.mostRecentStatus || "No scan detail provided by carrier",
    step,
    articleType: item.courier === "speedpost" ? "Speed Post" : "Not provided",
    expectedDeliveryDate: item.expectedDeliveryDate || null,
    routingSteps: checkpoints.map((checkpoint) => ({
      event: checkpoint.status || "Tracking update",
      office: checkpoint.location || "Not provided by carrier",
      at: checkpoint.timestamp || refreshedAt,
    })),
    updatedAt: refreshedAt,
    source: "TrackCourier",
  };
}

function mapProviderStatus(status) {
  return {
    pending: "transit",
    in_transit: "transit",
    out_for_delivery: "transit",
    delivered: "delivered",
    exception: "attention",
  }[status] || "transit";
}

function labelFromProviderStatus(status, fallback) {
  return (
    {
      pending: "Booked",
      in_transit: "In Transit",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      exception: "Needs attention",
    }[status] ||
    fallback ||
    "In Transit"
  );
}

function stepFromStatus(statusKey, providerStatus, label) {
  if (statusKey === "delivered") return 4;
  if (statusKey === "attention") return 3;
  if (providerStatus === "out_for_delivery") return 3;
  if (providerStatus === "in_transit") return 2;
  if (/dispatch/i.test(label)) return 1;
  return 0;
}

function render() {
  const activeBatch = batches.find((batch) => batch.id === activeBatchId);
  const records = batches.flatMap((batch) => batch.records);

  document.querySelector("#total-count").textContent = records.length;
  document.querySelector("#delivered-count").textContent = countByStatus(records, "delivered");
  document.querySelector("#transit-count").textContent = countByStatus(records, "transit");
  document.querySelector("#attention-count").textContent = countByStatus(records, "attention");
  document.querySelector("#last-refresh").textContent = lastRefreshLabel();

  emptyState.hidden = batches.length > 0;
  batchBoard.hidden = batches.length === 0 || Boolean(activeBatch);
  consignmentBoard.hidden = !activeBatch;
  backButton.hidden = !activeBatch;
  document.querySelector("#board-eyebrow").textContent = activeBatch ? "Batch View" : "Live Board";
  document.querySelector("#board-title").textContent = activeBatch
    ? batchTitle(activeBatch)
    : "Saved batches";

  renderBatches();
  renderConsignments(activeBatch);
}

function renderBatches() {
  batchBoard.innerHTML = "";
  batches.forEach((batch, index) => {
    const card = batchTemplate.content.cloneNode(true);
    const records = batch.records;
    const button = card.querySelector(".batch-open");
    button.dataset.batchId = batch.id;
    card.querySelector(".batch-remove").dataset.batchId = batch.id;
    card.querySelector(".batch-kicker").textContent = `Batch ${batches.length - index}`;
    card.querySelector(".batch-title").textContent = `${records.length} consignments`;
    card.querySelector(".batch-meta").textContent = formatDate(batch.createdAt);
    card.querySelector(".batch-delivered").textContent = countByStatus(records, "delivered");
    card.querySelector(".batch-transit").textContent = countByStatus(records, "transit");
    card.querySelector(".batch-attention").textContent = countByStatus(records, "attention");
    batchBoard.appendChild(card);
  });
}

function renderConsignments(batch) {
  consignmentBoard.innerHTML = "";
  if (!batch) return;

  batch.records.forEach((record) => {
    const card = consignmentTemplate.content.cloneNode(true);
    const stage = Math.max(0, Math.min(record.step || 0, routeSteps.length - 1));
    const progress = stage / (routeSteps.length - 1);

    card.querySelector(".parcel-id").textContent = record.id;
    card.querySelector(".parcel-remove").dataset.id = record.id;
    card.querySelector(".parcel-status").textContent = record.statusLabel;
    card.querySelector(".parcel-location").textContent = record.location;
    card.querySelector(".parcel-updated").textContent = formatDate(record.updatedAt);
    card.querySelector(".article-type").textContent = record.articleType;
    card.querySelector(".expected-date").textContent = formatDate(record.expectedDeliveryDate);
    card.querySelector(".data-source").textContent = record.source;

    const pill = card.querySelector(".status-pill");
    pill.textContent = record.statusLabel;
    pill.classList.add(`status-${record.statusKey}`);

    const rail = card.querySelector(".route-rail");
    rail.style.setProperty("--progress", progress);
    routeSteps.forEach((label, index) => {
      const step = document.createElement("span");
      step.className = "route-dot";
      if (index < stage) step.classList.add("complete");
      if (index === stage) step.classList.add("current");
      step.innerHTML = `<i>${index + 1}</i><b>${label}</b>`;
      rail.appendChild(step);
    });

    const routingList = card.querySelector(".routing-list");
    if (record.routingSteps.length) {
      record.routingSteps.forEach((step) => {
        const item = document.createElement("div");
        item.className = "routing-item";
        item.innerHTML = `
          <time>
            <strong>${formatRouteDate(step.at)}</strong>
            <span>${formatRouteTime(step.at)}</span>
          </time>
          <span class="routing-check">✓</span>
          <div>
            <strong>${step.event}</strong>
            <span>${step.office}</span>
          </div>
        `;
        routingList.appendChild(item);
      });
    } else {
      const item = document.createElement("div");
      item.className = "routing-empty";
      item.textContent = "No routing scans provided by the tracking API yet.";
      routingList.appendChild(item);
    }

    consignmentBoard.appendChild(card);
  });
}

function countByStatus(records, status) {
  return records.filter((record) => record.statusKey === status).length;
}

function batchTitle(batch) {
  return `${batch.records.length} consignments`;
}

function formatDate(value) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRouteDate(value) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatRouteTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function lastRefreshLabel() {
  const value = localStorage.getItem(REFRESH_KEY);
  return value ? `Last refreshed ${formatDate(value)}` : "Not refreshed yet";
}

function exportCsv() {
  const header = ["batch", "tracking_id", "status", "last_location", "last_update", "source"];
  const rows = batches.flatMap((batch, index) =>
    batch.records.map((record) => [
      `Batch ${batches.length - index}`,
      record.id,
      record.statusLabel,
      record.location,
      record.updatedAt || "",
      record.source || "",
    ]),
  );
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "postpilot-batches.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const ids = parseTrackingIds(String(reader.result));
    if (ids.length) {
      const batch = createBatch(ids);
      batches.unshift(batch);
      activeBatchId = batch.id;
      saveBatches();
      render();
      refreshBatch(batch.id);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

render();
setApiStatus(location.protocol === "file:" ? "Open via 127.0.0.1 for live API" : "Ready for live API", location.protocol === "file:" ? "offline" : "waiting");
refreshAll();
