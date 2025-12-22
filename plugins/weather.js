import fetch from 'node-fetch';
import { LRUCache } from 'lru-cache';
import { templates } from '../utils/deluxeUI.js';

const CONFIG = {

    OPENWEATHER_KEY: process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY || '',
    WEATHERAPI_KEY: process.env.WEATHERAPI_KEY || '',

    CACHE_TTL: 600000,
    CACHE_MAX: 500,

    TIMEOUT: 15000,

    DEFAULT_UNITS: 'metric',
    FORECAST_DAYS: 3,
};

const weatherCache = new LRUCache({
    max: CONFIG.CACHE_MAX,
    ttl: CONFIG.CACHE_TTL,
});

const userLocations = new LRUCache({
    max: 10000,
    ttl: 86400000 * 30,
});

const WEATHER_EMOJIS = {

    'clear': '☀️',
    'sunny': '☀️',

    'partly cloudy': '⛅',
    'partly sunny': '⛅',
    'mostly cloudy': '🌥️',
    'cloudy': '☁️',
    'overcast': '☁️',

    'light rain': '🌦️',
    'rain': '🌧️',
    'heavy rain': '🌧️',
    'showers': '🌧️',
    'drizzle': '🌦️',

    'thunder': '⛈️',
    'thunderstorm': '⛈️',
    'storm': '⛈️',

    'snow': '🌨️',
    'light snow': '🌨️',
    'heavy snow': '❄️',
    'sleet': '🌨️',
    'blizzard': '🌨️',

    'fog': '🌫️',
    'mist': '🌫️',
    'haze': '🌫️',
    'smoke': '🌫️',
    'dust': '🌪️',
    'sand': '🌪️',
    'tornado': '🌪️',

    'default': '🌡️',
};

const UV_INDEX = {
    low: { range: [0, 2], emoji: '🟢', label: 'Low', advice: 'Safe for outdoor activities' },
    moderate: { range: [3, 5], emoji: '🟡', label: 'Moderate', advice: 'Wear sunscreen' },
    high: { range: [6, 7], emoji: '🟠', label: 'High', advice: 'Reduce sun exposure' },
    veryHigh: { range: [8, 10], emoji: '🔴', label: 'Very High', advice: 'Extra protection needed' },
    extreme: { range: [11, 20], emoji: '🟣', label: 'Extreme', advice: 'Avoid sun exposure' },
};

const AQI_LEVELS = {
    good: { range: [0, 50], emoji: '🟢', label: 'Good' },
    moderate: { range: [51, 100], emoji: '🟡', label: 'Moderate' },
    unhealthySensitive: { range: [101, 150], emoji: '🟠', label: 'Unhealthy for Sensitive' },
    unhealthy: { range: [151, 200], emoji: '🔴', label: 'Unhealthy' },
    veryUnhealthy: { range: [201, 300], emoji: '🟣', label: 'Very Unhealthy' },
    hazardous: { range: [301, 500], emoji: '🟤', label: 'Hazardous' },
};

function getWeatherEmoji(description = '') {
    const desc = description.toLowerCase();

    for (const [key, emoji] of Object.entries(WEATHER_EMOJIS)) {
        if (desc.includes(key)) {
            return emoji;
        }
    }

    return WEATHER_EMOJIS.default;
}

function getUVInfo(uvIndex) {
    const uv = parseFloat(uvIndex) || 0;

    for (const [, info] of Object.entries(UV_INDEX)) {
        if (uv >= info.range[0] && uv <= info.range[1]) {
            return { ...info, value: uv };
        }
    }

    return { ...UV_INDEX.low, value: uv };
}

function getAQIInfo(aqi) {
    const value = parseInt(aqi) || 0;

    for (const [, info] of Object.entries(AQI_LEVELS)) {
        if (value >= info.range[0] && value <= info.range[1]) {
            return { ...info, value };
        }
    }

    return { ...AQI_LEVELS.good, value };
}

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

function getWindEmoji(speed) {
    if (speed < 10) return '🍃';
    if (speed < 20) return '💨';
    if (speed < 40) return '🌬️';
    return '🌪️';
}

function formatTemp(temp, unit = 'C') {
    return `${Math.round(temp)}°${unit}`;
}

function celsiusToFahrenheit(c) {
    return (c * 9 / 5) + 32;
}

function fahrenheitToCelsius(f) {
    return (f - 32) * 5 / 9;
}

function formatTime(timestamp, timezone = 0) {
    const date = new Date((timestamp + timezone) * 1000);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
    });
}

function getMoonPhase(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const c = Math.floor(365.25 * year);
    const e = Math.floor(30.6 * month);
    const jd = c + e + day - 694039.09;
    const phase = jd / 29.53058867;
    const phaseIndex = Math.floor((phase - Math.floor(phase)) * 8);

    const phases = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
        'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];

    return { emoji: phases[phaseIndex], name: names[phaseIndex] };
}

async function fetchDarkShanWeather(location) {
    try {

        const _0x1a2b = (s) => Buffer.from(s, 'base64').toString('utf-8');
        const _0xkey = _0x1a2b('ZmVhZTVlNDIyMDBmNDY3Yg==');

        const url = `https://api-dark-shan-yt.koyeb.app/search/weather?q=${encodeURIComponent(location)}&apikey=${_0xkey}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Vesperr)' },
            timeout: CONFIG.TIMEOUT,
        });

        if (!response.ok) return null;

        const json = await response.json();
        if (!json.status || !json.data) return null;

        const data = json.data;
        const current = data.temperature || {};
        const wind = data.wind || {};
        const conditions = data.conditions || {};

        return {
            provider: 'DarkShan',
            location: {
                name: data.city || location,
                region: '',
                country: data.country || '',
                lat: data.coordinates?.latitude,
                lon: data.coordinates?.longitude,
            },
            current: {
                temp: parseFloat(current.current),
                feelsLike: parseFloat(current.feelsLike),
                condition: conditions.description ? conditions.description.charAt(0).toUpperCase() + conditions.description.slice(1) : 'Unknown',
                emoji: getWeatherEmoji(conditions.description || conditions.main),
                humidity: parseInt(data.humidity) || 0,
                windSpeed: parseFloat(wind.speed) * 3.6,
                windDir: getWindDirection(wind.direction || 0),
                windDegree: parseInt(wind.direction) || 0,
                pressure: parseInt(data.pressure),
                visibility: 10,
                uvIndex: 0,
                cloudCover: parseInt(data.clouds) || 0,
                precipitation: parseFloat(data.rain) || 0,
            },
            astronomy: null,
            forecast: [],
            hourly: [],
        };
    } catch (error) {
        console.error('DarkShan Weather error:', error.message);
        return null;
    }
}

async function fetchWttr(location) {
    try {
        const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Vesperr)' },
            timeout: CONFIG.TIMEOUT,
        });

        if (!response.ok) return null;

        const data = await response.json();

        if (!data.current_condition?.[0]) return null;

        const current = data.current_condition[0];
        const area = data.nearest_area?.[0];
        const weather = data.weather || [];
        const astronomy = weather[0]?.astronomy?.[0];

        return {
            provider: 'wttr.in',
            location: {
                name: area?.areaName?.[0]?.value || location,
                region: area?.region?.[0]?.value || '',
                country: area?.country?.[0]?.value || '',
                lat: area?.latitude,
                lon: area?.longitude,
            },
            current: {
                temp: parseFloat(current.temp_C),
                feelsLike: parseFloat(current.FeelsLikeC),
                condition: current.weatherDesc?.[0]?.value || 'Unknown',
                emoji: getWeatherEmoji(current.weatherDesc?.[0]?.value),
                humidity: parseInt(current.humidity),
                windSpeed: parseFloat(current.windspeedKmph),
                windDir: current.winddir16Point,
                windDegree: parseInt(current.winddirDegree),
                pressure: parseInt(current.pressure),
                visibility: parseFloat(current.visibility),
                uvIndex: parseFloat(current.uvIndex),
                cloudCover: parseInt(current.cloudcover),
                precipitation: parseFloat(current.precipMM) || 0,
            },
            astronomy: astronomy ? {
                sunrise: astronomy.sunrise,
                sunset: astronomy.sunset,
                moonrise: astronomy.moonrise,
                moonset: astronomy.moonset,
                moonPhase: getMoonPhase(),
            } : null,
            forecast: weather.slice(0, CONFIG.FORECAST_DAYS).map(day => ({
                date: day.date,
                day: new Date(day.date).toLocaleDateString('en', { weekday: 'short' }),
                maxTemp: parseFloat(day.maxtempC),
                minTemp: parseFloat(day.mintempC),
                avgTemp: parseFloat(day.avgtempC),
                condition: day.hourly?.[4]?.weatherDesc?.[0]?.value || 'Unknown',
                emoji: getWeatherEmoji(day.hourly?.[4]?.weatherDesc?.[0]?.value),
                chanceOfRain: parseInt(day.hourly?.[4]?.chanceofrain) || 0,
                totalPrecip: parseFloat(day.totalSnow_cm) > 0
                    ? parseFloat(day.totalSnow_cm) + ' cm snow'
                    : (parseFloat(day.precipMM) || 0) + ' mm',
            })),
            hourly: weather[0]?.hourly?.map(h => ({
                time: `${h.time.padStart(4, '0').slice(0, 2)}:00`,
                temp: parseFloat(h.tempC),
                condition: h.weatherDesc?.[0]?.value,
                emoji: getWeatherEmoji(h.weatherDesc?.[0]?.value),
                chanceOfRain: parseInt(h.chanceofrain),
            })) || [],
        };
    } catch (error) {
        console.error('wttr.in error:', error.message);
        return null;
    }
}

async function fetchOpenWeather(location) {
    if (!CONFIG.OPENWEATHER_KEY) return null;

    try {

        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${CONFIG.OPENWEATHER_KEY}`;
        const geoRes = await fetch(geoUrl, { timeout: CONFIG.TIMEOUT });
        const geoData = await geoRes.json();

        if (!geoData?.[0]) return null;

        const { lat, lon, name, country, state } = geoData[0];

        const weatherUrl = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely&units=metric&appid=${CONFIG.OPENWEATHER_KEY}`;
        const weatherRes = await fetch(weatherUrl, { timeout: CONFIG.TIMEOUT });
        const data = await weatherRes.json();

        if (!data.current) return null;

        const current = data.current;

        return {
            provider: 'OpenWeatherMap',
            location: {
                name,
                region: state || '',
                country,
                lat,
                lon,
            },
            current: {
                temp: current.temp,
                feelsLike: current.feels_like,
                condition: current.weather[0]?.description || 'Unknown',
                emoji: getWeatherEmoji(current.weather[0]?.description),
                humidity: current.humidity,
                windSpeed: current.wind_speed * 3.6,
                windDir: getWindDirection(current.wind_deg),
                windDegree: current.wind_deg,
                pressure: current.pressure,
                visibility: (current.visibility || 10000) / 1000,
                uvIndex: current.uvi,
                cloudCover: current.clouds,
                precipitation: data.daily?.[0]?.rain || 0,
                dewPoint: current.dew_point,
            },
            astronomy: {
                sunrise: formatTime(current.sunrise, data.timezone_offset),
                sunset: formatTime(current.sunset, data.timezone_offset),
                moonPhase: getMoonPhase(),
            },
            forecast: data.daily?.slice(1, CONFIG.FORECAST_DAYS + 1).map(day => ({
                date: new Date(day.dt * 1000).toISOString().split('T')[0],
                day: new Date(day.dt * 1000).toLocaleDateString('en', { weekday: 'short' }),
                maxTemp: day.temp.max,
                minTemp: day.temp.min,
                avgTemp: (day.temp.max + day.temp.min) / 2,
                condition: day.weather[0]?.description || 'Unknown',
                emoji: getWeatherEmoji(day.weather[0]?.description),
                chanceOfRain: Math.round((day.pop || 0) * 100),
                totalPrecip: (day.rain || 0) + (day.snow || 0) + ' mm',
            })) || [],
            hourly: data.hourly?.slice(0, 12).map(h => ({
                time: new Date(h.dt * 1000).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
                temp: h.temp,
                condition: h.weather[0]?.description,
                emoji: getWeatherEmoji(h.weather[0]?.description),
                chanceOfRain: Math.round((h.pop || 0) * 100),
            })) || [],
            alerts: data.alerts?.map(alert => ({
                event: alert.event,
                sender: alert.sender_name,
                start: new Date(alert.start * 1000).toLocaleString(),
                end: new Date(alert.end * 1000).toLocaleString(),
                description: alert.description?.slice(0, 200),
            })) || [],
            airQuality: null,
        };
    } catch (error) {
        console.error('OpenWeatherMap error:', error.message);
        return null;
    }
}

async function fetchOpenMeteo(location) {
    try {

        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
        const geoRes = await fetch(geoUrl, { timeout: CONFIG.TIMEOUT });
        const geoData = await geoRes.json();

        if (!geoData.results?.[0]) return null;

        const { latitude, longitude, name, country, admin1 } = geoData.results[0];

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto`;
        const weatherRes = await fetch(weatherUrl, { timeout: CONFIG.TIMEOUT });
        const data = await weatherRes.json();

        if (!data.current) return null;

        const current = data.current;
        const daily = data.daily;

        const weatherCodes = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog',
            51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
            61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
            80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
            95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
        };

        const condition = weatherCodes[current.weather_code] || 'Unknown';

        return {
            provider: 'Open-Meteo',
            location: {
                name,
                region: admin1 || '',
                country,
                lat: latitude,
                lon: longitude,
            },
            current: {
                temp: current.temperature_2m,
                feelsLike: current.apparent_temperature,
                condition,
                emoji: getWeatherEmoji(condition),
                humidity: current.relative_humidity_2m,
                windSpeed: current.wind_speed_10m,
                windDir: getWindDirection(current.wind_direction_10m),
                windDegree: current.wind_direction_10m,
                pressure: current.pressure_msl,
                uvIndex: current.uv_index,
            },
            astronomy: daily ? {
                sunrise: daily.sunrise[0]?.split('T')[1],
                sunset: daily.sunset[0]?.split('T')[1],
                moonPhase: getMoonPhase(),
            } : null,
            forecast: daily ? daily.time.slice(1, CONFIG.FORECAST_DAYS + 1).map((date, i) => ({
                date,
                day: new Date(date).toLocaleDateString('en', { weekday: 'short' }),
                maxTemp: daily.temperature_2m_max[i + 1],
                minTemp: daily.temperature_2m_min[i + 1],
                avgTemp: (daily.temperature_2m_max[i + 1] + daily.temperature_2m_min[i + 1]) / 2,
                condition: weatherCodes[daily.weather_code[i + 1]] || 'Unknown',
                emoji: getWeatherEmoji(weatherCodes[daily.weather_code[i + 1]]),
                chanceOfRain: daily.precipitation_probability_max[i + 1] || 0,
            })) : [],
        };
    } catch (error) {
        console.error('Open-Meteo error:', error.message);
        return null;
    }
}

async function getWeather(location, options = {}) {
    const { forceRefresh = false } = options;

    const cacheKey = location.toLowerCase().trim();
    if (!forceRefresh) {
        const cached = weatherCache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }
    }

    let data = null;

    if (CONFIG.OPENWEATHER_KEY) {
        data = await fetchOpenWeather(location);
    }

    if (!data) {
        data = await fetchDarkShanWeather(location);
    }

    if (!data) {
        data = await fetchWttr(location);
    }

    if (!data) {
        data = await fetchOpenMeteo(location);
    }

    if (data) {
        weatherCache.set(cacheKey, data);
    }

    return data;
}

function formatCurrentWeather(data, units = 'C') {
    const { location, current, astronomy } = data;
    const isMetric = units === 'C';

    const temp = isMetric ? current.temp : celsiusToFahrenheit(current.temp);
    const feelsLike = isMetric ? current.feelsLike : celsiusToFahrenheit(current.feelsLike);
    const windSpeed = isMetric ? current.windSpeed : current.windSpeed * 0.621371;
    const windUnit = isMetric ? 'km/h' : 'mph';

    const uvInfo = getUVInfo(current.uvIndex);
    const windEmoji = getWindEmoji(current.windSpeed);

    let text = templates.header(
        'WEATHER',
        `${current.emoji} ${location.name}${location.region ? `, ${location.region}` : ''}\n${location.country}`,
        { style: 'double', width: 30 }
    );

    text += '\n\n' + templates.list(
        'Current Conditions',
        [
            `🌡️ Temperature: *${formatTemp(temp, units)}*`,
            `🤔 Feels like: ${formatTemp(feelsLike, units)}`,
            `📝 ${current.condition}`
        ],
        { bullet: '│', border: 'none' }
    );

    const details = [
        `💧 Humidity: ${current.humidity}%`,
        `${windEmoji} Wind: ${Math.round(windSpeed)} ${windUnit} ${current.windDir || ''}`,
        `📊 Pressure: ${current.pressure} hPa`
    ];

    if (current.visibility) details.push(`👁️ Visibility: ${current.visibility} km`);
    if (current.uvIndex !== undefined) details.push(`☀️ UV Index: ${uvInfo.value} ${uvInfo.emoji} ${uvInfo.label}`);
    if (current.cloudCover !== undefined) details.push(`☁️ Cloud Cover: ${current.cloudCover}%`);

    text += '\n\n' + templates.list('Details', details, { bullet: '│', border: 'none' });

    if (astronomy) {
        const astroDetails = [
            `🌅 Sunrise: ${astronomy.sunrise}`,
            `🌇 Sunset: ${astronomy.sunset}`
        ];
        if (astronomy.moonPhase) {
            astroDetails.push(`${astronomy.moonPhase.emoji} ${astronomy.moonPhase.name}`);
        }
        text += '\n\n' + templates.list('Sun & Moon', astroDetails, { bullet: '│', border: 'none' });
    }

    return text;
}

function formatForecast(data, units = 'C') {
    if (!data.forecast?.length) return '';

    const isMetric = units === 'C';
    const items = data.forecast.map(day => {
        const maxTemp = isMetric ? day.maxTemp : celsiusToFahrenheit(day.maxTemp);
        const minTemp = isMetric ? day.minTemp : celsiusToFahrenheit(day.minTemp);
        let item = `${day.emoji} *${day.day}*: ${formatTemp(minTemp, units)} - ${formatTemp(maxTemp, units)}`;
        if (day.chanceOfRain > 0) item += ` 💧${day.chanceOfRain}%`;
        return item;
    });

    return '\n\n' + templates.list('Forecast', items, { bullet: '│', border: 'none' });
}

function formatHourly(data, units = 'C') {
    if (!data.hourly?.length) return '';

    const isMetric = units === 'C';
    const hours = data.hourly.slice(0, 6);

    const items = hours.map(hour => {
        const temp = isMetric ? hour.temp : celsiusToFahrenheit(hour.temp);
        let item = `${hour.time} ${hour.emoji} ${formatTemp(temp, units)}`;
        if (hour.chanceOfRain > 20) item += ` 💧${hour.chanceOfRain}%`;
        return item;
    });

    return '\n\n' + templates.list('Hourly', items, { bullet: '│', border: 'none' });
}

function formatAlerts(data) {
    if (!data.alerts?.length) return '';

    let text = '\n\n';

    for (const alert of data.alerts.slice(0, 2)) {
        text += templates.warning(`*${alert.event}*\n${alert.description || ''}\n_Until: ${alert.end}_`) + '\n';
    }
    return text;
}

function formatFullWeather(data, options = {}) {
    const { units = 'C', showForecast = true, showHourly = false, showAlerts = true } = options;

    let text = formatCurrentWeather(data, units);

    if (showForecast) {
        text += formatForecast(data, units);
    }

    if (showHourly) {
        text += formatHourly(data, units);
    }

    if (showAlerts) {
        text += formatAlerts(data);
    }

    text += `\n\n───────────────────\n_*Vesperr* ⋆ Weather${data.fromCache ? ' (cached)' : ''}_`;

    return text;
}

export default {
    name: 'weather',
    alias: ['w', 'clima', 'forecast', 'temp'],
    category: 'utility',
    desc: 'Get weather information for any location',
    usage: '.weather <city> | .weather -f <city> | .weather save <city>',
    cooldown: 5000,
    react: '☀️',

    async execute({ sock, msg, args, prefix, db }) {
        const chat = msg.key.remoteJid;
        const user = msg.key.participant || msg.key.remoteJid;

        let showForecast = true;
        let showHourly = false;
        let units = CONFIG.DEFAULT_UNITS === 'metric' ? 'C' : 'F';
        let forceRefresh = false;

        const filteredArgs = args.filter(arg => {
            const lower = arg.toLowerCase();

            if (lower === '-f' || lower === '--forecast') {
                showForecast = true;
                return false;
            }
            if (lower === '-h' || lower === '--hourly') {
                showHourly = true;
                return false;
            }
            if (lower === '-c' || lower === '--celsius') {
                units = 'C';
                return false;
            }
            if (lower === '-fahrenheit' || lower === '--fahrenheit') {
                units = 'F';
                return false;
            }
            if (lower === '-r' || lower === '--refresh') {
                forceRefresh = true;
                return false;
            }

            return true;
        });

        const subcommand = filteredArgs[0]?.toLowerCase();

        if (subcommand === 'save' || subcommand === 'set') {
            const locationToSave = filteredArgs.slice(1).join(' ');

            if (!locationToSave) {
                return sock.sendMessage(chat, {
                    text: templates.error('Usage Error', `Usage: \`${prefix}weather save <city>\`\nExample: \`${prefix}weather save London\``),
                }, { quoted: msg });
            }

            const verifyMsg = await sock.sendMessage(chat, {
                text: '⌕ *Verifying location...*',
            }, { quoted: msg });

            const data = await getWeather(locationToSave);

            if (!data) {
                return sock.sendMessage(chat, {
                    text: templates.error('Location not found', 'Please enter a valid city name.'),
                    edit: verifyMsg.key,
                });
            }

            userLocations.set(user, locationToSave);
            await db?.set?.('userLocations', user, locationToSave);

            return sock.sendMessage(chat, {
                text: templates.success('Location saved!', `📍 ${data.location.name}, ${data.location.country}\n\nNow you can use \`${prefix}weather\` without specifying a location.`),
                edit: verifyMsg.key,
            });
        }

        if (subcommand === 'help' || subcommand === '?') {
            return sock.sendMessage(chat, {
                text: templates.commandHelp({
                    name: 'weather',
                    description: 'Get weather information for any location',
                    usage: '.weather <city>',
                    examples: ['.weather -h Paris', '.weather -f New York'],
                    aliases: ['w', 'clima'],
                    permissions: []
                }, { prefix })
            }, { quoted: msg });
        }

        let location = filteredArgs.join(' ');

        if (!location) {
            location = userLocations.get(user) || await db?.get?.('userLocations', user);

            if (!location) {
                return sock.sendMessage(chat, {
                    text: templates.commandHelp({
                        name: 'weather',
                        description: 'Please specify a location or save one.',
                        usage: '.weather <city>',
                        examples: ['.weather Tokyo'],
                    }, { prefix }),
                }, { quoted: msg });
            }
        }

        const searchMsg = await sock.sendMessage(chat, {
            text: `⌕ *Fetching weather for ${location}...*`,
        }, { quoted: msg });

        const data = await getWeather(location, { forceRefresh });

        if (!data) {
            return sock.sendMessage(chat, {
                text: templates.error('Weather not found', `Could not find weather data for "${location}". Try checking the spelling.`),
                edit: searchMsg.key
            });
        }

        const response = formatFullWeather(data, { units, showForecast, showHourly });

        return sock.sendMessage(chat, {
            text: response,
            edit: searchMsg.key
        });
    }
};
