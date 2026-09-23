'use strict';
// Transport counters, not estimates of world coverage or scoring formulas.
const empty = () => ({ requested: 0, succeeded: 0, failed: 0, fullLogs: 0, baselineKnown: 0, possibleRollover: 0, observations: 0, newSinceLastSuccess: 0, invalidTime: 0, missingTags: 0, nonStandard: 0, statuses: {}, logSizes: {}, overlapBaselineKnown: 0, noOverlap: 0 });
function createTelemetry() { return { version: 2, groups: {} }; }
function group(telemetry, band) { return telemetry.groups[band] ||= empty(); }
function observeLog(telemetry, band, logs, previousOk, now, parseTime, previousNewest = null) {
  const g = group(telemetry, band); g.succeeded++; g.observations += logs.length; g.logSizes[logs.length]=(g.logSizes[logs.length]||0)+1;
  const times = [];
  for (const b of logs) {
    const t = parseTime(b?.battleTime); if (t > 0 && t <= now) times.push(t); else g.invalidTime++;
    if (!b?.team?.[0]?.tag || !b?.opponent?.[0]?.tag) g.missingTags++;
    if (b?.team?.length !== 1 || b?.opponent?.length !== 1 || b.team[0]?.cards?.length !== 8 || b.opponent[0]?.cards?.length !== 8) g.nonStandard++;
  }
  if (previousOk) { g.baselineKnown++; g.newSinceLastSuccess += times.filter(t=>t>previousOk).length; }
  const noOverlap = previousNewest && times.length===logs.length && times.length>0 && Math.min(...times)>previousNewest;
  if(previousNewest){g.overlapBaselineKnown++;if(noOverlap)g.noOverlap++;}
  // fullLogs is a legacy >=25 counter, not a claim that the API has a fixed limit of 25.
  if (logs.length >= 25) {
    g.fullLogs++;
    if (!previousNewest && previousOk && times.length === logs.length && Math.min(...times) > previousOk) g.possibleRollover++;
  }
  if(noOverlap)g.possibleRollover++;
  return (logs.length >= 25 || noOverlap) && times.length === logs.length ? Math.max(1, now-Math.min(...times)) : null;
}
module.exports = { createTelemetry, group, observeLog };
