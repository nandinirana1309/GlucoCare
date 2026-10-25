import { describe, it, expect, vi, afterEach } from "vitest";
import { findFacilities, findFacilitiesViaPhoton } from "./healthcareService";

const ORIGIN = { lat: 12.9165, lon: 79.1325, label: "Vellore" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const OVERPASS = {
  elements: [
    { type: "node", id: 1, lat: 12.92, lon: 79.13, tags: { amenity: "hospital", name: "Test Hospital" } },
    { type: "node", id: 2, lat: 12.95, lon: 79.14, tags: { amenity: "pharmacy", name: "Test Pharmacy" } },
  ],
};

/** Photon answer for one category, including one place 150 km away. */
const photon = (value: string, name: string) => ({
  features: [
    { geometry: { coordinates: [79.1335, 12.92] }, properties: { osm_type: "W", osm_id: 77, osm_key: "amenity", osm_value: value, name, street: "Ida Scudder Road", city: "Vellore" } },
    { geometry: { coordinates: [77.59, 12.97] }, properties: { osm_type: "N", osm_id: 99, osm_key: "amenity", osm_value: value, name: `Far ${name}`, city: "Bengaluru" } },
  ],
});

const isPhoton = (url: string) => url.includes("photon.komoot.io");

afterEach(() => vi.unstubAllGlobals());

describe("findFacilities", () => {
  it("returns facilities sorted by distance from the first Overpass server that answers", async () => {
    const fetchSpy = vi.fn(async () => json(OVERPASS));
    vi.stubGlobal("fetch", fetchSpy);
    const f = await findFacilities(ORIGIN);
    expect(f.map((x) => x.name)).toEqual(["Test Hospital", "Test Pharmacy"]);
    expect(f[0].category).toBe("Hospital");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("tries the next Overpass server when one is busy", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls === 1 ? new Response("at capacity", { status: 504 }) : json(OVERPASS))));
    expect(await findFacilities(ORIGIN)).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it("when every Overpass server fails, uses the Photon backup (nearby results only)", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (!isPhoton(url)) return new Response("at capacity", { status: 502 });
      const kind = /osm_tag=amenity:(\w+)/.exec(url)![1];
      return json(photon(kind, `Test ${kind}`));
    });
    vi.stubGlobal("fetch", fetchSpy);
    const f = await findFacilities(ORIGIN);
    expect(f.map((x) => x.category).sort()).toEqual(["Clinic", "Doctor", "Hospital", "Pharmacy"]);
    expect(f.every((x) => x.distanceKm <= 15)).toBe(true); // the 150 km results are dropped
    expect(f.find((x) => x.category === "Hospital")).toMatchObject({
      name: "Test hospital",
      osmUrl: "https://www.openstreetmap.org/way/77",
      address: "Ida Scudder Road, Vellore",
    });
    expect(fetchSpy.mock.calls.filter(([u]) => !isPhoton(u as string))).toHaveLength(3); // all 3 Overpass servers tried first
  });

  it("explains the failure when Overpass AND the backup fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(findFacilities(ORIGIN)).rejects.toThrow(/busy right now \(server 503\)/);
  });

  it("an empty but successful Overpass answer is NOT replaced by the backup", async () => {
    const fetchSpy = vi.fn(async (url: string) => (isPhoton(url) ? json(photon("hospital", "x")) : json({ elements: [] })));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await findFacilities(ORIGIN)).toEqual([]);
    expect(fetchSpy.mock.calls.some(([u]) => isPhoton(u as string))).toBe(false);
  });
});

describe("findFacilitiesViaPhoton", () => {
  it("still returns what it can when some categories fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("hospital") ? json(photon("hospital", "Only hospital")) : new Response("x", { status: 500 }))));
    const f = await findFacilitiesViaPhoton(ORIGIN);
    expect(f.map((x) => x.name)).toEqual(["Only hospital"]);
  });
});
