/**
 * GlucoCare - healthcare finder service (Stage 5)
 * -------------------------------------------------------------
 * Real data from OpenStreetMap. No API key, no billing.
 *   1. geocodeLocality()  -> Nominatim turns "Vellore" into coordinates
 *   2. findFacilities()    -> Overpass finds hospitals / clinics / doctors nearby
 *
 * Usage notes / limits (fine for a student project, not for heavy traffic):
 *   - Nominatim asks for <= 1 request/second and a valid Referer (the browser
 *     sends this automatically).
 *   - Results depend on what volunteers have mapped in that area, so some
 *     places may be missing or lack a phone number.
 *   - Always show "(c) OpenStreetMap contributors".
 */

import type {
  Facility,
  FacilityCategory,
  GeoPoint,
} from "../types/healthcare";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const SEARCH_RADIUS_M = 7000;

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

export async function geocodeLocality(query: string): Promise<GeoPoint> {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 15000);

  if (!response.ok) {
    throw new Error("Location lookup failed. Please try again in a moment.");
  }

  const rows = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (rows.length === 0) {
    throw new Error(`Could not find "${query}". Try adding a state or country.`);
  }

  return {
    lat: parseFloat(rows[0].lat),
    lon: parseFloat(rows[0].lon),
    label: rows[0].display_name,
  };
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
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
  if (amenity === "hospital") return "Hospital";
  if (amenity === "clinic") return "Clinic";
  if (amenity === "doctors") return "Doctor";
  if (amenity === "pharmacy") return "Pharmacy";
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

export async function findFacilities(origin: GeoPoint): Promise<Facility[]> {
  const q = `
    [out:json][timeout:25];
    (
      nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](around:${SEARCH_RADIUS_M},${origin.lat},${origin.lon});
      nwr["healthcare"](around:${SEARCH_RADIUS_M},${origin.lat},${origin.lon});
    );
    out center tags 60;
  `;

  const response = await fetchWithTimeout(
    OVERPASS,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(q)}`,
    },
    30000,
  );

  if (!response.ok) {
    throw new Error("The facility search service is busy. Please try again shortly.");
  }

  const payload = (await response.json()) as { elements: OverpassElement[] };

  const seen = new Set<string>();
  const facilities: Facility[] = [];

  for (const el of payload.elements) {
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
      distanceKm: Math.round(haversineKm(origin.lat, origin.lon, lat, lon) * 10) / 10,
      address: buildAddress(tags),
      phone: tags.phone ?? tags["contact:phone"],
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      unnamed: !name,
    });
  }

  facilities.sort((a, b) => a.distanceKm - b.distanceKm);
  return facilities.slice(0, 24);
}
