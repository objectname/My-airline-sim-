
// Basic Leaflet map setup
const map = L.map('map').setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Example airport database (extend as needed)
const airports = {
  HND: { lat: 35.5494, lon: 139.7798 },
  LHR: { lat: 51.4700, lon: -0.4543 },
  KIX: { lat: 34.434, lon: 135.244 },
  OKA: { lat: 26.195, lon: 127.646 }
};

// Haversine distance
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Turnaround rules
function getTurnaround(distance) {
  if (distance > 10000) return 2.5;
  if (distance > 4000) return 2.0;
  if (distance > 1500) return 1.5;
  return 1.0;
}

// Formula constant
const formulaSpeed = 9360 / 22; // km/h

document.getElementById('calculate').addEventListener('click', () => {
  const originCode = document.getElementById('origin').value.trim().toUpperCase();
  const destCode = document.getElementById('destination').value.trim().toUpperCase();
  const stopover = document.getElementById('stopover').checked;

  if (!airports[originCode] || !airports[destCode]) {
    alert("Unknown airport code");
    return;
  }

  const origin = airports[originCode];
  const dest = airports[destCode];

  const distance = calcDistance(origin.lat, origin.lon, dest.lat, dest.lon);
  const turnaround = getTurnaround(distance);

  const totalTime = (distance / formulaSpeed) + turnaround;

  // Draw route
  L.polyline([[origin.lat, origin.lon], [dest.lat, dest.lon]], {color: 'blue'}).addTo(map);
  map.fitBounds([[origin.lat, origin.lon], [dest.lat, dest.lon]]);

  // Results
  document.getElementById('results').innerHTML = `
    <p>Distance: ${distance.toFixed(2)} km</p>
    <p>Turnaround: ${turnaround} h</p>
    <p>Total Time: ${totalTime.toFixed(2)} h</p>
  `;
});
