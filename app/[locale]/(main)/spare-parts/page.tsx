import { redirect } from 'next/navigation';

/** Machines, repairs and spare parts now live on one page. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/machines`);
}
