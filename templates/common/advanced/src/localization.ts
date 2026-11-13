import { defineLocalizationResolver, interpolate } from '@sxnnyside/circe';

const translations: Record<string, Record<string, string>> = {
  'en-US': {
    'ping.reply': '🏓 Pong! Latency: {latency}ms',
  },
  es: {
    'ping.reply': '🏓 ¡Pong! Latencia: {latency}ms',
  },
};

export default defineLocalizationResolver({
  resolve(key, locale, params) {
    const lang = locale.startsWith('es') ? 'es' : 'en-US';
    const template = translations[lang]?.[key] ?? translations['en-US']?.[key] ?? key;
    return interpolate(template, params);
  },
});
