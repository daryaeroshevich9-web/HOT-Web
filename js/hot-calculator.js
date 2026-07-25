// js/hot-calculator.js
import { loadJSON, findTemperatureIndex, findEventIndex } from './utils.js';
import { applyRules } from './rule-engine.js';

const tableCache = new Map();

async function loadTable(fluidType) {
  const url = `data/tables/${fluidType}.json`;
  if (tableCache.has(url)) return tableCache.get(url);
  const data = await loadJSON(url);
  tableCache.set(url, data);
  return data;
}

/**
 * Основная функция расчёта HOT/AT
 */
export async function calculateHOT(fluidType, temperature, intensity, context, events, dayNight, tableType = 'hot') {
  let fileId = fluidType;
  if (tableType !== 'hot') {
    fileId = tableType;
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
    event_index: null,
    ...context
  };

  // 3. Применяем event_index_rules
  let eventIndex = null;
  let finalResult = null;
  let ruleResult = null;

  if (event_index_rules && event_index_rules.length > 0) {
    ruleResult = applyRules(event_index_rules, ruleContext, events);
    if (ruleResult.matched) {
      if (ruleResult.result !== null) {
        // Проверяем, является ли результат финальным (например, содержит "CAUTION" или время)
        const resultStr = ruleResult.result;
        // Если строка содержит "CAUTION" или ":" - скорее всего это финальный ответ
        if (resultStr.includes('CAUTION') || resultStr.includes(':')) {
          return { hot: resultStr, at_pg: null, at_eg: null, warnings: [] };
        } else {
          // Иначе это специальный ключ, который должен быть обработан основными правилами
          // Устанавливаем eventIndex в эту строку (как строковое значение)
          eventIndex = resultStr;
        }
      } else if (ruleResult.event_index_override !== null) {
        eventIndex = ruleResult.event_index_override;
      }
    }
  }

  // Если индекс не определён правилами, ищем по event_index
  if (eventIndex === null && finalResult === null) {
    if (event_index && event_index.length > 0) {
      const foundIndex = findEventIndex(events, event_index);
      if (foundIndex !== null) {
        eventIndex = foundIndex;
      }
    }
  }

  // Если всё ещё null – нет подходящего столбца
  if (eventIndex === null && finalResult === null) {
    return { hot: 'CAUTION: No holdover time guidelines exist', at_pg: null, at_eg: null, warnings: [] };
  }

  // 4. Применяем основные rules
  if (rules && rules.length > 0) {
    ruleContext.event_index = eventIndex;
    const ruleResult2 = applyRules(rules, ruleContext, events);
    if (ruleResult2.matched) {
      if (ruleResult2.result !== null) {
        finalResult = ruleResult2.result;
      } else if (ruleResult2.event_index_override !== null) {
        eventIndex = ruleResult2.event_index_override;
      }
    }
  }

  if (finalResult !== null) {
    return { hot: finalResult, at_pg: null, at_eg: null, warnings: [] };
  }

  // 5. Извлекаем значение из таблицы
  const row = table[tempIndex];
  let cellValue = null;
  if (row && typeof eventIndex === 'number' && eventIndex < row.length) {
    cellValue = row[eventIndex];
  } else if (row && typeof eventIndex === 'string') {
    // Если eventIndex - строка, возможно, это ключ для поиска (но в наших данных такого нет)
    // Пытаемся найти столбец с таким индексом? Нет, просто ошибка.
    return { hot: 'CAUTION: No holdover time guidelines exist', at_pg: null, at_eg: null, warnings: [] };
  }

  let result;
  if (cellValue === null || cellValue === undefined) {
    result = 'CAUTION: No holdover time guidelines exist';
  } else if (typeof cellValue === 'object') {
    // Объект с концентрациями
    result = cellValue;
  } else {
    result = cellValue;
  }

  return { hot: result, at_pg: null, at_eg: null, warnings: [] };
}

export async function calculateAT(fluidType, temperature, intensity, context, events, dayNight, atType) {
  return await calculateHOT(fluidType, temperature, intensity, context, events, dayNight, atType);
}
