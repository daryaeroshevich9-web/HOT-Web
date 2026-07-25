// js/rule-engine.js

/**
 * Проверяет, выполняется ли условие правила (объект when)
 * context: { temp, intensity, event_index, note_6, snowfall, ... }
 * events: массив строк METAR
 */
export function evaluateCondition(when, context, events) {
  for (const [key, value] of Object.entries(when)) {
    switch (key) {
      case 'temp_lt':
        if (!(context.temp < value)) return false;
        break;
      case 'temp_lte':
        if (!(context.temp <= value)) return false;
        break;
      case 'temp_gt':
        if (!(context.temp > value)) return false;
        break;
      case 'temp_gte':
        if (!(context.temp >= value)) return false;
        break;
      case 'intensity_eq':
        if (context.intensity !== value) return false;
        break;
      case 'intensity_in':
        if (!Array.isArray(value) || !value.includes(context.intensity)) return false;
        break;
      case 'event_index_eq':
        if (context.event_index !== value) return false;
        break;
      case 'event_index_in':
        if (!Array.isArray(value) || !value.includes(context.event_index)) return false;
        break;
      case 'note_6':
        if (context.note_6 !== value) return false;
        break;
      case 'snowfall':
        if (context.snowfall !== value) return false;
        break;
      case 'snow_fzfg':
        if (context.snow_fzfg !== value) return false;
        break;
      case 'heavy_snowfall':
        if (context.heavy_snowfall !== value) return false;
        break;
      case 'light_snowfall':
        if (context.light_snowfall !== value) return false;
        break;
      case 'has_ice_pellets':
        if (context.has_ice_pellets !== value) return false;
        break;
      case 'snowfall_and_obscuration':
        if (context.snowfall_and_obscuration !== value) return false;
        break;
      case 'events_list_has_any':
        if (!Array.isArray(value) || !value.some(v => events.some(e => e.includes(v)))) return false;
        break;
      case 'events_list_eq':
        if (!Array.isArray(value) || value.length !== events.length || !value.every(v => events.some(e => e.includes(v)))) return false;
        break;
      default:
        // Неизвестное условие — игнорируем
        console.warn('Неизвестное условие в правиле:', key);
        return false;
    }
  }
  return true;
}

/**
 * Применяет правила (массив) к контексту и событиям.
 * Возвращает: { result: string|null, event_index_override: number|null, matched: boolean }
 */
export function applyRules(rules, context, events) {
  // Сортируем по приоритету (от меньшего к большему)
  const sorted = [...rules].sort((a, b) => (a.priority || 999) - (b.priority || 999));
  for (const rule of sorted) {
    if (evaluateCondition(rule.when, context, events)) {
      const then = rule.then;
      if (then.result !== undefined) {
        return { result: then.result, event_index_override: null, matched: true };
      }
      if (then.event_index_override !== undefined) {
        return { result: null, event_index_override: then.event_index_override, matched: true };
      }
    }
  }
  return { result: null, event_index_override: null, matched: false };
}
