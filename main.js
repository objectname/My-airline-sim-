"use strict";

/*
  Keep this file in the same folder as index.html and airports-2.csv.

  This version:
  - Reads airport type/class from the CSV.
  - Ignores heliports, closed airports, and seaplane bases.
  - Keeps small, medium, and large airports.
  - Supports the Airport B type filter and result-count picker, if
    #airport-b-type and #airport-b-result-count exist in index.html.
*/

const CSV_FILE = "airports.csv";

const SPEED_KMH = 9360 / 22;
const EARTH_RADIUS_KM = 6371;

const SEARCH_RESULT_LIMIT = 75;
const AIRPORT_MATCH_TOLERANCE_KM = 100;
const DEFAULT_AIRPORT_MATCH_LIMIT = 10;

const EXCLUDED_AIRPORT_TYPES = new Set([
  "heliport",
  "closed",
  "seaplanebase"
]);

let airports = [];
let routeLayer = null;

const airportState = {
  origin: null,
  destination: null
};

const dataStatus = document.getElementById("data-status");
const dataStatusText = document.getElementById("data-status-text");

const originInput = document.getElementById("origin-input");
const destinationInput = document.getElementById("destination-input");

const originResults = document.getElementById("origin-results");
const destinationResults = document.getElementById(
  "destination-results"
);

const originClearButton = document.getElementById(
  "origin-clear-btn"
);

const destinationClearButton = document.getElementById(
  "destination-clear-btn"
);

const swapButton = document.getElementById("swap-route-btn");
const turnoverButton = document.getElementById("turnover-btn");

const distanceDisplay = document.getElementById("distance-display");
const timeDisplay = document.getElementById("time-display");
const turnaroundDisplay = document.getElementById(
  "turnaround-display"
);

const totalBlockDisplay = document.getElementById(
  "total-block-display"
);

const solveDistanceInput = document.getElementById(
  "solve-dist-input"
);

const solveTimeInput = document.getElementById(
  "solve-time-input"
);

const solveTimeOutput = document.getElementById(
  "solve-time-output"
);

const solveDistanceOutput = document.getElementById(
  "solve-dist-output"
);

const airportFinderDistanceInput = document.getElementById(
  "airport-finder-distance"
);

const airportFinderButton = document.getElementById(
  "airport-finder-btn"
);

const airportFinderOutput = document.getElementById(
  "airport-finder-output"
);

const airportBTypeSelect = document.getElementById(
  "airport-b-type"
);

const airportBResultCountSelect = document.getElementById(
  "airport-b-result-count"
);


const toggleMapButton = document.getElementById("toggle-map-btn");
const mapView = document.getElementById("map-view");
const cesiumContainer = document.getElementById("cesiumContainer");

const map = L.map("map", {
  worldCopyJump: true
}).setView([20, 0], 2);

const openStreetMap = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }
);

const satelliteMap = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri"
  }
);

satelliteMap.addTo(map);

L.control
  .layers(
    {
      "Satellite imagery": satelliteMap,
      OpenStreetMap: openStreetMap
    },
    null,
    {
      position: "topright"
    }
  )
  .addTo(map);

const markerGroup = L.layerGroup().addTo(map);


let cesiumViewer = null;
let globeVisible = false;
let cesiumOriginEntity = null;
let cesiumDestinationEntity = null;
let cesiumRouteEntity = null;

const MAPTILER_KEY = "YOUR_MAPTILER_API_KEY_HERE";

function createCesiumViewer() {
  if (cesiumViewer || typeof Cesium === "undefined") {
    return cesiumViewer;
  }

  const options = {
    animation: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    homeButton: true,
    geocoder: false,
    fullscreenButton: false,
    timeline: false,
    infoBox: true,
    selectionIndicator: true,
    shouldAnimate: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity
  };

  const validKey = MAPTILER_KEY !== "YOUR_MAPTILER_API_KEY_HERE";

  if (validKey) {
    options.baseLayer = new Cesium.ImageryLayer(
      new Cesium.UrlTemplateImageryProvider({
        url:
          "https://api.maptiler.com/maps/satellite-v4/" +
          "{z}/{x}/{y}.jpg?key=" +
          encodeURIComponent(MAPTILER_KEY),
        minimumLevel: 0,
        maximumLevel: 20,
        tileWidth: 512,
        tileHeight: 512
      })
    );
  } else {
    options.baseLayer = new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/"
      })
    );
  }

  cesiumViewer = new Cesium.Viewer("cesiumContainer", options);
  cesiumViewer.scene.globe.enableLighting = false;
  cesiumViewer.scene.globe.showGroundAtmosphere = true;
  cesiumViewer.scene.requestRender();

  cesiumViewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(114.1694, 22.3193, 18000000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0
    }
  });

  return cesiumViewer;
}

function updateCesiumRoute(origin, destination) {
  if (!cesiumViewer) {
    return;
  }

  if (cesiumOriginEntity) {
    cesiumViewer.entities.remove(cesiumOriginEntity);
  }

  if (cesiumDestinationEntity) {
    cesiumViewer.entities.remove(cesiumDestinationEntity);
  }

  if (cesiumRouteEntity) {
    cesiumViewer.entities.remove(cesiumRouteEntity);
  }

  cesiumOriginEntity = null;
  cesiumDestinationEntity = null;
  cesiumRouteEntity = null;

  if (!origin || !destination) {
    cesiumViewer.scene.requestRender();
    return;
  }

  function description(airport) {
    return (
      `<strong>${escapeHtml(airport.city)}</strong><br>` +
      `${escapeHtml(airport.name)}<br>` +
      `${escapeHtml(airport.iata)} / ${escapeHtml(airport.icao)}`
    );
  }

  cesiumOriginEntity = cesiumViewer.entities.add({
    name: `Airport A: ${origin.iata}`,
    description: description(origin),
    position: Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, 500),
    point: {
      pixelSize: 11,
      color: Cesium.Color.LIME,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: `A: ${origin.iata}`,
      font: "bold 13px sans-serif",
      fillColor: Cesium.Color.LIME,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  cesiumDestinationEntity = cesiumViewer.entities.add({
    name: `Airport B: ${destination.iata}`,
    description: description(destination),
    position: Cesium.Cartesian3.fromDegrees(destination.lon, destination.lat, 500),
    point: {
      pixelSize: 11,
      color: Cesium.Color.CYAN,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: `B: ${destination.iata}`,
      font: "bold 13px sans-serif",
      fillColor: Cesium.Color.CYAN,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  cesiumRouteEntity = cesiumViewer.entities.add({
    name: `${origin.iata} to ${destination.iata}`,
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray([
        origin.lon,
        origin.lat,
        destination.lon,
        destination.lat
      ]),
      width: 4,
      arcType: Cesium.ArcType.GEODESIC,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.22,
        color: Cesium.Color.CYAN
      })
    }
  });

  if (globeVisible) {
    cesiumViewer.flyTo(
      [cesiumOriginEntity, cesiumDestinationEntity, cesiumRouteEntity],
      { duration: 1.1 }
    );
  }

  cesiumViewer.scene.requestRender();
}

function setGlobeVisibility(isVisible) {
  globeVisible = isVisible;
  mapView.classList.toggle("globe-visible", globeVisible);

  if (globeVisible) {
    createCesiumViewer();
    toggleMapButton.textContent = "Close Globe";
    toggleMapButton.setAttribute("aria-pressed", "true");

    window.setTimeout(() => {
      cesiumViewer.resize();
      cesiumViewer.scene.requestRender();
      updateCesiumRoute(airportState.origin, airportState.destination);
    }, 250);
  } else {
    toggleMapButton.textContent = "Open Globe";
    toggleMapButton.setAttribute("aria-pressed", "false");
    map.invalidateSize();
  }
}

function setStatus(message, mode = "loading") {
  dataStatus.classList.remove("ready", "error");

  if (mode === "ready") {
    dataStatus.classList.add("ready");
  }

  if (mode === "error") {
    dataStatus.classList.add("error");
  }

  dataStatusText.textContent = message;
}

function normalizeHeader(header) {
  return String(header)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeAirportType(value) {
  const normalized = normalizeSearchText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases = {
    "small": "smallairport",
    "small airport": "smallairport",
    "smallairport": "smallairport",

    "medium": "mediumairport",
    "medium airport": "mediumairport",
    "mediumairport": "mediumairport",

    "large": "largeairport",
    "large airport": "largeairport",
    "largeairport": "largeairport",

    "heliport": "heliport",

    "seaplane": "seaplanebase",
    "seaplane base": "seaplanebase",
    "seaplanebase": "seaplanebase",

    "closed": "closed"
  };

  return aliases[normalized] || normalized || "unknown";
}

function airportTypeLabel(type) {
  const labels = {
    "smallairport": "Small airport",
    "mediumairport": "Medium airport",
    "largeairport": "Large airport"
  };

  return labels[type] || type;
}

function findHeaderIndex(headers, possibleNames) {
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const possibleName of possibleNames) {
    const index = normalizedHeaders.indexOf(
      normalizeHeader(possibleName)
    );

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (insideQuotes && nextCharacter === "\"") {
        value += "\"";
        index++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value.trim());

  return values;
}

function parseAirportCsv(csvText) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("The CSV does not contain airport data rows.");
  }

  const headers = parseCsvLine(lines[0]);

  const iataIndex = findHeaderIndex(headers, [
    "iata",
    "iata_code",
    "iata code"
  ]);

  const icaoIndex = findHeaderIndex(headers, [
    "icao",
    "icao_code",
    "icao code",
    "gps_code",
    "gps code",
    "ident"
  ]);

  const nameIndex = findHeaderIndex(headers, [
    "name",
    "airport_name",
    "airport name"
  ]);

  const cityIndex = findHeaderIndex(headers, [
    "city",
    "municipality",
    "served_city",
    "served city"
  ]);

  const typeIndex = findHeaderIndex(headers, [
    "type",
    "airport_type",
    "airport type",
    "facility_type",
    "facility type",
    "classification",
    "class"
  ]);

  const latitudeIndex = findHeaderIndex(headers, [
    "latitude",
    "latitude_deg",
    "latitude deg",
    "lat"
  ]);

  const longitudeIndex = findHeaderIndex(headers, [
    "longitude",
    "longitude_deg",
    "longitude deg",
    "lon",
    "lng"
  ]);

  if (
    nameIndex === -1 ||
    latitudeIndex === -1 ||
    longitudeIndex === -1
  ) {
    throw new Error(
      "CSV headers must include airport name, latitude, and longitude."
    );
  }

  const parsedAirports = [];
  const duplicateKeys = new Set();

  for (let rowNumber = 1; rowNumber < lines.length; rowNumber++) {
    const row = parseCsvLine(lines[rowNumber]);

    const iata =
      iataIndex >= 0
        ? String(row[iataIndex] || "").trim()
        : "";

    const icao =
      icaoIndex >= 0
        ? String(row[icaoIndex] || "").trim()
        : "";

    const name = String(row[nameIndex] || "").trim();

    const city =
      cityIndex >= 0
        ? String(row[cityIndex] || "").trim()
        : "";

    const type = normalizeAirportType(
      typeIndex >= 0 ? row[typeIndex] : "unknown"
    );

    const latitude = Number(row[latitudeIndex]);
    const longitude = Number(row[longitudeIndex]);

    const validCoordinates =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    const hasAirportCode = Boolean(iata || icao);

    if (
      !name ||
      !hasAirportCode ||
      !validCoordinates ||
      EXCLUDED_AIRPORT_TYPES.has(type)
    ) {
      continue;
    }

    const uniqueKey = [
      iata,
      icao,
      latitude,
      longitude
    ].join("|");

    if (duplicateKeys.has(uniqueKey)) {
      continue;
    }

    duplicateKeys.add(uniqueKey);

    parsedAirports.push({
      iata: iata || "—",
      icao: icao || "—",
      name,
      city: city || "Unknown city",
      type,
      lat: latitude,
      lon: longitude
    });
  }

  return parsedAirports.sort((airportA, airportB) => {
    const byCity = airportA.city.localeCompare(airportB.city);

    if (byCity !== 0) {
      return byCity;
    }

    return airportA.name.localeCompare(airportB.name);
  });
}

async function loadAirportDatabase() {
  setStatus(`Loading ${CSV_FILE}…`);

  try {
    const response = await fetch(CSV_FILE, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `Could not load ${CSV_FILE}: HTTP ${response.status}.`
      );
    }

    const csvText = await response.text();

    airports = parseAirportCsv(csvText);

    if (airports.length === 0) {
      throw new Error(
        "No valid searchable airport records were found."
      );
    }

    enableInterface();
    populateAirportTypeFilter();

    setStatus(
      `${airports.length.toLocaleString()} eligible airports loaded.`,
      "ready"
    );

    setDefaultAirports();
  } catch (error) {
    console.error(error);

    setStatus(
      `${error.message} Use a local server and confirm ${CSV_FILE} is in the same folder as index.html.`,
      "error"
    );
  }
}

function enableInterface() {
  originInput.disabled = false;
  destinationInput.disabled = false;

  originClearButton.disabled = false;
  destinationClearButton.disabled = false;

  swapButton.disabled = false;
  turnoverButton.disabled = false;
  airportFinderButton.disabled = false;

  originInput.placeholder =
    "Search city, IATA, ICAO, or airport";

  destinationInput.placeholder =
    "Search city, IATA, ICAO, or airport";
}

function populateAirportTypeFilter() {
  if (!airportBTypeSelect) {
    return;
  }

  const allowedTypes = [
    "largeairport",
    "mediumairport",
    "smallairport"
  ];

  const presentTypes = new Set(
    airports.map((airport) => airport.type)
  );

  airportBTypeSelect.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All airport sizes";
  airportBTypeSelect.appendChild(allOption);

  for (const type of allowedTypes) {
    if (!presentTypes.has(type)) {
      continue;
    }

    const option = document.createElement("option");
    option.value = type;
    option.textContent = `${airportTypeLabel(type)}s`;
    airportBTypeSelect.appendChild(option);
  }
}

function airportLabel(airport) {
  return (
    `${airport.city} (${airport.iata}/${airport.icao}) — ` +
    airport.name
  );
}

function airportSearchText(airport) {
  return normalizeSearchText(
    [
      airport.iata,
      airport.icao,
      airport.city,
      airport.name,
      airportTypeLabel(airport.type)
    ].join(" ")
  );
}

function findAirports(query) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return airports.slice(0, SEARCH_RESULT_LIMIT);
  }

  const codeMatches = [];
  const cityMatches = [];
  const textMatches = [];

  for (const airport of airports) {
    const iata = normalizeSearchText(airport.iata);
    const icao = normalizeSearchText(airport.icao);
    const city = normalizeSearchText(airport.city);
    const text = airportSearchText(airport);

    if (
      iata.startsWith(normalizedQuery) ||
      icao.startsWith(normalizedQuery)
    ) {
      codeMatches.push(airport);
    } else if (city.startsWith(normalizedQuery)) {
      cityMatches.push(airport);
    } else if (text.includes(normalizedQuery)) {
      textMatches.push(airport);
    }
  }

  return [
    ...codeMatches,
    ...cityMatches,
    ...textMatches
  ].slice(0, SEARCH_RESULT_LIMIT);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function highlightMatch(text, query) {
  const cleanQuery = String(query || "").trim();
  const safeText = escapeHtml(text);

  if (!cleanQuery) {
    return safeText;
  }

  const expression = new RegExp(
    `(${escapeRegExp(cleanQuery)})`,
    "ig"
  );

  return safeText.replace(expression, "<mark>$1</mark>");
}

function createAirportPicker(type) {
  const input =
    type === "origin" ? originInput : destinationInput;

  const resultList =
    type === "origin" ? originResults : destinationResults;

  const clearButton =
    type === "origin"
      ? originClearButton
      : destinationClearButton;

  let matches = [];
  let highlightedIndex = -1;

  function setExpanded(isOpen) {
    resultList.classList.toggle("open", isOpen);
    input.setAttribute("aria-expanded", String(isOpen));
  }

  function renderResults(query = input.value) {
    matches = findAirports(query);
    highlightedIndex = -1;
    resultList.replaceChildren();

    if (matches.length === 0) {
      const emptyMessage = document.createElement("div");

      emptyMessage.className = "airport-empty";
      emptyMessage.textContent =
        "No eligible airport matches that search.";

      resultList.appendChild(emptyMessage);
      setExpanded(true);

      return;
    }

    for (let index = 0; index < matches.length; index++) {
      const airport = matches[index];
      const option = document.createElement("div");

      option.className = "airport-option";
      option.id = `${type}-option-${index}`;
      option.setAttribute("role", "option");

      option.innerHTML = `
        <span class="airport-option-code">
          ${highlightMatch(airport.iata, query)}
        </span>

        <span>
          <span class="airport-option-main">
            ${highlightMatch(airport.city, query)}
          </span>

          <span class="airport-option-detail">
            ${highlightMatch(airport.name, query)}
            · ${highlightMatch(airport.icao, query)}
            · ${escapeHtml(airportTypeLabel(airport.type))}
          </span>
        </span>
      `;

      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        selectAirport(airport);
      });

      resultList.appendChild(option);
    }

    setExpanded(true);
  }

  function updateKeyboardHighlight() {
    const options = resultList.querySelectorAll(
      ".airport-option"
    );

    options.forEach((option, index) => {
      const active = index === highlightedIndex;

      option.classList.toggle("active", active);

      if (active) {
        input.setAttribute(
          "aria-activedescendant",
          `${type}-option-${index}`
        );

        option.scrollIntoView({
          block: "nearest"
        });
      }
    });

    if (highlightedIndex === -1) {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function selectAirport(airport) {
    airportState[type] = airport;

    input.value = airportLabel(airport);
    input.classList.remove("invalid");

    setExpanded(false);
    updateRoute();
  }

  function clearAirport() {
    airportState[type] = null;

    input.value = "";
    input.classList.remove("invalid");

    setExpanded(false);
    updateRoute();
  }

  input.addEventListener("focus", () => {
    if (!input.disabled) {
      input.select();
      renderResults("");
    }
  });

  input.addEventListener("input", () => {
    airportState[type] = null;
    input.classList.remove("invalid");
    renderResults(input.value);
  });

  input.addEventListener("keydown", (event) => {
    const listOpen = resultList.classList.contains("open");

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!listOpen) {
        renderResults(input.value);
      }

      highlightedIndex = Math.min(
        highlightedIndex + 1,
        matches.length - 1
      );

      updateKeyboardHighlight();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (!listOpen) {
        renderResults(input.value);
      }

      highlightedIndex = Math.max(
        highlightedIndex - 1,
        0
      );

      updateKeyboardHighlight();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (
        highlightedIndex >= 0 &&
        matches[highlightedIndex]
      ) {
        selectAirport(matches[highlightedIndex]);
        return;
      }

      if (matches.length === 1) {
        selectAirport(matches[0]);
        return;
      }

      const normalizedInput = normalizeSearchText(input.value);

      const exactCodeMatch = airports.find((airport) => {
        return (
          normalizeSearchText(airport.iata) === normalizedInput ||
          normalizeSearchText(airport.icao) === normalizedInput
        );
      });

      if (exactCodeMatch) {
        selectAirport(exactCodeMatch);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setExpanded(false);
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      const selectedAirport = airportState[type];

      if (selectedAirport) {
        input.value = airportLabel(selectedAirport);
        input.classList.remove("invalid");
      } else if (input.value.trim()) {
        input.classList.add("invalid");
      }

      setExpanded(false);
    }, 150);
  });

  clearButton.addEventListener("click", () => {
    clearAirport();
    input.focus();
    renderResults("");
  });

  return {
    selectAirport,
    clearAirport
  };
}

const originPicker = createAirportPicker("origin");
const destinationPicker = createAirportPicker("destination");

function findAirportByIata(iataCode) {
  const normalizedIata = String(iataCode).toUpperCase();

  return airports.find((airport) => {
    return airport.iata.toUpperCase() === normalizedIata;
  });
}

function setDefaultAirports() {
  const defaultOrigin =
    findAirportByIata("HKG") ||
    findAirportByIata("HND") ||
    airports[0];

  const defaultDestination =
    findAirportByIata("LHR") ||
    findAirportByIata("LAX") ||
    airports[1] ||
    airports[0];

  originPicker.selectAirport(defaultOrigin);
  destinationPicker.selectAirport(defaultDestination);
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function calculateGreatCircleDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);

  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) ** 2;

  const c = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );

  return EARTH_RADIUS_KM * c;
}

function flightHoursFromDistance(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return 0;
  }

  return distanceKm / SPEED_KMH;
}

function turnaroundHoursFromDistance(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return 0;
  }

  if (distanceKm < 1500) {
    return 1;
  }

  if (distanceKm < 4000) {
    return 1.5;
  }

  if (distanceKm < 10000) {
    return 2;
  }

  return 2.5;
}

function totalBlockHoursFromDistance(distanceKm) {
  return (
    flightHoursFromDistance(distanceKm) +
    turnaroundHoursFromDistance(distanceKm)
  );
}

function distanceFromTargetBlockHours(targetHours) {
  if (!Number.isFinite(targetHours) || targetHours < 0) {
    return null;
  }

  const distanceBands = [
    {
      minimum: 0,
      maximum: 1500,
      turnaroundHours: 1
    },
    {
      minimum: 1500,
      maximum: 4000,
      turnaroundHours: 1.5
    },
    {
      minimum: 4000,
      maximum: 10000,
      turnaroundHours: 2
    },
    {
      minimum: 10000,
      maximum: Infinity,
      turnaroundHours: 2.5
    }
  ];

  for (const band of distanceBands) {
    const distance =
      (targetHours - band.turnaroundHours) *
      SPEED_KMH;

    const validForBand =
      distance >= band.minimum &&
      (
        band.maximum === Infinity ||
        distance < band.maximum
      );

    if (validForBand) {
      return distance;
    }
  }

  return null;
}

function formatDuration(decimalHours) {
  if (!Number.isFinite(decimalHours) || decimalHours < 0) {
    return "0h 0m";
  }

  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

function getGeodesicPoints(
  origin,
  destination,
  segments = 140
) {
  const lat1 = toRadians(origin.lat);
  const lon1 = toRadians(origin.lon);

  const lat2 = toRadians(destination.lat);
  const lon2 = toRadians(destination.lon);

  const angularDistance =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat1 - lat2) / 2) ** 2 +
          Math.cos(lat1) *
            Math.cos(lat2) *
            Math.sin((lon1 - lon2) / 2) ** 2
      )
    );

  if (angularDistance < 0.0000001) {
    return [[origin.lat, origin.lon]];
  }

  const points = [];

  for (let index = 0; index <= segments; index++) {
    const fraction = index / segments;

    const a =
      Math.sin((1 - fraction) * angularDistance) /
      Math.sin(angularDistance);

    const b =
      Math.sin(fraction * angularDistance) /
      Math.sin(angularDistance);

    const x =
      a * Math.cos(lat1) * Math.cos(lon1) +
      b * Math.cos(lat2) * Math.cos(lon2);

    const y =
      a * Math.cos(lat1) * Math.sin(lon1) +
      b * Math.cos(lat2) * Math.sin(lon2);

    const z =
      a * Math.sin(lat1) +
      b * Math.sin(lat2);

    const latitude = Math.atan2(
      z,
      Math.sqrt(x ** 2 + y ** 2)
    );

    const longitude = Math.atan2(y, x);

    points.push([
      (latitude * 180) / Math.PI,
      (longitude * 180) / Math.PI
    ]);
  }

  return points;
}

function splitAtDateLine(points) {
  const routeParts = [[]];

  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const previousPoint = points[index - 1];

    if (
      previousPoint &&
      Math.abs(point[1] - previousPoint[1]) > 180
    ) {
      routeParts.push([]);
    }

    routeParts[routeParts.length - 1].push(point);
  }

  return routeParts.filter((routePart) => {
    return routePart.length > 0;
  });
}

function resetRouteDisplay() {
  distanceDisplay.textContent = "—";
  timeDisplay.textContent = "—";
  turnaroundDisplay.textContent = "—";
  totalBlockDisplay.textContent = "—";
}

function updateRoute() {
  const origin = airportState.origin;
  const destination = airportState.destination;

  markerGroup.clearLayers();

  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

  if (!origin || !destination) {
    resetRouteDisplay();
    return;
  }

  const distance = calculateGreatCircleDistance(
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon
  );

  const flightHours = flightHoursFromDistance(distance);
  const turnaroundHours = turnaroundHoursFromDistance(distance);
  const totalBlockHours = totalBlockHoursFromDistance(distance);

  distanceDisplay.textContent =
    `${distance.toFixed(2)} km`;

  timeDisplay.textContent =
    formatDuration(flightHours);

  turnaroundDisplay.textContent =
    formatDuration(turnaroundHours);

  totalBlockDisplay.textContent =
    formatDuration(totalBlockHours);

  const originMarker = L.marker([
    origin.lat,
    origin.lon
  ]).bindPopup(
    `<strong>${escapeHtml(origin.city)}</strong><br>` +
    `${escapeHtml(origin.name)}<br>` +
    `${escapeHtml(origin.iata)} / ${escapeHtml(origin.icao)}`
  );

  const destinationMarker = L.marker([
    destination.lat,
    destination.lon
  ]).bindPopup(
    `<strong>${escapeHtml(destination.city)}</strong><br>` +
    `${escapeHtml(destination.name)}<br>` +
    `${escapeHtml(destination.iata)} / ${escapeHtml(destination.icao)}`
  );

  markerGroup.addLayer(originMarker);
  markerGroup.addLayer(destinationMarker);


updateCesiumRoute(origin, destination);

  if (
    origin.lat === destination.lat &&
    origin.lon === destination.lon
  ) {
    map.setView([origin.lat, origin.lon], 7);
    return;
  }

  const points = getGeodesicPoints(origin, destination);
  const routeParts = splitAtDateLine(points);

  routeLayer = L.layerGroup();

  for (const routePart of routeParts) {
    L.polyline(routePart, {
      color: "#38bdf8",
      weight: 4,
      opacity: 0.86,
      dashArray: "8, 8",
      lineCap: "round"
    }).addTo(routeLayer);
  }

  routeLayer.addTo(map);

  const bounds = L.latLngBounds([
    [origin.lat, origin.lon],
    [destination.lat, destination.lon]
  ]);

  map.fitBounds(bounds, {
    padding: [55, 55],
    maxZoom: 6
  });
}

function findAirportBMatches(
  originAirport,
  targetDistanceKm,
  airportType = "all",
  resultLimit = DEFAULT_AIRPORT_MATCH_LIMIT
) {
  const matches = [];

  for (const candidateAirport of airports) {
    const sameCoordinates =
      candidateAirport.lat === originAirport.lat &&
      candidateAirport.lon === originAirport.lon;

    if (sameCoordinates) {
      continue;
    }

    if (
      airportType !== "all" &&
      candidateAirport.type !== airportType
    ) {
      continue;
    }

    const actualDistance = calculateGreatCircleDistance(
      originAirport.lat,
      originAirport.lon,
      candidateAirport.lat,
      candidateAirport.lon
    );

    const difference = Math.abs(
      actualDistance - targetDistanceKm
    );

    if (difference <= AIRPORT_MATCH_TOLERANCE_KM) {
      matches.push({
        airport: candidateAirport,
        distance: actualDistance,
        difference
      });
    }
  }

  return matches
    .sort((matchA, matchB) => {
      if (matchA.difference !== matchB.difference) {
        return matchA.difference - matchB.difference;
      }

      return matchA.distance - matchB.distance;
    })
    .slice(0, resultLimit);
}

function showAirportFinderMessage(message) {
  airportFinderOutput.replaceChildren();

  const messageElement = document.createElement("div");

  messageElement.className = "airport-finder-message";
  messageElement.textContent = message;

  airportFinderOutput.appendChild(messageElement);
}

function renderAirportBMatches(matches, targetDistanceKm) {
  airportFinderOutput.replaceChildren();

  if (matches.length === 0) {
    showAirportFinderMessage(
      `No eligible Airport B records were found between ` +
      `${(
        targetDistanceKm - AIRPORT_MATCH_TOLERANCE_KM
      ).toFixed(0)} km and ` +
      `${(
        targetDistanceKm + AIRPORT_MATCH_TOLERANCE_KM
      ).toFixed(0)} km from Airport A.`
    );

    return;
  }

  for (const match of matches) {
    const airport = match.airport;
    const result = document.createElement("button");

    result.type = "button";
    result.className = "airport-match";

    result.innerHTML = `
      <span class="airport-match-code">
        ${escapeHtml(airport.iata)}
      </span>

      <span class="airport-match-details">
        <span class="airport-match-city">
          ${escapeHtml(airport.city)}
        </span>

        <span class="airport-match-name">
          ${escapeHtml(airport.name)} ·
          ${escapeHtml(airport.icao)}
        </span>

        <span class="airport-match-name">
          ${escapeHtml(airportTypeLabel(airport.type))}
        </span>
      </span>

      <span class="airport-match-distance">
        ${match.distance.toFixed(0)} km<br>
        ±${match.difference.toFixed(0)}
      </span>
    `;

    result.title =
      `Choose ${airport.city} (${airport.iata}) as Airport B. ` +
      `Actual distance: ${match.distance.toFixed(2)} km. ` +
      `Difference from target: ${match.difference.toFixed(2)} km.`;

    result.addEventListener("click", () => {
      destinationPicker.selectAirport(airport);

      showAirportFinderMessage(
        `${airport.city} (${airport.iata}) is now Airport B. ` +
        `Actual distance from ${airportState.origin.city} ` +
        `(${airportState.origin.iata}): ` +
        `${match.distance.toFixed(2)} km.`
      );
    });

    airportFinderOutput.appendChild(result);
  }
}

swapButton.addEventListener("click", () => {
  const origin = airportState.origin;
  const destination = airportState.destination;

  if (!origin || !destination) {
    return;
  }

  originPicker.selectAirport(destination);
  destinationPicker.selectAirport(origin);
});

turnoverButton.addEventListener("click", updateRoute);

document
  .getElementById("solve-time-btn")
  .addEventListener("click", () => {
    const distance = Number(solveDistanceInput.value);

    if (!Number.isFinite(distance) || distance < 0) {
      solveTimeOutput.textContent =
        "Enter a valid distance of zero or greater.";

      return;
    }

    const flightHours = flightHoursFromDistance(distance);
    const turnaroundHours = turnaroundHoursFromDistance(distance);
    const totalHours = totalBlockHoursFromDistance(distance);

    solveTimeOutput.textContent =
      `Flight: ${formatDuration(flightHours)} | ` +
      `Turnaround: ${formatDuration(turnaroundHours)} | ` +
      `Total: ${formatDuration(totalHours)}`;
  });

document
  .getElementById("solve-dist-btn")
  .addEventListener("click", () => {
    const targetHours = Number(solveTimeInput.value);

    if (!Number.isFinite(targetHours) || targetHours < 0) {
      solveDistanceOutput.textContent =
        "Enter a valid block time of zero or greater.";

      return;
    }

    const distance = distanceFromTargetBlockHours(targetHours);

    if (distance === null) {
      solveDistanceOutput.textContent =
        "No valid distance exists for that time under the current turnaround bands.";

      return;
    }

    const turnaroundHours = turnaroundHoursFromDistance(distance);

    solveDistanceOutput.textContent =
      `${distance.toFixed(2)} km | ` +
      `Turnaround: ${formatDuration(turnaroundHours)} | ` +
      `Total: ${formatDuration(targetHours)}`;
  });

airportFinderButton.addEventListener("click", () => {
  const originAirport = airportState.origin;

  const targetDistanceKm = Number(
    airportFinderDistanceInput.value
  );

  if (!originAirport) {
    showAirportFinderMessage(
      "Choose Airport A before searching for Airport B."
    );

    return;
  }

  if (
    !Number.isFinite(targetDistanceKm) ||
    targetDistanceKm < 0
  ) {
    showAirportFinderMessage(
      "Enter a valid target distance in kilometres."
    );

    return;
  }

  const selectedAirportType = airportBTypeSelect
    ? airportBTypeSelect.value
    : "all";

  const selectedResultLimit = airportBResultCountSelect
    ? Number(airportBResultCountSelect.value)
    : DEFAULT_AIRPORT_MATCH_LIMIT;

  const matches = findAirportBMatches(
    originAirport,
    targetDistanceKm,
    selectedAirportType,
    Number.isFinite(selectedResultLimit)
      ? selectedResultLimit
      : DEFAULT_AIRPORT_MATCH_LIMIT
  );

  renderAirportBMatches(matches, targetDistanceKm);
});

airportFinderDistanceInput.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      airportFinderButton.click();
    }
  }
);

solveDistanceInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    document.getElementById("solve-time-btn").click();
  }
});

solveTimeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    document.getElementById("solve-dist-btn").click();
  }
});

document.addEventListener("click", (event) => {
  const insideAirportPicker = event.target.closest(
    ".airport-picker"
  );

  if (insideAirportPicker) {
    return;
  }

  originResults.classList.remove("open");
  destinationResults.classList.remove("open");

  originInput.setAttribute("aria-expanded", "false");
  destinationInput.setAttribute("aria-expanded", "false");
});



toggleMapButton.addEventListener("click", () => {
setGlobeVisibility(!globeVisible);
});

window.addEventListener("resize", () => {
map.invalidateSize();

if (cesiumViewer) {
cesiumViewer.resize();
cesiumViewer.scene.requestRender();
}
});

window.addEventListener("orientationchange", () => {
window.setTimeout(() => {
map.invalidateSize();

if (cesiumViewer) {
cesiumViewer.resize();
cesiumViewer.scene.requestRender();
}
}, 250);
});

setGlobeVisibility(false);

loadAirportDatabase();
