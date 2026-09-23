'use strict';
// Transport counters, not estimates of world coverage or scoring formulas.
const empty = () => ({ requested: 0, succeeded: 0, failed: 0, fullLogs: 0, baselineKnown: 0, possibleRollover: 0, observations: 0, newSinceLastSuccess: 0, invalidTime: 0, missingTags: 0, nonStandard: 0, statuses: {} });
function createTelemetry() { return { version: 2, groups: {} }; }
function group(telemetry, band) { return telemetry.groups[band] ||= empty(); }
function observeLog(telemetry, band, logs, previousOk, now, parseTime) {
  const g = group(telemetry, band); g.succeeded++; g.observations += logs.length;
  const times = [];
  for (const b of logs) {
    const t = parseTime(b?.battleTime); if (t > 0 && t <= now) times.push(t); else g.invalidTime++;
    if (!b?.team?.[0]?.tag || !b?.opponent?.[0]?.tag) g.missingTags++;
    if (b?.team?.length !== 1 || b?.opponent?.length !== 1 || b.team[0]?.cards?.length !== 8 || b.opponent[0]?.cards?.length !== 8) g.nonStandard++;
  }
  if (previousOk) { g.baselineKnown++; g.newSinceLastSuccess += times.filter(t=>t>previousOk).length; }
  if (logs.length >= 25) {
    g.fullLogs++;
    if (previousOk && times.length === logs.length && Math.min(...times) > previousOk) g.possibleRollover++;
  }
  return logs.length >= 25 && times.length === logs.length ? Math.max(1, now-Math.min(...times)) : null;
}
module.exports = { createTelemetry, group, observeLog };
