// js/app.js
import { loadJSON } from './utils.js';
import { parseMetar } from './metar-parser.js';
import { buildContext } from './context-builder.js';
import { calculateHOT } from './hot-calculator.js';

console.log('✅ app.js загружен');

// Список жидкостей: теперь Active Frost разделён на подтипы
const FLUID_TYPES = [
  { id: 'type_i', label: 'Type I Generic', subtype: null },
  { id: 'type_ii_generic', label: 'Type II Generic', subtype: null },
  { id: 'type_ii_cryotech', label: 'Type II Cryotech', subtype: null },
  { id: 'type_ii_kilfrost', label: 'Type II Kilfrost', subtype: null },
  { id: 'type_iv_generic', label: 'Type IV Generic', subtype: null },
  { id: 'type_iv_aviafluid', label: 'Type IV Aviafluid', subtype: null },
  { id: 'type_iv_nordix', label: 'Type IV Nordix', subtype: null },
  // Active Frost с подтипами — все используют один файл active_frost.json
  { id: 'active_frost', label: 'Active Frost (Type I)', subtype: 'I' },
  { id: 'active_frost', label: 'Active Frost (Type II)', subtype: 'II' },
  { id: 'active_frost', label: 'Active Frost (Type IV)', subtype: 'IV' }
];

let metarEvents = null;

async function init() {
  console.log('🚀 init() вызван');
  try {
    const airports = await loadJSON('data/airports.json');
    console.log('✅ Аэропорты загружены:', airports);
    populateAirportSelect(airports);
    populateFluidSelect(FLUID_TYPES);
    metarEvents = await loadJSON('data/config/metar_events.json');
    console.log('✅ metar_events загружены');
    document.getElementById('calculateBtn').addEventListener('click', onCalculate);
    console.log('✅ Обработчик кнопки добавлен');
  } catch (err) {
    console.error('❌ Ошибка инициализации:', err);
    document.getElementById('error').textContent = 'Ошибка загрузки данных: ' + err.message;
  }
}

function populateAirportSelect(list) {
  const sel = document.getElementById('airport');
  sel.innerHTML = '';
  list.forEach(ap => {
    const opt = document.createElement('option');
    opt.value = ap.icao;
    opt.textContent = `${ap.icao} — ${ap.name}`;
    sel.appendChild(opt);
  });
}

function populateFluidSelect(list) {
  const sel = document.getElementById('fluid');
  sel.innerHTML = '';
  list.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    // Если есть подтип, добавляем его в отображение
    const label = f.subtype ? `${f.label}` : f.label;
    opt.textContent = label;
    // Сохраняем subtype как data-атрибут
    if (f.subtype) {
      opt.dataset.subtype = f.subtype;
    }
    sel.appendChild(opt);
  });
}

async function onCalculate() {
  const airport = document.getElementById('airport').value;
  const fluidSelect = document.getElementById('fluid');
  const fluid = fluidSelect.value;
  // Получаем subtype из выбранного option (если есть)
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

    // Передаём subtype для Active Frost
    const hotResult = await calculateHOT(fluid, parsed.temperature, context.intensity, context, parsed.events, dayNight, 'hot', subtype);
    console.log('📊 Результат HOT:', hotResult);

    renderResult(parsed, context, hotResult, metar);
  } catch (err) {
    errorDiv.textContent = '❌ Ошибка: ' + err.message;
    console.error(err);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

async function fetchMetar(icao) {
  const proxy = 'https://corsproxy.io/?';
  const target = `https://www.ogimet.com/cgi-bin/getmetar?icao=${icao}&begin=${getCurrentHour()}&header=yes`;
  const url = proxy + encodeURIComponent(target);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error('Нет данных METAR');
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(',');
    const metar = parts[parts.length - 1].trim();
    if (!metar || metar.length < 10) throw new Error('Неверный формат METAR');
    return metar;
  } catch (err) {
    console.error('Ошибка получения METAR:', err);
    throw new Error('Не удалось получить METAR. Попробуйте позже или введите вручную.');
  }
}

function getCurrentHour() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  return `${year}${month}${day}${hour}00`;
}

function getHotStatus(hotValue) {
  if (typeof hotValue === 'object') return 'success';
  const str = String(hotValue);
  if (str.includes('CAUTION')) return 'danger';
  if (str.includes('No snow') || str.includes('CAVOK')) return 'warning';
  if (str.includes(':')) return 'success';
  return 'warning';
}

function renderResult(parsed, context, hotResult, rawMetar) {
  const div = document.getElementById('result');
  div.style.display = 'block';

  let html = `<h3>🌤 Погода</h3>
    <p><strong>Температура:</strong> ${parsed.temperature}°C</p>
    <p><strong>Видимость:</strong> ${parsed.visibility} м</p>
    <p><strong>События:</strong> ${parsed.events.join(', ') || '—'}</p>
    <p><strong>Интенсивность:</strong> ${context.intensity}</p>`;

  const hot = hotResult.hot;
  const status = getHotStatus(hot);

  if (typeof hot === 'object') {
    html += `<h3>⏳ Время защитного действия (HOT)</h3>`;
    for (const [conc, time] of Object.entries(hot)) {
      const concStatus = getHotStatus(time);
      html += `<div class="concentration-item status-${concStatus}"><strong>${conc}:</strong> ${time}</div>`;
    }
  } else {
    html += `<h3>⏳ Время защитного действия (HOT)</h3>
      <div class="hot-value status-${status}">${hot}</div>`;
  }

  if (hotResult.warnings && hotResult.warnings.length > 0) {
    html += `<div class="warning">${hotResult.warnings.join('<br>')}</div>`;
  }

  html += `<button onclick="document.getElementById('metarRaw').classList.toggle('show')">Показать METAR</button>
    <pre id="metarRaw" class="metar-raw">${rawMetar}</pre>`;

  div.innerHTML = html;
}

init();
