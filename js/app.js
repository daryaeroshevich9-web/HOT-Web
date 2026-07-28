// js/app.js
import { loadJSON } from './utils.js';
import { parseMetar } from './metar-parser.js';
import { buildContext } from './context-builder.js';
import { calculateHOT, calculateAT } from './hot-calculator.js';

console.log('✅ app.js загружен');

const FLUID_TYPES = [
  { id: 'type_i', label: 'Type I Generic', subtype: null },
  { id: 'type_ii_generic', label: 'Type II Generic', subtype: null },
  { id: 'type_ii_cryotech', label: 'Type II Cryotech', subtype: null },
  { id: 'type_ii_kilfrost', label: 'Type II Kilfrost', subtype: null },
  { id: 'type_iv_generic', label: 'Type IV Generic', subtype: null },
  { id: 'type_iv_aviafluid', label: 'Type IV Aviafluid', subtype: null },
  { id: 'type_iv_nordix', label: 'Type IV Nordix', subtype: null },
  { id: 'active_frost', label: 'Active Frost (Type I)', subtype: 'I' },
  { id: 'active_frost', label: 'Active Frost (Type II)', subtype: 'II' },
  { id: 'active_frost', label: 'Active Frost (Type IV)', subtype: 'IV' }
];

let metarEvents = null;
let allowanceEvents = null;

async function init() {
  console.log('🚀 init() вызван');
  try {
    metarEvents = await loadJSON('data/config/metar_events.json');
    console.log('✅ metar_events загружены');

    allowanceEvents = await loadJSON('data/config/allowance_events.json');
    console.log('✅ allowance_events загружены');

    document.getElementById('calculateBtn').addEventListener('click', onCalculate);
    console.log('✅ Обработчик кнопки добавлен');
  } catch (err) {
    console.error('❌ Ошибка инициализации:', err);
    document.getElementById('error').textContent = 'Ошибка загрузки данных: ' + err.message;
  }
}

async function onCalculate() {
  const icaoInput = document.getElementById('icaoInput');
  const airport = icaoInput.value.trim().toUpperCase();
  if (!airport) {
    document.getElementById('error').textContent = '❌ Введите код аэропорта (ICAO)';
    return;
  }

  const fluidSelect = document.getElementById('fluid');
  const fluid = fluidSelect.value;
  if (!fluid) {
    document.getElementById('error').textContent = '❌ Выберите тип жидкости';
    return;
  }
  const selectedOption = fluidSelect.options[fluidSelect.selectedIndex];
  const subtype = selectedOption?.dataset?.subtype || null;

  const dayNight = document.querySelector('input[name="daynight"]:checked').value;
  const manualInput = document.getElementById('manualMetar');
  const manualMetar = manualInput ? manualInput.value.trim() : '';

  const resultDiv = document.getElementById('result');
  const errorDiv = document.getElementById('error');
  const spinner = document.getElementById('spinner');
  const btn = document.getElementById('calculateBtn');

  resultDiv.style.display = 'none';
  errorDiv.textContent = '';
  btn.disabled = true;
  spinner.style.display = 'block';

  try {
    let metar;
    if (manualMetar) {
      metar = manualMetar;
      console.log('📝 Используем ручной METAR:', metar);
    } else {
      metar = await fetchMetar(airport);
      console.log('📡 Получен METAR:', metar);
    }

    const allowedEvents = metarEvents ? metarEvents.metar_events || [] : [];
    const parsed = parseMetar(metar, allowedEvents);
    console.log('🔍 Распарсено:', parsed);

    if (!parsed.temperature) {
      throw new Error('Не удалось определить температуру в METAR');
    }

    const context = await buildContext(parsed.events, parsed.temperature, parsed.visibility, dayNight);
    console.log('🧠 Контекст:', context);

    // --- Расчёт HOT ---
    const hotResult = await calculateHOT(fluid, parsed.temperature, context.intensity, context, parsed.events, dayNight, 'hot', subtype);
    console.log('📊 Результат HOT:', hotResult);

    // --- Флаги для AT ---
    const isHotCaution = typeof hotResult.hot === 'string' && hotResult.hot.includes('CAUTION');
    const hasGS = parsed.events.some(e => e.includes('GS'));
    const hasAllowanceEvent = parsed.events.some(e => 
      allowanceEvents?.allowance_events?.some(ae => e.includes(ae))
    );

    const showAT = isHotCaution || hasGS || hasAllowanceEvent;

    // --- Расчёт AT (если необходимо) ---
    let atPg = null;
    let atEg = null;
    if (showAT) {
      try {
        atPg = await calculateAT(fluid, parsed.temperature, context.intensity, context, parsed.events, dayNight, 'allowance_pg', subtype);
        atEg = await calculateAT(fluid, parsed.temperature, context.intensity, context, parsed.events, dayNight, 'allowance_eg', subtype);
        console.log('📊 AT PG:', atPg);
        console.log('📊 AT EG:', atEg);
      } catch (err) {
        console.warn('⚠️ Ошибка расчёта AT:', err);
      }
    }

    // --- Собираем предупреждения (уже без GS, так как выводим отдельно) ---
    const warnings = hotResult.warnings || [];

    renderResult(parsed, context, hotResult, atPg, atEg, metar, warnings, hasGS);
  } catch (err) {
    errorDiv.textContent = '❌ Ошибка: ' + err.message;
    console.error(err);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

// ===== ФУНКЦИЯ ПОЛУЧЕНИЯ METAR (VATSIM) =====
async function fetchMetar(icao) {
  const url = `https://metar.vatsim.net/metar.php?id=${icao}`;
  console.log(`📡 Запрос к VATSIM: ${icao}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      let errorText = '';
      try { errorText = await response.text(); } catch (_) {}
      throw new Error(`HTTP ${response.status}${errorText ? ': ' + errorText : ''}`);
    }

    const text = await response.text();
    const lines = text.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
      throw new Error('Пустой ответ от VATSIM');
    }

    const metar = lines[0].trim();
    if (metar.length < 10) {
      throw new Error('Полученная строка слишком короткая для METAR');
    }

    console.log('✅ METAR успешно получен от VATSIM');
    return metar;
  } catch (err) {
    console.error('❌ Ошибка получения METAR от VATSIM:', err);
    throw new Error(`Не удалось получить METAR: ${err.message}. Попробуйте ввести METAR вручную.`);
  }
}

// ===== Вспомогательные функции =====

function getHotStatus(hotValue) {
  if (typeof hotValue === 'object') return 'success';
  const str = String(hotValue);
  if (str.includes('CAUTION')) return 'danger';
  if (str.includes('No snow') || str.includes('CAVOK')) return 'warning';
  if (str.includes(':')) return 'success';
  return 'warning';
}

function renderResult(parsed, context, hotResult, atPg, atEg, rawMetar, warnings = [], hasGS = false) {
  const div = document.getElementById('result');
  div.style.display = 'block';

  let html = `<h3>🌤 Погода</h3>
    <p><strong>Температура:</strong> ${parsed.temperature}°C</p>
    <p><strong>Видимость:</strong> ${parsed.visibility} м</p>
    <p><strong>События:</strong> ${parsed.events.join(', ') || '—'}</p>
    <p><strong>Интенсивность:</strong> ${context.intensity}</p>`;

  // --- HOT ---
  const hot = hotResult.hot;

  if (typeof hot === 'object') {
    html += `<h3>⏳ Время защитного действия (HOT)</h3>`;
    for (const [conc, time] of Object.entries(hot)) {
      // Все концентрации выводятся с одинаковым стилем time-value
      html += `<div><span class="time-value"><strong>${conc}:</strong> ${time}</span></div>`;
    }
  } else {
    html += `<h3>⏳ Время защитного действия (HOT)</h3>
      <span class="time-value">${hot}</span>`;
  }

  // --- AT (если есть) ---
  const hasAT = (atPg && atPg.hot) || (atEg && atEg.hot);
  if (hasAT) {
    html += `<h3>⏳ Allowance Time (AT)</h3>`;
    if (atPg && atPg.hot && atPg.hot !== '') {
      html += `<div><span class="time-value"><strong>PG:</strong> ${atPg.hot}</span></div>`;
    } else {
      html += `<div><span class="time-value" style="background:#f8f9fa; color:#6c757d;"><strong>PG:</strong> Нет данных</span></div>`;
    }
    if (atEg && atEg.hot && atEg.hot !== '') {
      html += `<div><span class="time-value"><strong>EG:</strong> ${atEg.hot}</span></div>`;
    } else {
      html += `<div><span class="time-value" style="background:#f8f9fa; color:#6c757d;"><strong>EG:</strong> Нет данных</span></div>`;
    }
  }

  // --- Предупреждения ---
  if (hasGS) {
    html += `<div class="warning-box" style="background: #fff3cd; color: #856404; border-left-color: #ffc107;">
      ⚠️ <strong>Рекомендация:</strong> Уточните тип осадков по голосовой информации ATIS.
    </div>`;
  }

  if (warnings && warnings.length > 0) {
    warnings.forEach(w => {
      html += `<div class="warning-box">${w}</div>`;
    });
  }

  html += `<button onclick="document.getElementById('metarRaw').classList.toggle('show')">Показать METAR</button>
    <pre id="metarRaw" class="metar-raw">${rawMetar}</pre>`;

  div.innerHTML = html;
}

init();
