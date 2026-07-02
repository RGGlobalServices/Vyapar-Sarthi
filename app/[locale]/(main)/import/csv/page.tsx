'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';

export default function BulkCSVImport() {
  const { profile } = useBusinessStore();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('products');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (profile.subscriptionPlan !== 'wholesale') {
    return <div className="p-10 text-center">Udyog Plan Required for Bulk ERP Imports</div>;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      const res = await api.post('/import/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult({ success: true, count: res.data.count, message: res.data.message });
    } catch (err: any) {
      console.error(err);
      setResult({ success: false, message: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const getTemplateUrl = () => {
    // Generate empty template headers
    let headers = '';
    if (type === 'products') headers = 'name,brand,category,sku,barcode,hsnCode,gstPercent,mrp,sellingPrice,wholesaleCost,baseUnit,productType\nExample Product,Tata,Grocery,SKU001,123456,1234,5,100,90,80,PCS,single';
    if (type === 'suppliers') headers = 'name,contact,mobile,email,address,gst,balance\nExample Supplier,Rahul,9876543210,test@abc.com,Address,27AABC,1000';
    if (type === 'purchases') headers = 'supplierMobile,invoiceNumber,date,totalAmount,paymentType,items(JSON)\n9876543210,INV-123,2024-01-01,1000,Cash,[{"productSku":"SKU001","qty":10,"cost":80}]';
    if (type === 'stock') headers = 'productSku,batchNumber,quantity,mfgDate,expiryDate\nSKU001,B123,50,2024-01-01,2025-01-01';

    const blob = new Blob([headers], { type: 'text/csv' });
    return URL.createObjectURL(blob);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <FileSpreadsheet className="text-emerald-400" /> ERP CSV Import
        </h1>
        <p className="text-slate-400 text-sm mt-1">Bulk import your master data and transactions via CSV.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4 space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Import Type</label>
              {[
                { id: 'products', label: 'Products Master' },
                { id: 'suppliers', label: 'Suppliers Master' },
                { id: 'stock', label: 'Stock / Batches' },
                { id: 'purchases', label: 'Purchase Invoices' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setType(opt.id); setFile(null); setResult(null); }}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition-colors ${type === opt.id ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </CardContent>
          </Card>
          
          <a
            href={getTemplateUrl()}
            download={`${type}_template.csv`}
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-bold rounded-xl transition-colors"
          >
            Download {type} Template
          </a>
        </div>

        <div className="md:col-span-2">
          <Card className="bg-slate-900 border-slate-800 h-full">
            <CardContent className="p-8 flex flex-col items-center justify-center h-full min-h-[300px] text-center border-2 border-dashed border-slate-700 rounded-xl m-4 bg-slate-900/50 hover:bg-slate-800/50 transition-colors">
              {!file ? (
                <>
                  <Upload size={48} className="text-emerald-500/50 mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Upload {type} CSV</h3>
                  <p className="text-sm text-slate-400 mb-6 max-w-sm">Ensure your CSV matches the template structure exactly. First row must be headers.</p>
                  <label className="cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
                    Select File
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                  </label>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={48} className="text-emerald-400 mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">{file.name}</h3>
                  <p className="text-sm text-slate-400 mb-6">{(file.size / 1024).toFixed(1)} KB</p>
                  
                  {result ? (
                    <div className={`p-4 rounded-xl mb-6 w-full ${result.success ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'}`}>
                      {result.success ? (
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle size={24} />
                          <p className="font-bold">Successfully imported {result.count} records!</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <AlertTriangle size={24} />
                          <p className="font-bold">Import Failed</p>
                          <p className="text-xs opacity-80">{result.message}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <button onClick={() => setFile(null)} disabled={loading} className="px-6 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-50">
                        Cancel
                      </button>
                      <button onClick={handleUpload} disabled={loading} className="px-6 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50">
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                        Start Import
                      </button>
                    </div>
                  )}
                  {result && (
                    <button onClick={() => { setFile(null); setResult(null); }} className="mt-4 text-emerald-400 font-bold hover:underline">
                      Import Another File
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
