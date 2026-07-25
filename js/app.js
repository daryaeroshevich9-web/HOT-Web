// js/app.js
import { loadJSON } from './utils.js';
import { parseMetar } from './metar-parser.js';
import { buildContext } from './context-builder.js';
import { calculateHOT } from './hot-calculator.js';

console.log('✅ app.js загружен');

const FLUID_TYPES = [
  { id: 'active_frost', label: 'Active Frost' },
  { id: 'type_i', label: 'Type I Generic' },
  { id: 'type_ii_generic', label: 'Type II Generic' },
  { id: 'type_ii_cryotech', label: 'Type II Cryotech' },
  { id: 'type_ii_kilfrost', label: 'Type II Kilfrost' },
  { id: 'type_iv_generic', label: 'Type IV Generic' },
  { id: 'type_iv_aviafluid', label: 'Type IV Aviafluid' },
  { id: 'type_iv_nordix', label: 'Type IV Nordix' }
];

async function init() {
  console.log('🚀 init() вызван');
  try {
    const airports = await loadJSON('data/airports.json');
    console.log('✅ Аэропорты загружены:', airports);
    populateAirportSelect(airports);
    populateFluidSelect(FLUID_TYPES);
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
    opt.textContent = f.label;
    sel.appendChild(opt);
  });
}

async function onCalculate() {
  const airport = document.getElementById('airport').value;
  const fluid = document.getElementById('fluid').value;
  const dayNight = document.querySelector('input[name="daynight"]:checked').value;
  const manualMetar = document.getElementById('manualMetar').value.trim();

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

    const parsed = parseMetar(metar);
    if (!parsed.temperature) {
      throw new Error('Не удалось определить температуру в METAR');
    }

    const context = await buildContext(parsed.events, parsed.temperature, parsed.visibility, dayNight);
    const hotResult = await calculateHOT(fluid, parsed.temperature, context.intensity, context, parsed.events, dayNight);

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
  const proxy = 'https://api.allorigins.win/raw?url=';
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

function renderResult(parsed, context, hotResult, rawMetar) {
  const div = document.getElementById('result');
  div.style.display = 'block';

  let html = `<h3>🌤 Погода</h3>
    <p><strong>Температура:</strong> ${parsed.temperature}°C</p>
    <p><strong>Видимость:</strong> ${parsed.visibility} м</p>
    <p><strong>События:</strong> ${parsed.events.join(', ') || '—'}</p>
    <p><strong>Интенсивность:</strong> ${context.intensity}</p>`;

  const hot = hotResult.hot;
  if (typeof hot === 'object') {
    html += `<h3>⏳ Время защитного действия (HOT)</h3>`;
    for (const [conc, time] of Object.entries(hot)) {
      html += `<div class="concentration-item"><strong>${conc}:</strong> ${time}</div>`;
    }
  } else {
    html += `<h3>⏳ Время защитного действия (HOT)</h3>
      <div class="hot-value">${hot}</div>`;
  }

  if (hotResult.warnings && hotResult.warnings.length > 0) {
    html += `<div class="warning">${hotResult.warnings.join('<br>')}</div>`;
  }

  html += `<button onclick="document.getElementById('metarRaw').classList.toggle('show')">Показать METAR</button>
    <pre id="metarRaw" class="metar-raw">${rawMetar}</pre>`;

  div.innerHTML = html;
}

init();
