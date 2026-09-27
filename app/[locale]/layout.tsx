import { getMessages, getTimeZone } from 'next-intl/server';
import Providers from '@/components/Providers';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <Providers locale={locale} messages={messages} timeZone={timeZone}>
      {children}
    </Providers>
  );
}
