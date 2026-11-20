export function courierSample(courier, { iteration, drivers, rate, startTime }) {
  const sample = Math.floor(iteration / drivers);
  // Drive 150 m along the fixture street, then return in the same 30 m steps.
  const leg = sample % 10;
  const metres = 30 * Math.min(leg, 10 - leg);
  const bearing = ((courier.heading ?? 0) * Math.PI) / 180;
  const longitudeScale = Math.cos((courier.latitude * Math.PI) / 180);
  const returning = sample > 0 && (leg === 0 || leg > 5);
  return {
    latitude: courier.latitude + (metres * Math.cos(bearing)) / 111_320,
    longitude: courier.longitude + (metres * Math.sin(bearing)) / (111_320 * longitudeScale),
    accuracyM: courier.accuracyM,
    // The simulated GPS clock follows the schedule even if request dispatch jitters.
    capturedAt: new Date(startTime + (iteration * 1000) / rate - 1000).toISOString(),
    ...(courier.heading === undefined
      ? {}
      : { heading: (courier.heading + (returning ? 180 : 0)) % 360 }),
  };
}
