import {routing} from './routing';
import {getRequestConfig} from 'next-intl/server';

export default getRequestConfig(async ({requestLocale}) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  let messages;
  switch (locale) {
    case 'hi':
      messages = (await import('../messages/hi.json')).default;
      break;
    case 'mr':
      messages = (await import('../messages/mr.json')).default;
      break;
    default:
      messages = (await import('../messages/en.json')).default;
  }

  return {
    locale,
    messages,
    timeZone: 'Asia/Kolkata'
  };
});
