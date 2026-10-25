/**
 * GlucoCare - healthcare finder service (Stage 5)
 * -------------------------------------------------------------
 * Real data from OpenStreetMap. No API key, no billing.
 *   1. geocodeLocality()  -> turn "Vellore" into coordinates (Nominatim, then
 *                            Photon as a fallback)
 *   2. findFacilities()    -> find hospitals / clinics / doctors nearby
 *                            (Overpass API - several public servers are tried
 *                            in turn because any single one is often overloaded)
 *
 * Notes:
 *   - Public Overpass servers frequently return 429/504 or time out. This
 *     module tries a list of them and only fails if every one fails.
 *   - Results depend on what volunteers have mapped, so some places may be
 *     missing or lack a phone number. Always show
 *     "(c) OpenStreetMap contributors".
 */

import type {
  Facility,
  FacilityCategory,
  GeoPoint,
} from "../types/healthcare";

/* ------------------------------------------------------------------ */
/*  low-level fetch with timeout                                       */
/* ------------------------------------------------------------------ */

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  1. geocoding                                                       */
/* ------------------------------------------------------------------ */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const PHOTON = "https://photon.komoot.io/api/";

async function geocodeNominatim(query: string): Promise<GeoPoint | null> {
  try {
    const url = `${NOMINATIM}?format=jsonv2&addressdetails=0&limit=1&q=${encodeURIComponent(
      query,
    )}`;
    const res = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/json" } },
      12000,
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!rows.length) return null;
    return {
      lat: parseFloat(rows[0].lat),
      lon: parseFloat(rows[0].lon),
      label: rows[0].display_name,
    };
  } catch {
    return null;
  }
}

async function geocodePhoton(query: string): Promise<GeoPoint | null> {
  try {
    const url = `${PHOTON}?limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/json" } },
      12000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: Record<string, string>;
      }>;
    };
    const f = data.features?.[0];
    if (!f) return null;
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties;
    const label = [p.name, p.city, p.state, p.country].filter(Boolean).join(", ");
    return { lat, lon, label: label || query };
  } catch {
    return null;
  }
}

export async function geocodeLocality(query: string): Promise<GeoPoint> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Please enter a city or locality.");
  }

  const hit =
    (await geocodeNominatim(trimmed)) ?? (await geocodePhoton(trimmed));

  if (!hit) {
    throw new Error(
      `Could not find "${trimmed}". Try adding a district, state or country ` +
        `(for example "Velachery, Chennai, India").`,
    );
  }
  return hit;
}

/* ------------------------------------------------------------------ */
/*  2. nearby facilities (Overpass)                                    */
/* ------------------------------------------------------------------ */

/** Public Overpass endpoints, tried in order. All send permissive CORS. */
const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function categorise(tags: Record<string, string>): FacilityCategory {
  const amenity = tags.amenity;
  const healthcare = tags.healthcare;
  if (amenity === "hospital" || healthcare === "hospital") return "Hospital";
  if (amenity === "clinic" || healthcare === "clinic") return "Clinic";
  if (amenity === "doctors" || healthcare === "doctor") return "Doctor";
  if (amenity === "pharmacy" || healthcare === "pharmacy") return "Pharmacy";
  return "Healthcare facility";
}

function buildAddress(tags: Record<string, string>): string | undefined {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
    tags["addr:state"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function overpassQuery(lat: number, lon: number, radiusM: number): string {
  return `[out:json][timeout:20];
(
  nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](around:${radiusM},${lat},${lon});
  nwr["healthcare"~"^(hospital|clinic|doctor|centre|pharmacy)$"](around:${radiusM},${lat},${lon});
);
out center tags 60;`;
}

/** HTTP statuses meaning "busy, try again shortly" (Overpass asks clients to back off). */
const BUSY = new Set([429, 502, 503, 504]);
const RETRY_DELAY_MS = 3000;

/**
 * POST the query to each endpoint until one returns valid JSON. If every
 * server failed and at least one said it was busy, wait briefly and try the
 * list once more (Overpass recommends retrying with a back-off).
 */
async function runOverpass(query: string): Promise<OverpassElement[]> {
  let lastReason = "";

  for (let round = 0; round < 2; round++) {
    let sawBusy = false;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `data=${encodeURIComponent(query)}`,
          },
          20000,
        );

        if (!res.ok) {
          lastReason = `server ${res.status}`;
          if (BUSY.has(res.status)) sawBusy = true;
          continue;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("json")) {
          lastReason = "non-JSON response";
          continue;
        }

        const payload = (await res.json()) as { elements?: OverpassElement[] };
        if (!Array.isArray(payload.elements)) {
          lastReason = "unexpected response shape";
          continue;
        }
        return payload.elements;
      } catch (error) {
        lastReason =
          error instanceof DOMException && error.name === "AbortError"
            ? "timed out"
            : "network error";
      }
    }
    if (!sawBusy || round === 1) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  throw new Error(
    `The facility search service is busy right now (${lastReason}). ` +
      `Please try again in a minute.`,
  );
}

function toFacilities(
  elements: OverpassElement[],
  origin: GeoPoint,
): Facility[] {
  const seen = new Set<string>();
  const facilities: Facility[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;

    const name = tags.name ?? tags["name:en"] ?? "";
    const key = `${name}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    facilities.push({
      id: `${el.type}/${el.id}`,
      name: name || `Unnamed ${categorise(tags).toLowerCase()}`,
      category: categorise(tags),
      lat,
      lon,
      distanceKm:
        Math.round(haversineKm(origin.lat, origin.lon, lat, lon) * 10) / 10,
      address: buildAddress(tags),
      phone: tags.phone ?? tags["contact:phone"],
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      unnamed: !name,
    });
  }

  facilities.sort((a, b) => a.distanceKm - b.distanceKm);
  return facilities.slice(0, 24);
}

export async function findFacilities(origin: GeoPoint): Promise<Facility[]> {
  // First pass: 7 km.
  let elements = await runOverpass(overpassQuery(origin.lat, origin.lon, 7000));
  let facilities = toFacilities(elements, origin);

  // Nothing mapped nearby -> widen the search once to 15 km.
  if (facilities.length === 0) {
    elements = await runOverpass(overpassQuery(origin.lat, origin.lon, 15000));
    facilities = toFacilities(elements, origin);
  }

  return facilities;
}
