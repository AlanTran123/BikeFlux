import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// ============================================================
// MAPBOX
// ============================================================

mapboxgl.accessToken =
    'pk.eyJ1IjoiYWx0MDQ5IiwiYSI6ImNtd2VmeWM3ODAzYzYyeHBxcWllNjg5a3cifQ.G_qtcptpYNUS6dN9RFHfNQ';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
});

// ============================================================
// DATA
// ============================================================

const STATIONS_URL =
    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

const TRIPS_URL =
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

const CAMBRIDGE_BIKE_LANES =
    'https://raw.githubusercontent.com/vis-society/labs/refs/heads/main/7/data/cambridge-bike-lanes.geojson';

// ============================================================
// SVG OVERLAY
// ============================================================

const svg = d3.select('#map').select('svg');

let stations = [];
let circles;

let departuresByMinute = Array.from(
    { length: 1440 },
    () => [],
);

let arrivalsByMinute = Array.from(
    { length: 1440 },
    () => [],
);

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getCoords(station) {
    const point = new mapboxgl.LngLat(
        +station.lon,
        +station.lat,
    );

    const { x, y } = map.project(point);

    return {
        cx: x,
        cy: y,
    };
}

function minutesSinceMidnight(date) {
    return (
        date.getHours() * 60 +
        date.getMinutes()
    );
}

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    const date = new Date();

    date.setHours(
        hours,
        mins,
        0,
        0,
    );

    return date.toLocaleTimeString(
        'en-US',
        {
            hour: 'numeric',
            minute: '2-digit',
        },
    );
}

// ============================================================
// FILTER TRIPS BY TIME
// ============================================================

function filterByMinute(
    tripsByMinute,
    minute,
) {
    if (minute === -1) {
        return tripsByMinute.flat();
    }

    const result = [];

    for (
        let offset = -60;
        offset <= 60;
        offset++
    ) {
        const index =
            (minute + offset + 1440) %
            1440;

        result.push(
            ...tripsByMinute[index],
        );
    }

    return result;
}

// ============================================================
// COMPUTE TRAFFIC AT EACH STATION
// ============================================================

function computeStationTraffic(
    stationsGiven,
    timeFilter = -1,
) {
    const departures = d3.rollup(
        filterByMinute(
            departuresByMinute,
            timeFilter,
        ),
        (v) => v.length,
        (d) => d.start_station_id,
    );

    const arrivals = d3.rollup(
        filterByMinute(
            arrivalsByMinute,
            timeFilter,
        ),
        (v) => v.length,
        (d) => d.end_station_id,
    );

    return stationsGiven.map(
        (station) => {
            const id =
                station.short_name;

            station.departures =
                departures.get(id) ?? 0;

            station.arrivals =
                arrivals.get(id) ?? 0;

            station.totalTraffic =
                station.departures +
                station.arrivals;

            return station;
        },
    );
}

// ============================================================
// POSITION CIRCLES ON MAP
// ============================================================

function updatePositions() {
    if (!circles) {
        return;
    }

    circles
        .attr(
            'cx',
            (d) => getCoords(d).cx,
        )
        .attr(
            'cy',
            (d) => getCoords(d).cy,
        );
}

// ============================================================
// MAP LOAD
// ============================================================

map.on('load', async () => {

    // ========================================================
    // BOSTON BIKE LANES
    // ========================================================

    map.addSource(
        'boston-bike-lanes',
        {
            type: 'geojson',
            data:
                'https://dsc106.com/labs/lab07/data/boston-bike-lanes.geojson',
        },
    );

    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston-bike-lanes',

        paint: {
            'line-color': '#32D400',
            'line-width': 3,
            'line-opacity': 0.5,
        },
    });

    // ========================================================
    // CAMBRIDGE BIKE LANES
    // ========================================================

    map.addSource(
        'cambridge-bike-lanes',
        {
            type: 'geojson',
            data: CAMBRIDGE_BIKE_LANES,
        },
    );

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge-bike-lanes',

        paint: {
            'line-color': '#32D400',
            'line-width': 3,
            'line-opacity': 0.5,
        },
    });

    // ========================================================
    // LOAD STATIONS
    // ========================================================

    const stationData =
        await d3.json(
            STATIONS_URL,
        );

    stations =
        stationData.data.stations;

    // ========================================================
    // LOAD TRIPS
    // ========================================================

    const trips =
        await d3.csv(
            TRIPS_URL,
            (trip) => {

                trip.started_at =
                    new Date(
                        trip.started_at,
                    );

                trip.ended_at =
                    new Date(
                        trip.ended_at,
                    );

                const departureMinute =
                    minutesSinceMidnight(
                        trip.started_at,
                    );

                const arrivalMinute =
                    minutesSinceMidnight(
                        trip.ended_at,
                    );

                departuresByMinute[
                    departureMinute
                ].push(trip);

                arrivalsByMinute[
                    arrivalMinute
                ].push(trip);

                return trip;
            },
        );

    console.log(
        `${trips.length} trips loaded`,
    );

    // ========================================================
    // INITIAL TRAFFIC
    // ========================================================

    computeStationTraffic(
        stations,
    );

    // ========================================================
    // RADIUS SCALE
    // ========================================================

    const maxTraffic =
        d3.max(
            stations,
            (d) => d.totalTraffic,
        );

    const radiusScale =
        d3.scaleSqrt()
            .domain([
                0,
                maxTraffic,
            ])
            .range([
                0,
                25,
            ]);

    // ========================================================
    // CREATE STATION CIRCLES
    // ========================================================

    circles = svg
        .selectAll('circle')
        .data(
            stations,
            (d) => d.short_name,
        )
        .join('circle')

        .attr(
            'r',
            (d) =>
                radiusScale(
                    d.totalTraffic,
                ),
        )

        .style(
            '--departure-ratio',
            (d) => {
                if (
                    d.totalTraffic === 0
                ) {
                    return 0.5;
                }

                return (
                    d.departures /
                    d.totalTraffic
                );
            },
        );

    // ========================================================
    // TOOLTIPS
    // ========================================================

    circles
        .append('title')
        .text(
            (d) =>
                `${d.name}
Total traffic: ${d.totalTraffic}
Departures: ${d.departures}
Arrivals: ${d.arrivals}`,
        );

    updatePositions();

    // ========================================================
    // KEEP CIRCLES ALIGNED WHILE MAP MOVES
    // ========================================================

    map.on(
        'move',
        updatePositions,
    );

    map.on(
        'zoom',
        updatePositions,
    );

    map.on(
        'resize',
        updatePositions,
    );

    // ========================================================
    // TIME SLIDER
    // ========================================================

    const timeSlider =
        document.querySelector(
            '#time-slider',
        );

    const selectedTime =
        document.querySelector(
            '#selected-time',
        );

    const anyTime =
        document.querySelector(
            '#any-time',
        );

    // ========================================================
    // UPDATE VISUALIZATION
    // ========================================================

    function updateVisualization(
        timeFilter,
    ) {
        computeStationTraffic(
            stations,
            timeFilter,
        );

        const currentMax =
            d3.max(
                stations,
                (d) =>
                    d.totalTraffic,
            ) || 1;

        const currentRadiusScale =
            d3.scaleSqrt()
                .domain([
                    0,
                    currentMax,
                ])
                .range(
                    timeFilter === -1
                        ? [0, 25]
                        : [0, 50],
                );

        circles
            .data(
                stations,
                (d) =>
                    d.short_name,
            )

            .attr(
                'r',
                (d) =>
                    currentRadiusScale(
                        d.totalTraffic,
                    ),
            )

            .style(
                '--departure-ratio',
                (d) => {
                    if (
                        d.totalTraffic ===
                        0
                    ) {
                        return 0.5;
                    }

                    return (
                        d.departures /
                        d.totalTraffic
                    );
                },
            );

        // Update tooltip information
        circles
            .select('title')
            .text(
                (d) =>
                    `${d.name}
Total traffic: ${d.totalTraffic}
Departures: ${d.departures}
Arrivals: ${d.arrivals}`,
            );

        updatePositions();
    }

    // ========================================================
    // SLIDER EVENT
    // ========================================================

    timeSlider.addEventListener(
        'input',
        (event) => {
            const time =
                Number(
                    event.target.value,
                );

            if (time === -1) {
                selectedTime.textContent =
                    '';

                anyTime.style.display =
                    'block';
            } else {
                selectedTime.textContent =
                    formatTime(time);

                anyTime.style.display =
                    'none';
            }

            updateVisualization(
                time,
            );
        },
    );
});