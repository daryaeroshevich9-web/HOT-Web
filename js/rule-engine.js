// js/rule-engine.js

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
        // FIX: строгое сравнение множеств (порядок не важен)
        if (!Array.isArray(value)) return false;
        const sortedEvents = [...events].sort();
        const sortedValue = [...value].sort();
        if (sortedEvents.length !== sortedValue.length) return false;
        for (let i = 0; i < sortedEvents.length; i++) {
          if (sortedEvents[i] !== sortedValue[i]) return false;
        }
        return true;
        break;
      // Заглушка для условия из бота (оставлено как есть)
      case 'event_index_eq_table_len_ref':
        return false;
      default:
        console.warn('Неизвестное условие в правиле:', key);
        return false;
    }
  }
  return true;
}

export function applyRules(rules, context, events) {
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
