// Get DOM elements first
const dashboard = document.getElementById('flight-dashboard');
const dashCloseBtn = document.getElementById('dash-close-btn');
const dashCallsign = document.getElementById('dash-callsign');
const dashRoute = document.getElementById('dash-route');
const dashIcao = document.getElementById('dash-icao');
const dashReg = document.getElementById('dash-reg');
const dashModel = document.getElementById('dash-model');
const dashAirline = document.getElementById('dash-airline');
const dashAltitude = document.getElementById('dash-altitude');
const dashVelocity = document.getElementById('dash-velocity');
const dashVertSpeed = document.getElementById('dash-vert-speed');
const dashSquawk = document.getElementById('dash-squawk');
const dashLoading = document.getElementById('dash-loading');
const globeContainer = document.getElementById('globe-container');
const filterInput = document.getElementById('filter-input');
const filterBtn = document.getElementById('filter-btn');
const clearFilterBtn = document.getElementById('clear-filter-btn');

let myGlobe;
let allFlights = []; 
let airportLookup = new Map();

// --- Main Application Logic ---

function initializeGlobe() {
  myGlobe = Globe()
    (globeContainer)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
    .pointsData([])
    .pointColor(d => d.isEmergency ? 'orangered' : '#9cff00')
    .pointAltitude('altitude')
    .pointRadius(d => d.isEmergency ? 0.25 : 0.15)
    .pointLabel('label')
    .arcsData([])
    .arcColor(() => '#ff4d4d')
    .arcStroke(1)
    .arcDashLength(0.5)
    .arcDashGap(0.2)
    .arcDashAnimateTime(2000)
    .labelsData([])
    .labelLat(d => d.lat)
    .labelLng(d => d.lon)
    .labelText(d => d.name)
    .labelSize(0.12)
    .labelColor(() => 'yellow')
    .labelDotRadius(0.4)
    .onPointClick(onPointClickHandler);

  fetchDataAndUpdateGlobe();
  setInterval(fetchDataAndUpdateGlobe, 20000);
}

const onPointClickHandler = async (point) => {
    dashboard.classList.add('visible');
    dashLoading.style.display = 'block';
    myGlobe.arcsData([]); 
    myGlobe.labelsData([]);
    dashCallsign.innerText = point.callsign;
    dashIcao.innerText = point.icao24;
    dashAltitude.innerText = `${point.baro_altitude_m.toLocaleString()} m`;
    dashVelocity.innerText = `${point.velocity_mph} mph`;
    dashVertSpeed.innerText = `${point.vert_speed_fpm.toLocaleString()} ft/min`;
    dashSquawk.innerText = point.squawk;
    if (point.isEmergency) { dashSquawk.style.color = 'orangered'; dashSquawk.style.fontWeight = 'bold'; } else { dashSquawk.style.color = 'white'; dashSquawk.style.fontWeight = 'normal'; }
    dashRoute.innerText = 'Loading...';
    dashReg.innerText = 'Loading...';
    dashModel.innerText = 'Loading...';
    dashAirline.innerText = 'Loading...';

    const routePromise = fetch(`/api/flight_route?icao=${point.icao24}`).then(res => res.json());
    const metaPromise = fetch(`/api/aircraft_meta?icao=${point.icao24}`).then(res => res.json());

    try {
        const [routeData, metaData] = await Promise.all([routePromise, metaPromise]);
        dashLoading.style.display = 'none';
        if (routeData && routeData.estDepartureAirport) {
            const depAirport = airportLookup.get(routeData.estDepartureAirport);
            if (depAirport && routeData.estArrivalAirport) {
                const arrAirport = airportLookup.get(routeData.estArrivalAirport);
                if (arrAirport) {
                    dashRoute.innerHTML = `${depAirport.name}<br>➔<br>${arrAirport.name}`;
                    myGlobe.arcsData([{ startLat: depAirport.lat, startLng: depAirport.lon, endLat: arrAirport.lat, endLng: arrAirport.lon }]);
                    myGlobe.labelsData([depAirport, arrAirport]);
                }
            } else if (depAirport) {
                dashRoute.innerHTML = `Departed from:<br>${depAirport.name}`;
                myGlobe.labelsData([depAirport]);
            }
        } else { dashRoute.innerText = 'Route data unavailable.'; }
        if (metaData && metaData.registration) {
            dashReg.innerText = metaData.registration;
            dashModel.innerText = metaData.model || 'N/A';
            dashAirline.innerText = metaData.owner || 'Private/Unknown';
        } else { dashReg.innerText = 'N/A'; dashModel.innerText = 'N/A'; dashAirline.innerText = 'N/A'; }
    } catch (error) { console.error("[CLIENT] Error fetching flight details:", error); dashLoading.style.display = 'none'; dashRoute.innerText = 'Could not load details.'; }
};

// --- EVENT LISTENERS ---
dashCloseBtn.addEventListener('click', () => { dashboard.classList.remove('visible'); myGlobe.arcsData([]); myGlobe.labelsData([]); });
filterBtn.addEventListener('click', () => { const filterText = filterInput.value.trim().toUpperCase(); if (!filterText) { myGlobe.pointsData(allFlights); return; } const filteredFlights = allFlights.filter(flight => flight.callsign.toUpperCase().includes(filterText)); myGlobe.pointsData(filteredFlights); });
clearFilterBtn.addEventListener('click', () => { filterInput.value = ''; myGlobe.pointsData(allFlights); });

// --- DATA FETCHING ---
const fetchDataAndUpdateGlobe = () => {
    fetch('/api/flights').then(res => res.json()).then(data => { if (!data || !data.states) return; allFlights = data.states.filter(f => f[0] && f[1] && f[5] && f[6] && f[10] != null && f[11] != null && f[14] != null).map(f => { const [icao24, callsign, , , , longitude, latitude, baro_altitude_m, , velocity_ms, true_track, vert_rate_ms, , , squawk] = f; const altitude = baro_altitude_m / 100000; const velocity_mph = (velocity_ms * 2.237).toFixed(0); const vert_speed_fpm = (vert_rate_ms * 196.85).toFixed(0); const emergencySquawks = ['7500', '7600', '7700']; const isEmergency = emergencySquawks.includes(squawk); return { icao24, callsign: callsign.trim(), lat: latitude, lng: longitude, altitude, baro_altitude_m, velocity_mph, true_track, vert_speed_fpm, squawk, isEmergency, label: `<b>${callsign.trim()} (${icao24})</b><br>${f[2]}` }; }); const currentFilter = filterInput.value.trim().toUpperCase(); if(currentFilter) { filterBtn.click(); } else { myGlobe.pointsData(allFlights); } }).catch(error => console.error("[CLIENT] Error fetching all flights data:", error));
};

// --- INITIALIZATION ---
// This is the entry point of our application.
fetch('/airports.json')
    .then(res => {
        if (!res.ok) {
            throw new Error(`Failed to load airports.json. Status: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        // The new data source is an object of objects, so we get its values.
        const airportDataArray = Object.values(data);
        airportLookup = new Map(airportDataArray.map(airport => [airport.icao, airport]));
        initializeGlobe(); // Initialize the globe only after airport data is loaded
    })
    .catch(error => {
        console.error(error);
        globeContainer.innerHTML = `<div style="text-align: center; padding: 50px; color: white; background: #0f202b;">
            <h2>CRITICAL ERROR</h2>
            <p>Could not load essential airport data (airports.json).</p>
        </div>`;
    });