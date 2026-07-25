/**
 * Модуль парсинга METAR для веб-приложения HOT BOT
 * Извлекает из строки METAR: ICAO, температуру, видимость, события
 */

/**
 * Основная функция парсинга METAR
 * @param {string} metar - строка METAR (например, "UUEE 251630Z 35003MPS 9999 -SN OVC011 M04/M07 ...")
 * @returns {Object} Объект с полями:
 *   - icao: string | null
 *   - temperature: number | null (в градусах Цельсия)
 *   - visibility: number | string | null (число в метрах или 'CAVOK')
 *   - events: string[] (массив кодов METAR)
 *   - raw: string (исходная строка)
 */
function parseMetar(metar) {
    // Если строка пустая или не строка, возвращаем null-объект
    if (!metar || typeof metar !== 'string') {
        return {
            icao: null,
            temperature: null,
            visibility: null,
            events: [],
            raw: metar || ''
        };
    }

    // Очищаем от лишних пробелов и перевода строк
    const clean = metar.trim().replace(/\s+/g, ' ');

    // ===== 1. ICAO =====
    // Ищем 4 заглавные буквы, но не в конце строки (чтобы не захватить время)
    // Обычно ICAO стоит в начале METAR после времени, но бывает в разных местах
    // Берём первую группу из 4 заглавных букв, которая не является частью времени (не 4 цифры)
    let icao = null;
    const icaoMatch = clean.match(/\b([A-Z]{4})\b/);
    if (icaoMatch) {
        // Исключаем, если это часть времени (например, 251630Z)
        const before = clean.substring(0, icaoMatch.index);
        // Если перед ICAO есть 4 цифры + Z, значит это время, а не ICAO
        // Простая эвристика: если перед ICAO есть 6 цифр + Z, то это не ICAO
        if (!before.match(/\d{6}Z\s*$/)) {
            icao = icaoMatch[1];
        } else {
            // Если время есть, пробуем найти следующую группу из 4 букв
            const secondMatch = clean.match(/\b([A-Z]{4})\b/g);
            if (secondMatch && secondMatch.length > 1) {
                icao = secondMatch[1];
            }
        }
    }

    // ===== 2. Температура (OAT) =====
    // Формат: M04/M07 или 04/07 (температура/точка росы)
    // M означает минус
    let temperature = null;
    const tempMatch = clean.match(/(M?\d{2})\/(M?\d{2})/);
    if (tempMatch) {
        let tempStr = tempMatch[1];
        if (tempStr.startsWith('M')) {
            tempStr = '-' + tempStr.slice(1);
        }
        temperature = parseInt(tempStr, 10);
    }

    // ===== 3. Видимость =====
    let visibility = null;
    // Проверяем CAVOK (видимость 10+ км, нет значимых облаков)
    if (clean.includes('CAVOK')) {
        visibility = 'CAVOK';
    } else {
        // Ищем первое 4-значное число (диапазон 0000-9999)
        const visMatch = clean.match(/\b(\d{4})\b/);
        if (visMatch) {
            visibility = parseInt(visMatch[1], 10);
        }
        // Если есть 5-значное число (например, 9999), тоже подходит
        const visMatch5 = clean.match(/\b(\d{5})\b/);
        if (visMatch5 && !visibility) {
            visibility = parseInt(visMatch5[1], 10);
        }
    }

    // ===== 4. События (METAR-коды) =====
    // Извлекаем все группы, состоящие из букв, цифр, +/-
    // Например: -SN, +RA, BR, FZFG, BLSN
    const events = [];
    // Список известных кодов METAR (может быть загружен из metar_events.json)
    // Пока используем базовый набор, но позже будем фильтровать по списку
    const eventRegex = /([+-]?[A-Z]{2,6})/g;
    let match;
    while ((match = eventRegex.exec(clean)) !== null) {
        const code = match[1];
        // Исключаем группы, которые являются частью:
        // - времени (Z, 251630Z)
        // - скорости ветра (MPS, KT)
        // - температуры (M04)
        // - облачности (OVC, BKN, SCT, FEW, NCD, NSC)
        // - других не-погодных групп
        const excludePatterns = [
            /^\d{4}Z$/, // время
            /^MPS$/, /^KT$/, // скорость ветра
            /^OVC/, /^BKN/, /^SCT/, /^FEW/, /^NCD/, /^NSC/, /^CLR/, /^VV/, // облачность
            /^CAVOK$/, // видимость
            /^RMK$/, /^QNH/, /^A\d{4}/, // доп. информация
            /^NOSIG$/, /^BECMG$/, /^TEMPO$/, /^FM\d{4}$/, // тренды
            /^WS/, // сдвиг ветра
            /^R\d{2}[LR]?\/[PM]\d{4}/ // взлётно-посадочная полоса
        ];

        let isExcluded = false;
        for (const pattern of excludePatterns) {
            if (pattern.test(code)) {
                isExcluded = true;
                break;
            }
        }

        if (!isExcluded) {
            events.push(code);
        }
    }

    // Дополнительная фильтрация: если событие — это одиночная буква или цифры, исключаем
    const filteredEvents = events.filter(e => {
        // Оставляем только те, что содержат буквы и имеют длину >= 2
        return /[A-Z]/.test(e) && e.length >= 2;
    });

    return {
        icao: icao,
        temperature: temperature,
        visibility: visibility,
        events: filteredEvents,
        raw: clean
    };
}

// Экспорт для использования в браузере (если используется ES-модули)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMetar };
}
