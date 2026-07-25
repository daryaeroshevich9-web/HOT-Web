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

  if (event_index_rules && event_index_rules.length > 0) {
    const ruleResult = applyRules(event_index_rules, ruleContext, events);
    if (ruleResult.matched) {
      if (ruleResult.result !== null) {
        // Если результат содержит "CAUTION" или ":", считаем его финальным
        const resultStr = ruleResult.result;
        if (resultStr.includes('CAUTION') || resultStr.includes(':')) {
          return { hot: resultStr, at_pg: null, at_eg: null, warnings: [] };
        } else {
          // Иначе это специальный ключ (например, "SNOWFALL INTENSITIES")
          eventIndex = resultStr;
        }
      } else if (ruleResult.event_index_override !== null) {
        eventIndex = ruleResult.event_index_override;
      }
    }
  }

  // Если индекс не определён правилами, ищем по event_index
  if (eventIndex === null) {
    if (event_index && event_index.length > 0) {
      const foundIndex = findEventIndex(events, event_index);
      if (foundIndex !== null) {
        eventIndex = foundIndex;
      }
    }
  }

  // Если всё ещё null – нет подходящего столбца
  if (eventIndex === null) {
    return { hot: 'CAUTION: No holdover time guidelines exist', at_pg: null, at_eg: null, warnings: [] };
  }

  // 4. Применяем основные rules
  if (rules && rules.length > 0) {
    // Передаём текущий eventIndex в контекст (может быть строкой)
    ruleContext.event_index = eventIndex;
    const ruleResult2 = applyRules(rules, ruleContext, events);
    if (ruleResult2.matched) {
      if (ruleResult2.result !== null) {
        finalResult = ruleResult2.result;
      } else if (ruleResult2.event_index_override !== null) {
        // Если правила переопределили индекс, обновляем его
        eventIndex = ruleResult2.event_index_override;
      }
    }
  }

  if (finalResult !== null) {
    return { hot: finalResult, at_pg: null, at_eg: null, warnings: [] };
  }

  // 5. Извлекаем значение из таблицы
  // Убедимся, что eventIndex - число
  if (typeof eventIndex !== 'number') {
    // Если это строка (например, "SNOWFALL INTENSITIES") и правила не переопределили,
    // то данных нет
    return { hot: 'CAUTION: No holdover time guidelines exist', at_pg: null, at_eg: null, warnings: [] };
  }

  const row = table[tempIndex];
  let cellValue = null;
  if (row && eventIndex < row.length) {
    cellValue = row[eventIndex];
  }

  let result;
  if (cellValue === null || cellValue === undefined) {
    result = 'CAUTION: No holdover time guidelines exist';
  } else if (typeof cellValue === 'object') {
    result = cellValue;
  } else {
    result = cellValue;
  }

  return { hot: result, at_pg: null, at_eg: null, warnings: [] };
}

export async function calculateAT(fluidType, temperature, intensity, context, events, dayNight, atType) {
  return await calculateHOT(fluidType, temperature, intensity, context, events, dayNight, atType);
}
