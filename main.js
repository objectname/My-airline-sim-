// Dark satellite basemap (Carto + ESRI)
const map = L.map('map').setView([20, 0], 2);
L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 
  {
    attribution: 'Tiles © Esri & contributors',
    maxZoom: 19
  }
).addTo(map);

// Example airport dataset (replace/extend with open-source ICAO/IATA library)
const airports = {
  HND: { icao: "RJTT", lat: 35.5494, lon: 139.7798 },
  LHR: { icao: "EGLL", lat: 51.4700, lon: -0.4543 },
  KIX: { icao: "RJBB", lat: 34.434, lon: 135.244 },
  OKA: { icao: "ROAH", lat: 26.195, lon: 127.646 }
};

// Add airport markers with logos
Object.entries(airports).forEach(([iata, data]) => {
  const icon = L.icon({
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Airplane_silhouette.png', // simple open airplane logo
    iconSize: [25, 25]
  });

  const marker = L.marker([data.lat, data.lon], { icon }).addTo(map);
  marker.bindPopup(`<b>${iata}</b> / ${data.icao}`);

  marker.on('click', () => {
    // Fill origin/destination automatically when clicked
    const originInput = document.getElementById('origin');
    const destInput = document.getElementById('destination');

    if (!originInput.value) {
      originInput.value = iata;
    } else {
      destInput.value = iata;
    }
  });
});

// Haversine distance
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
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
  L.polyline([[origin.lat, origin.lon], [dest.lat, dest.lon]], {color: 'yellow'}).addTo(map);
  map.fitBounds([[origin.lat, origin.lon], [dest.lat, dest.lon]]);

  // Results
  document.getElementById('results').innerHTML = `
    <p>Origin: ${originCode} / ${origin.icao}</p>
    <p>Destination: ${destCode} / ${dest.icao}</p>
    <p>Distance: ${distance.toFixed(2)} km</p>
    <p>Turnaround: ${turnaround} h</p>
    <p>Total Time: ${totalTime.toFixed(2)} h</p>
  `;
});
