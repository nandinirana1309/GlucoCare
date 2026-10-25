import { describe, it, expect, vi, afterEach } from "vitest";
import { findFacilities } from "./healthcareService";

const ORIGIN = { lat: 12.9165, lon: 79.1325, label: "Vellore" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ELEMENTS = {
  elements: [
    { type: "node", id: 1, lat: 12.92, lon: 79.13, tags: { amenity: "hospital", name: "Test Hospital" } },
    { type: "node", id: 2, lat: 12.95, lon: 79.14, tags: { amenity: "pharmacy", name: "Test Pharmacy" } },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("findFacilities (Overpass)", () => {
  it("returns facilities sorted by distance from the first server that answers", async () => {
    const fetchSpy = vi.fn(async () => json(ELEMENTS));
    vi.stubGlobal("fetch", fetchSpy);
    const f = await findFacilities(ORIGIN);
    expect(f.map((x) => x.name)).toEqual(["Test Hospital", "Test Pharmacy"]);
    expect(f[0].category).toBe("Hospital");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("when every server is busy, waits and tries the list once more", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls <= 3 ? new Response("at capacity", { status: 502 }) : json(ELEMENTS))));
    const pending = findFacilities(ORIGIN);
    await vi.advanceTimersByTimeAsync(3000);
    const f = await pending;
    expect(f).toHaveLength(2);
    expect(calls).toBe(4); // 3 busy servers, then success on the retry round
  });

  it("does not retry for errors that are not 'busy', and explains the failure", async () => {
    const fetchSpy = vi.fn(async () => new Response("bad query", { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(findFacilities(ORIGIN)).rejects.toThrow(/busy right now \(server 400\)/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retry round if servers stay busy", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => new Response("busy", { status: 504 }));
    vi.stubGlobal("fetch", fetchSpy);
    const pending = findFacilities(ORIGIN).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(3000);
    expect(String(await pending)).toMatch(/busy right now/);
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });
});
