const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8084);
const API_KEY = process.env.TRACKCOURIER_API_KEY;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/track") {
      await handleTrack(request, response);
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, {
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: error.message,
      },
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PostPilot running at http://127.0.0.1:${PORT}`);
});

async function handleTrack(request, response) {
  if (!API_KEY) {
    sendJson(response, 500, {
      success: false,
      error: {
        code: "MISSING_API_KEY",
        message: "Set TRACKCOURIER_API_KEY before starting the server.",
      },
    });
    return;
  }

  const body = await readJson(request);
  const trackingNumbers = Array.isArray(body.trackingNumbers)
    ? body.trackingNumbers.filter(isValidConsignmentId)
    : [];
  const courier = body.courier === "indiapost" ? "indiapost" : "speedpost";

  const results = [];
  for (const trackingNumber of trackingNumbers.slice(0, 25)) {
    results.push(await fetchTracking(courier, trackingNumber));
  }

  sendJson(response, 200, {
    success: true,
    data: results,
  });
}

async function fetchTracking(courier, trackingNumber) {
  const url = new URL("https://api.trackcourier.io/v1/track");
  url.searchParams.set("courier", courier);
  url.searchParams.set("tracking_number", trackingNumber);

  const apiResponse = await fetch(url, {
    headers: {
      "X-API-Key": API_KEY,
      Accept: "application/json",
    },
  });
  const payload = await apiResponse.json().catch(() => ({}));

  if (!apiResponse.ok || payload.success === false) {
    return {
      trackingNumber,
      success: false,
      error: payload.error || {
        code: `HTTP_${apiResponse.status}`,
        message: "Tracking provider failed.",
      },
    };
  }

  return normalizeTracking(trackingNumber, courier, payload.data || {});
}

function normalizeTracking(trackingNumber, courier, data) {
  const checkpoints = Array.isArray(data.checkpoints)
    ? data.checkpoints.map((checkpoint) => ({
        timestamp: checkpoint.timestamp || checkpoint.date || null,
        status: checkpoint.status || checkpoint.message || "Status update",
        location: checkpoint.location || checkpoint.city || "",
      }))
    : [];

  return {
    trackingNumber,
    courier,
    success: true,
    status: data.status || "pending",
    mostRecentStatus: data.MostRecentStatus || data.mostRecentStatus || data.status || "Pending",
    originCity: data.OriginCity || data.originCity || "",
    destinationCity: data.DestinationCity || data.destinationCity || "",
    expectedDeliveryDate: data.ExpectedDeliveryDate || data.expectedDeliveryDate || null,
    deliveredDate: data.DeliveredDate || data.deliveredDate || null,
    checkpoints,
  };
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(contents);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function isValidConsignmentId(value) {
  return /^[A-Z]{2}\d{9}IN$/.test(String(value || "").toUpperCase());
}
