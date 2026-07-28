// js/context-builder.js
import { loadJSON } from './utils.js';

let metarEvents = null;
let snowIntensityTable = null;

async function loadMetarEvents() {
  if (!metarEvents) {
    metarEvents = await loadJSON('data/config/metar_events.json');
  }
  return metarEvents;
}

async function loadSnowIntensityTable() {
  if (!snowIntensityTable) {
    snowIntensityTable = await loadJSON('data/config/snow_intensity.json');
  }
  return snowIntensityTable;
}

export async function getSnowIntensity(events, temperature, visibility, dayNight) {
  const snowCodes = ['SN', 'SG', 'GS'];
  const hasSnow = events.some(e => snowCodes.some(s => e.includes(s)));
  if (!hasSnow) {
    return 'No snow in METAR';
  }

  let vis;
  if (visibility === 'CAVOK') {
    vis = 9999;
  } else if (typeof visibility === 'number') {
    vis = visibility;
  } else {
    return 'Moderate';
  }

  const table = await loadSnowIntensityTable();
  const isCold = temperature <= -1;
  const isNight = dayNight === 'Night';

  for (const range of table.ranges) {
    if (vis >= range.min && vis <= range.max) {
      if (isNight) {
        return isCold ? range.night_cold : range.night_warm;
      } else {
        return isCold ? range.day_cold : range.day_warm;
      }
    }
  }
  return 'Moderate';
}

export async function buildContext(events, temperature, visibility, dayNight) {
  const meta = await loadMetarEvents();
  const snowCodes = ['SN', 'SG', 'GS'];
  const obscurationCodes = ['FG', 'BR', 'SA', 'DU', 'HZ', 'FU', 'VA'];
  const fzfgCodes = ['FZFG', 'FZBR'];
  const note6Triggers = ['SNRA', 'SNDZ', 'RASN', 'DZSN'];

  const intensity = await getSnowIntensity(events, temperature, visibility, dayNight);

  const snowfall = events.some(e => snowCodes.some(s => e.includes(s)));
  const heavy_snowfall = events.some(e => e.startsWith('+') && snowCodes.some(s => e.includes(s)));
  const light_snowfall = events.some(e => e.startsWith('-') && snowCodes.some(s => e.includes(s)));
  const has_ice_pellets = events.some(e => e.includes('PL'));
  const note_6 = events.some(e => note6Triggers.some(t => e.includes(t)));
  const snow_fzfg = events.some(e => e.includes('SNFZFG'));
  const snowfall_and_obscuration = snowfall && events.some(e => obscurationCodes.some(o => e.includes(o))) &&
                                    !events.some(e => fzfgCodes.some(f => e.includes(f)));

  return {
    intensity,
    snowfall,
    heavy_snowfall,
    light_snowfall,
    has_ice_pellets,
    note_6,
    snow_fzfg,
    snowfall_and_obscuration,
  };
}
