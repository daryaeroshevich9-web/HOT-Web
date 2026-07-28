// js/context-builder.js
import { loadJSON } from './utils.js';

// Кеш для таблицы интенсивности и мета-данных
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

/**
 * Определяет интенсивность снегопада по полной таблице (TABLE 1)
 * Учитывает видимость, температуру и время суток.
 * Возвращает: "Very Light", "Light", "Moderate", "Heavy" или "No snow in METAR"
 */
export async function getSnowIntensity(events, temperature, visibility, dayNight) {
  // Проверяем наличие снега (SN, SG, GS)
  const snowCodes = ['SN', 'SG', 'GS'];
  const hasSnow = events.some(e => snowCodes.some(s => e.includes(s)));
  if (!hasSnow) {
    return 'No snow in METAR';
  }

  // Определяем видимость
  let vis;
  if (visibility === 'CAVOK') {
    vis = 9999;
  } else if (typeof visibility === 'number') {
    vis = visibility;
  } else {
    // Если видимость не удалось определить — возвращаем Moderate как компромисс
    return 'Moderate';
  }

  // Загружаем таблицу интенсивности
  const table = await loadSnowIntensityTable();
  const isCold = temperature <= -1;
  const isNight = dayNight === 'Night';

  // Ищем подходящий диапазон видимости
  for (const range of table.ranges) {
    if (vis >= range.min && vis <= range.max) {
      if (isNight) {
        return isCold ? range.night_cold : range.night_warm;
      } else {
        return isCold ? range.day_cold : range.day_warm;
      }
    }
  }

  // Если диапазон не найден — возвращаем Moderate как fallback
  return 'Moderate';
}

/**
 * Построение контекста: флаги и интенсивность
 */
export async function buildContext(events, temperature, visibility, dayNight) {
  const meta = await loadMetarEvents();
  const snowCodes = ['SN', 'SG', 'GS'];
  const obscurationCodes = ['FG', 'BR', 'SA', 'DU', 'HZ', 'FU', 'VA'];
  const fzfgCodes = ['FZFG', 'FZBR'];
  const note6Triggers = ['SNRA', 'SNDZ', 'RASN', 'DZSN'];

  // Интенсивность снега (асинхронно)
  const intensity = await getSnowIntensity(events, temperature, visibility, dayNight);

  // Флаги
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
