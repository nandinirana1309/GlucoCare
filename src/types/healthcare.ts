/**
 * GlucoCare - healthcare finder types (Stage 5)
 * Data comes from OpenStreetMap (Nominatim + Overpass). No API key.
 */

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

export type FacilityCategory =
  | "Hospital"
  | "Clinic"
  | "Doctor"
  | "Pharmacy"
  | "Healthcare facility";

export interface Facility {
  id: string;
  name: string;
  category: FacilityCategory;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  phone?: string;
  /** Link to the facility on openstreetmap.org. */
  osmUrl: string;
  /** True if the OSM record has no name (shown as "Unnamed ..."). */
  unnamed: boolean;
}

export type HealthcareSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty"; origin: GeoPoint }
  | { status: "done"; origin: GeoPoint; facilities: Facility[] };
