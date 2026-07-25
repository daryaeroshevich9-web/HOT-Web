// js/utils.js

// Кеш для загруженных JSON
const cache = new Map();

/**
 * Загружает JSON по URL с кешированием
 */
export async function loadJSON(url) {
  if (cache.has(url)) {
    return cache.get(url);
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    cache.set(url, data);
    return data;
  } catch (err) {
    console.error(`Ошибка загрузки ${url}:`, err);
    throw err;
  }
}

/**
 * Поиск температуры в temperature_bands
 * Возвращает индекс подходящего диапазона или null
 */
export function findTemperatureIndex(temperature, bands) {
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    if (temperature >= band.min_inclusive && temperature < band.max_exclusive) {
      return i;
    }
  }
  return null;
}

/**
 * Проверка, входит ли событие в группу (event_index)
 * Событие может содержать код, например, "-SN" или "SN"
 */
export function eventMatchesGroup(event, group) {
  return group.some(code => event.includes(code));
}

/**
 * Получение первого подходящего индекса события по event_index
 */
export function findEventIndex(events, eventIndex) {
  for (let i = 0; i < eventIndex.length; i++) {
    const group = eventIndex[i];
    if (events.some(e => eventMatchesGroup(e, group))) {
      return i;
    }
  }
  return null;
}
