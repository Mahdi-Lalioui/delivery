import { expect, test } from "vitest";
import {
  buildCasbahScene,
  canRunHero3d,
  heroDevicePixelRatio,
  sceneTime,
} from "../src/marketing/casbah-scene";

test("[M8-1] builds the same procedural scene for the same seed", () => {
  const first = buildCasbahScene(7);
  const second = buildCasbahScene(7);
  expect(second).toEqual(first);
  expect(buildCasbahScene(8).houses[0]).not.toEqual(first.houses[0]);
});

test("[M8-1] keeps DESIGN 8.1 budgets: 1 500–2 500 houses, a few domes, one tower, a roof-top trail", () => {
  const scene = buildCasbahScene(7);
  expect(scene.houses.length).toBeGreaterThanOrEqual(1500);
  expect(scene.houses.length).toBeLessThanOrEqual(2500);
  expect(scene.domes.length).toBeGreaterThanOrEqual(3);
  expect(scene.domes.length).toBeLessThanOrEqual(6);
  expect(scene.tower.height).toBeGreaterThan(scene.tower.radius * 6);
  expect(scene.trail.length).toBeGreaterThanOrEqual(4);
  for (const house of scene.houses) {
    expect(house.width).toBeGreaterThanOrEqual(0.8);
    expect(house.width).toBeLessThanOrEqual(1.6);
    expect(Math.abs(house.rotation)).toBeLessThanOrEqual(0.15);
    expect(house.tone).toBeGreaterThanOrEqual(0.88);
    expect(house.tone).toBeLessThanOrEqual(1);
    expect(house.lightAt).toBeGreaterThanOrEqual(0);
    expect(house.lightAt).toBeLessThan(1);
  }
});

test("[M8-1] the trail runs above the roofs from the kitchen to the home", () => {
  const scene = buildCasbahScene(7);
  const [start] = scene.trail;
  const end = scene.trail.at(-1);
  expect(start).toEqual(scene.kitchen);
  expect(end).toEqual(scene.home);
  const roofTop = Math.max(...scene.houses.map((house) => house.y + house.height));
  const middle = scene.trail[Math.floor(scene.trail.length / 2)];
  expect(middle?.y).toBeGreaterThan(roofTop * 0.5);
});

test("[M8-1] gates the 3D hero on capability, data saving and reduced motion", () => {
  const capable = {
    hasWebgl2: true,
    deviceMemoryGb: 8,
    cores: 8,
    isSaveData: false,
    isReducedMotion: false,
  };
  expect(canRunHero3d(capable)).toBe(true);
  expect(canRunHero3d({ ...capable, deviceMemoryGb: undefined })).toBe(true);
  expect(canRunHero3d({ ...capable, hasWebgl2: false })).toBe(false);
  expect(canRunHero3d({ ...capable, deviceMemoryGb: 2 })).toBe(false);
  expect(canRunHero3d({ ...capable, cores: 2 })).toBe(false);
  expect(canRunHero3d({ ...capable, isSaveData: true })).toBe(false);
  expect(canRunHero3d({ ...capable, isReducedMotion: true })).toBe(false);
});

test("[M8-1] caps the device pixel ratio at 1.25 on mobile and 1.75 on desktop", () => {
  expect(heroDevicePixelRatio({ devicePixelRatio: 3, isMobile: true })).toBe(1.25);
  expect(heroDevicePixelRatio({ devicePixelRatio: 3, isMobile: false })).toBe(1.75);
  expect(heroDevicePixelRatio({ devicePixelRatio: 1, isMobile: false })).toBe(1);
});

test("[M8-1] scroll scrubs from golden hour to blue hour and lights windows on the way", () => {
  expect(sceneTime(0)).toEqual({ dusk: 0, litShare: 0 });
  expect(sceneTime(1)).toEqual({ dusk: 1, litShare: 0.85 });
  expect(sceneTime(-3).dusk).toBe(0);
  expect(sceneTime(0.5).litShare).toBeGreaterThan(0);
  expect(sceneTime(0.5).litShare).toBeLessThan(0.85);
});
