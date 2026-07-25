// js/metar-parser.js

/**
 * Парсит METAR-строку, используя список разрешённых событий из metar_events.json
 * @param {string} metar - строка METAR
 * @param {string[]} allowedEvents - массив допустимых кодов из metar_events.json
 */
export function parseMetar(metar, allowedEvents = []) {
  const raw = metar.trim();

  // 1. ICAO (четыре заглавные буквы)
  const icaoMatch = raw.match(/\b([A-Z]{4})\b/);
  const icao = icaoMatch ? icaoMatch[1] : null;

  // 2. Температура
  const tempMatch = raw.match(/(M?\d{2})\/(M?\d{2})/);
  let temperature = null;
  if (tempMatch) {
    let tempStr = tempMatch[1];
    if (tempStr.startsWith('M')) tempStr = '-' + tempStr.slice(1);
    temperature = parseInt(tempStr, 10);
    if (isNaN(temperature)) temperature = null;
  }

  // 3. Видимость
  let visibility = null;
  if (raw.includes('CAVOK')) {
    visibility = 'CAVOK';
  } else {
    const visMatch = raw.match(/\b(\d{4})\b/);
    if (visMatch) visibility = parseInt(visMatch[1], 10);
  }

  // 4. События: извлекаем все токены [+-]?[A-Z]{2,5}
  const eventRegex = /([+-]?[A-Z]{2,5})/g;
  const allMatches = [...raw.matchAll(eventRegex)].map(m => m[1]);

  // Исключаем заведомо не-события
  const exclude = ['VRB', 'NOSIG', 'CAVOK', 'FEW', 'SCT', 'BKN', 'OVC', 'NSC', 'SKC', 'MPS', 'KPH'];
  const candidates = allMatches.filter(code => !exclude.includes(code));

  // Фильтруем по разрешённому списку, используя гибкое сравнение
  let events = candidates;
  if (allowedEvents && allowedEvents.length > 0) {
    events = candidates.filter(code => 
      allowedEvents.some(ae => code.includes(ae) || ae.includes(code))
    );
  }

  return { icao, temperature, visibility, events, raw };
}
