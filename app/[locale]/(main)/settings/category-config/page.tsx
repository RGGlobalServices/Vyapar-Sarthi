import CategoryConfigModule from '@/components/settings/CategoryConfigModule';

export const metadata = {
  title: 'Category Config - Vyapar Sarthi'
};

export default function CategoryConfigPage() {
  return (
    <div className="h-full bg-slate-50/50 dark:bg-slate-950/50 overflow-y-auto">
      <CategoryConfigModule />
    </div>
  );
}
