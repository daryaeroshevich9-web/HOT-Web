// js/app.js
import { loadJSON } from './utils.js';
import { parseMetar } from './metar-parser.js';
import { buildContext } from './context-builder.js';
import { calculateHOT, calculateAT } from './hot-calculator.js';

// Глобальные переменные
let airportList = [];
let fluidList = [];
let metarCache = {};

// Список жидкостей (соответствует именам файлов)
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

// Инициализация
async function init() {
  try {
    // Загружаем список аэропортов
    const airports = await loadJSON('data/airports.json');
    airportList = airports;
    populateAirportSelect(airports);

    // Заполняем список жидкостей
    populateFluidSelect(FLUID_TYPES);

    // Обработчик кнопки
    document.getElementById('calculateBtn').addEventListener('click', onCalculate);
  } catch (err) {
    console.error('Ошибка инициализации:', err);
    document.getElementById('error').textContent = 'Ошибка загрузки данных. Проверьте соединение.';
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

// Основное действие
async function onCalculate() {
  const airport = document.getElementById('airport').value;
  const fluid = document.getElementById('fluid').value;
  const dayNight = document.querySelector('input[name="daynight"]:checked').value;

  const resultDiv = document.getElementById('result');
  const errorDiv = document.getElementById('error');
  const spinner = document.getElementById('spinner');
  const btn = document.getElementById('calculateBtn');

  // Сброс
  resultDiv.style.display = 'none';
  errorDiv.textContent = '';
  btn.disabled = true;
  spinner.style.display = 'block';

  try {
    // 1. Получаем METAR
    const metar = await fetchMetar(airport);

    // 2. Парсим
    const parsed = parseMetar(metar);
    if (!parsed.temperature) {
      throw new Error('Не удалось определить температуру в METAR');
    }

    // 3. Строим контекст
    const context = await buildContext(parsed.events, parsed.temperature, parsed.visibility, dayNight);

    // 4. Рассчитываем HOT
    const hotResult = await calculateHOT(fluid, parsed.temperature, context.intensity, context, parsed.events, dayNight);

    // 5. Рассчитываем AT (если нужно) — пока пропускаем, так как AT пока не требуется в MVP
    // Можно добавить позже

    // 6. Отображаем результат
    renderResult(parsed, context, hotResult, metar);

  } catch (err) {
    errorDiv.textContent = 'Ошибка: ' + err.message;
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

// Запрос METAR к ogimet.com через прокси
async function fetchMetar(icao) {
  // Для теста можно использовать заглушку, но в продакшене реальный запрос
  // Используем прокси cors-anywhere
  const proxy = 'https://cors-anywhere.herokuapp.com/';
  const url = `https://www.ogimet.com/cgi-bin/getmetar?icao=${icao}&begin=${getCurrentHour()}&header=yes`;

  try {
    const response = await fetch(proxy + url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    // Парсим CSV: последняя строка содержит METAR
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error('Нет данных METAR');
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(',');
    // Формат: ... PARTE содержит METAR-строку
    const metarIndex = parts.length - 1;
    const metar = parts[metarIndex].trim();
    if (!metar || metar.length < 10) throw new Error('Неверный формат METAR');
    return metar;
  } catch (err) {
    console.error('Ошибка получения METAR:', err);
    throw new Error('Не удалось получить METAR. Попробуйте позже.');
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

// Отображение результата
function renderResult(parsed, context, hotResult, rawMetar) {
  const div = document.getElementById('result');
  div.style.display = 'block';

  let html = `<h3>🌤 Погода</h3>
    <p><strong>Температура:</strong> ${parsed.temperature}°C</p>
    <p><strong>Видимость:</strong> ${parsed.visibility} м</p>
    <p><strong>События:</strong> ${parsed.events.join(', ') || '—'}</p>
    <p><strong>Интенсивность:</strong> ${context.intensity}</p>`;

  // HOT
  const hot = hotResult.hot;
  if (typeof hot === 'object') {
    // Объект с концентрациями
    html += `<h3>⏳ Время защитного действия (HOT)</h3>`;
    for (const [conc, time] of Object.entries(hot)) {
      html += `<div class="concentration-item"><strong>${conc}:</strong> ${time}</div>`;
    }
  } else {
    // Строка
    html += `<h3>⏳ Время защитного действия (HOT)</h3>
      <div class="hot-value">${hot}</div>`;
  }

  // Предупреждения (пока нет, можно добавить позже)
  if (hotResult.warnings && hotResult.warnings.length > 0) {
    html += `<div class="warning">${hotResult.warnings.join('<br>')}</div>`;
  }

  // AT (если есть)
  // if (hotResult.at_pg) { ... }

  // Сырой METAR
  html += `<button onclick="document.getElementById('metarRaw').classList.toggle('show')">Показать METAR</button>
    <pre id="metarRaw" class="metar-raw">${rawMetar}</pre>`;

  div.innerHTML = html;
}

// Запуск
init();
