'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import api from '@/lib/api';


export default function MasterDataPage() {
  const t = useTranslations('MasterData');
  const [activeTab, setActiveTab] = useState<'categories' | 'brands' | 'units'>('categories');
  const tabLabel: Record<string, string> = { categories: t('categoriesTab'), brands: t('brandsTab'), units: t('unitsTab') };
  const singularLabel: Record<string, string> = { categories: t('categorySingular'), brands: t('brandSingular'), units: t('unitSingular') };
  const [data, setData] = useState<any>({ categories: [], brands: [], units: [] });
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [conversionFactor, setConversionFactor] = useState(1);
  const [baseUnitId, setBaseUnitId] = useState('');
  const [isManufacturer, setIsManufacturer] = useState(false);

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      const res = await api.get('/master-data');
      setData(res.data);
    } catch (e) {
      toast.error(t('failedToLoadMasterData'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error(t('nameRequired'));

    const payload: any = { type: activeTab, name };

    if (activeTab === 'brands') payload.manufacturer = isManufacturer;
    if (activeTab === 'units') {
      if (!shortName) return toast.error(t('shortNameRequired'));
      payload.shortName = shortName;
      payload.baseUnitId = baseUnitId || null;
      payload.conversionFactor = conversionFactor;
    }

    try {
      await api.post('/master-data', payload);
      toast.success(t('createdSuccessfully', { type: tabLabel[activeTab] }));
      setName('');
      setShortName('');
      setConversionFactor(1);
      setBaseUnitId('');
      setIsManufacturer(false);
      fetchMasterData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || t('failedToCreate'));
    }
  };

  const handleDelete = async (id: string, type: string) => {
    if (!confirm(t('confirmDeleteItem'))) return;
    try {
      await api.delete(`/master-data?type=${type}&id=${id}`);
      toast.success(t('deletedSuccessfully'));
      fetchMasterData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || t('failedToDelete'));
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{t('pageTitle')}</h1>
        <p className="text-slate-500">{t('pageSubtitle')}</p>
      </div>

      <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 pb-px">
        {['categories', 'brands', 'units'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 font-medium text-sm transition-colors relative ${
              activeTab === tab
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tabLabel[tab]}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500 rounded-t-md" />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 shadow-sm h-fit">
          <CardHeader>
            <CardTitle>{t('createEntry', { type: singularLabel[activeTab] })}</CardTitle>
            <CardDescription>{t('addEntryHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('nameLabel')}</label>
                <input className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300" value={name} onChange={(e: any) => setName(e.target.value)} required placeholder={t('namePlaceholder')} />
              </div>

              {activeTab === 'brands' && (
                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="isManufacturer"
                    checked={isManufacturer}
                    onChange={(e) => setIsManufacturer(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="isManufacturer" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t('isManufacturer')}</label>
                </div>
              )}

              {activeTab === 'units' && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('shortNameLabel')}</label>
                    <input className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300" value={shortName} onChange={(e: any) => setShortName(e.target.value)} required placeholder={t('shortNamePlaceholder')} />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('baseUnitLabel')}</label>
                    <select
                      value={baseUnitId}
                      onChange={(e) => setBaseUnitId(e.target.value)}
                      className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    >
                      <option value="">{t('noneBaseUnit')}</option>
                      {data.units.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.shortName})</option>
                      ))}
                    </select>
                  </div>
                  {baseUnitId && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('conversionFactorLabel')}</label>
                      <input
                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={conversionFactor}
                        onChange={(e: any) => setConversionFactor(Number(e.target.value))}
                        required
                        placeholder={t('conversionFactorPlaceholder')}
                      />
                      <p className="text-xs text-slate-500">
                        {t('conversionPreview', { name: name || t('newUnit'), factor: conversionFactor, baseUnit: data.units.find((u:any) => u.id === baseUnitId)?.name || t('baseUnitFallback') })}
                      </p>
                    </div>
                  )}
                </>
              )}

              <button type="submit" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-emerald-600 text-slate-50 hover:bg-emerald-700 h-10 px-4 py-2 w-full">
                <Plus size={16} className="mr-2" />
                {t('addEntryBtn')}
              </button>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>{t('existingEntries', { type: tabLabel[activeTab] })}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-slate-500">{t('loadingText')}</div>
            ) : data[activeTab].length === 0 ? (
              <div className="py-8 text-center text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                {t('noEntriesFound')}
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t('nameHeader')}</th>
                      {activeTab === 'brands' && <th className="px-4 py-3 font-medium">{t('typeHeader')}</th>}
                      {activeTab === 'units' && (
                        <>
                          <th className="px-4 py-3 font-medium">{t('shortNameHeader')}</th>
                          <th className="px-4 py-3 font-medium">{t('conversionHeader')}</th>
                        </>
                      )}
                      <th className="px-4 py-3 font-medium text-right">{t('actionsHeader')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data[activeTab].map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.name}</td>
                        {activeTab === 'brands' && (
                          <td className="px-4 py-3 text-slate-500">
                            {item.manufacturer ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                {t('manufacturerBadge')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                {t('brandBadge')}
                              </span>
                            )}
                          </td>
                        )}
                        {activeTab === 'units' && (
                          <>
                            <td className="px-4 py-3 text-slate-500">{item.shortName}</td>
                            <td className="px-4 py-3 text-slate-500">
                              {item.baseUnitId ? `1 = ${item.conversionFactor} ${item.baseUnit?.shortName}` : t('baseUnitFallback')}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDelete(item.id, activeTab.slice(0, -1))}
                            className="text-red-500 hover:text-red-700 transition-colors p-1"
                            title={t('deleteTitle')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
