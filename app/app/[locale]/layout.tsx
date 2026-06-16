import { getMessages, getTimeZone } from 'next-intl/server';
import Providers from '@/components/Providers';

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
