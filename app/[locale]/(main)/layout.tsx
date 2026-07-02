import MainLayoutClient from '@/components/MainLayoutClient';

export default async function MainLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <MainLayoutClient locale={locale}>
      {children}
    </MainLayoutClient>
  );
}
