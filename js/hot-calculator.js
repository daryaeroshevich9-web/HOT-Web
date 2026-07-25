// js/hot-calculator.js
import { loadJSON, findTemperatureIndex, findEventIndex } from './utils.js';
import { buildContext } from './context-builder.js';
import { applyRules } from './rule-engine.js';

// Кеш для загруженных таблиц
const tableCache = new Map();

async function loadTable(fluidType) {
  const url = `data/tables/${fluidType}.json`;
  if (tableCache.has(url)) return tableCache.get(url);
  const data = await loadJSON(url);
  tableCache.set(url, data);
  return data;
}

/**
 * Основная функция расчёта HOT и AT
 * @param {string} fluidType - идентификатор жидкости (например, 'type_i', 'active_frost')
 * @param {number} temperature - OAT
 * @param {string} intensity - интенсивность (из контекста)
 * @param {object} context - объект с флагами (из context-builder)
 * @param {array} events - массив событий METAR
 * @param {string} dayNight - 'Day' или 'Night'
 * @param {string} [tableType] - 'hot' или 'allowance_pg' или 'allowance_eg'
 * @returns {Promise<object>} { hot, at_pg, at_eg, warnings }
 */
export async function calculateHOT(fluidType, temperature, intensity, context, events, dayNight, tableType = 'hot') {
  // Определяем, какой файл загружать
  let fileId = fluidType;
  if (tableType !== 'hot') {
    fileId = tableType; // 'allowance_pg' или 'allowance_eg'
  }

  const tableData = await loadTable(fileId);
  const { temperature_bands, table, event_index, event_index_rules, rules } = tableData;

  // 1. Находим температурный индекс
  const tempIndex = findTemperatureIndex(temperature, temperature_bands);
  if (tempIndex === null) {
    return { hot: 'CAUTION: No holdover time guidelines exist', at_pg: null, at_eg: null, warnings: [] };
  }

  // 2. Строим контекст для движка правил
  const ruleContext = {
    temp: temperature,
    intensity: intensity,
    event_index: null, // пока неизвестен
    ...context
  };

  // 3. Применяем event_index_rules (переопределение индекса)
  let eventIndex = null;
  let result = null;

  if (event_index_rules && event_index_rules.length > 0) {
    const ruleResult = applyRules(event_index_rules, ruleContext, events);
    if (ruleResult.matched) {
      if (ruleResult.result !== null) {
        // Правило вернуло готовый результат
        result = ruleResult.result;
      } else if (ruleResult.event_index_override !== null) {
        eventIndex = ruleResult.event_index_override;
      }
    }
  }

  // Если индекс не определён правилами, ищем по event_index
  if (eventIndex === null && result === null) {
    if (event_index && event_index.length > 0) {
      eventIndex = findEventIndex(events, event_index);
    }
  }

  // Если всё ещё null – нет подходящего столбца
  if (eventIndex === null && result === null) {
    result = 'CAUTION: No holdover time guidelines exist';
  }

  // 4. Если результат уже есть, возвращаем его
  if (result !== null) {
    return { hot: result, at_pg: null, at_eg: null, warnings: [] };
  }

  // 5. Применяем основные rules (могут переопределить индекс или вернуть результат)
  if (rules && rules.length > 0) {
    ruleContext.event_index = eventIndex; // теперь индекс известен
    const ruleResult = applyRules(rules, ruleContext, events);
    if (ruleResult.matched) {
      if (ruleResult.result !== null) {
        result = ruleResult.result;
      } else if (ruleResult.event_index_override !== null) {
        eventIndex = ruleResult.event_index_override;
      }
    }
  }

  if (result !== null) {
    return { hot: result, at_pg: null, at_eg: null, warnings: [] };
  }

  // 6. Извлекаем значение из таблицы
  const row = table[tempIndex];
  if (!row || eventIndex >= row.length) {
    // Нет данных для этого индекса
    result = 'CAUTION: No holdover time guidelines exist';
  } else {
    const cell = row[eventIndex];
    if (cell === null || cell === undefined) {
      result = 'CAUTION: No holdover time guidelines exist';
    } else if (typeof cell === 'object') {
      // Это объект с концентрациями (для HOT)
      // Для AT это строка, а не объект
      // Проверяем, есть ли ключи концентраций
      if (cell['100/0'] !== undefined) {
        // Формируем объект для вывода всех концентраций
        result = cell;
      } else {
        // Это строка (для AT)
        result = cell;
      }
    } else {
      // Простая строка
      result = cell;
    }
  }

  // 7. Если результат — объект с концентрациями, оставляем как есть
  // Для AT результат — строка
  return { hot: result, at_pg: null, at_eg: null, warnings: [] };
}

/**
 * Упрощённая обёртка для расчёта AT (вызывается отдельно)
 */
export async function calculateAT(fluidType, temperature, intensity, context, events, dayNight, atType) {
  // atType: 'allowance_pg' или 'allowance_eg'
  return await calculateHOT(fluidType, temperature, intensity, context, events, dayNight, atType);
}
