// js/context-builder.js
import { loadJSON } from './utils.js';

let metarEvents = null;

async function loadMetarEvents() {
  if (!metarEvents) {
    metarEvents = await loadJSON('data/config/metar_events.json');
  }
  return metarEvents;
}

/**
 * Определяет интенсивность снегопада по видимости (TABLE 1)
 * Возвращает: "Very Light", "Light", "Moderate", "Heavy" или "No snow in METAR"
 */
export function getSnowIntensity(events, temperature, visibility, dayNight) {
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

  // Уточнённые диапазоны интенсивности по видимости
  let intensity = 'Moderate';
  if (vis >= 9999) {
    intensity = 'Very Light';
  } else if (vis >= 5000) {
    intensity = 'Light';
  } else if (vis >= 2000) {
    intensity = 'Moderate';
  } else if (vis >= 800) {
    intensity = 'Moderate';   // ← для 800–2000 – Moderate, а не Heavy
  } else {
    intensity = 'Heavy';
  }
  return intensity;
}

export async function buildContext(events, temperature, visibility, dayNight) {
  const meta = await loadMetarEvents();
  const snowCodes = ['SN', 'SG', 'GS'];
  const obscurationCodes = ['FG', 'BR', 'SA', 'DU', 'HZ', 'FU', 'VA'];
  const fzfgCodes = ['FZFG', 'FZBR'];
  const note6Triggers = ['SNRA', 'SNDZ', 'RASN', 'DZSN'];

  const intensity = getSnowIntensity(events, temperature, visibility, dayNight);

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
