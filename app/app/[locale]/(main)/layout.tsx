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
    <div className="flex min-h-screen" suppressHydrationWarning>
      <MainLayoutClient locale={locale}>
        {children}
      </MainLayoutClient>
    </div>
  );
}
