<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>Widebody Flight Distance Dashboard</title>
<link rel="stylesheet" href="site.css" />

<script src="https://cesium.com/downloads/cesiumjs/releases/1.116/Build/Cesium/Cesium.js"></script>
<link href="https://cesium.com/downloads/cesiumjs/releases/1.116/Build/Cesium/Widgets/widgets.css" rel="stylesheet" />
</head>

<body>
  <header>
    <h1>Widebody Flight Distance Dashboard</h1>
    <div class="badge">Airport Search + Route Match</div>
  </header>

  <main class="main-container">
    <aside id="sidebar">
      <div id="data-status" class="status">
        <span class="status-dot"></span>
        <span id="data-status-text">Loading airports.csv…</span>
      </div>

      <div class="airport-grid">
        <div class="control-group airport-picker">
          <label for="origin-input">Airport A — Origin</label>

          <div class="combobox">
            <input
              id="origin-input"
              class="airport-search"
              type="text"
              autocomplete="off"
              disabled
              placeholder="Loading airport database…"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="origin-results"
            />

            <button
              id="origin-clear-btn"
              class="input-icon-btn"
              type="button"
              disabled
              aria-label="Clear origin"
              title="Clear origin"
            >
              ×
            </button>

            <div
              id="origin-results"
              class="airport-results"
              role="listbox"
            ></div>
          </div>
        </div>

        <div class="swap-wrap">
          <button
            id="swap-route-btn"
            class="swap-btn"
            type="button"
            disabled
            aria-label="Swap origin and destination"
            title="Swap route"
          >
            ⇄
          </button>
        </div>

        <div class="control-group airport-picker">
          <label for="destination-input">Airport B — Destination</label>

          <div class="combobox">
            <input
              id="destination-input"
              class="airport-search"
              type="text"
              autocomplete="off"
              disabled
              placeholder="Loading airport database…"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="destination-results"
            />

            <button
              id="destination-clear-btn"
              class="input-icon-btn"
              type="button"
              disabled
              aria-label="Clear destination"
              title="Clear destination"
            >
              ×
            </button>

            <div
              id="destination-results"
              class="airport-results"
              role="listbox"
            ></div>
          </div>
        </div>
      </div>

      <button id="turnover-btn" class="btn" type="button" disabled>
        Analyze Route
      </button>

      <section class="results-box">
        <div class="result-item">
          <span>Great-circle distance</span>
          <strong id="distance-display">—</strong>
        </div>

        <div class="result-item">
          <span>Flight time</span>
          <strong id="time-display">—</strong>
        </div>

        <div class="result-item">
          <span>Turnaround</span>
          <strong id="turnaround-display">—</strong>
        </div>

        <div class="result-item">
          <span>Total block</span>
          <strong id="total-block-display">—</strong>
        </div>
      </section>
    </aside>

    <section id="map-panel">
      <div id="map"></div>
      <div id="cesiumContainer"></div>
    </section>
  </main>

  <button id="toggle-map-btn" class="btn map-toggle-btn" type="button" aria-pressed="false">
    Open Globe
  </button>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="main.js"></script>
</body>
</html>
