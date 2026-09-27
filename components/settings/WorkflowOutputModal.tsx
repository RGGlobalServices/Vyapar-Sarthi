'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { X } from 'lucide-react';

export default function WorkflowOutputModal({ basePath, onClose, onSaved }: { basePath: string, onClose: () => void, onSaved: () => void }) {
  const { data: products } = useSWR('/api/v1/products');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    productId: '',
    outputType: 'WIP',
    quantityRuleType: 'FIXED',
    quantityValue: '',
    unit: 'Kg',
    expectedQuantity: '',
    minimumQuantity: '',
    maximumQuantity: '',
    tolerancePercent: '',
    isRequired: true,
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post(`${basePath}/outputs`, form);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Add Stage Output</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto">
          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded border border-red-200">{error}</div>}
          <form id="output-form" onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
              <select 
                required 
                value={form.productId} 
                onChange={(e) => setForm({...form, productId: e.target.value})}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Product...</option>
                {products?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Output Type</label>
                <select 
                  value={form.outputType} 
                  onChange={(e) => setForm({...form, outputType: e.target.value})}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="WIP">WIP</option>
                  <option value="FINISHED_GOOD">FINISHED GOOD</option>
                  <option value="BY_PRODUCT">BY-PRODUCT</option>
                  <option value="REJECTION">REJECTION</option>
                  <option value="WASTE">WASTE</option>
                  <option value="REPROCESS">REPROCESS</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity Rule</label>
                <select 
                  value={form.quantityRuleType} 
                  onChange={(e) => setForm({...form, quantityRuleType: e.target.value})}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="FIXED">FIXED</option>
                  <option value="PERCENTAGE_OF_INPUT">PERCENTAGE OF INPUT</option>
                  <option value="PERCENTAGE_LOSS">PERCENTAGE LOSS</option>
                  <option value="REMAINING">REMAINING</option>
                  <option value="MANUAL">MANUAL</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
                <input 
                  type="number" step="any"
                  required={['FIXED', 'PERCENTAGE_OF_INPUT', 'PERCENTAGE_LOSS'].includes(form.quantityRuleType)}
                  disabled={['REMAINING', 'MANUAL'].includes(form.quantityRuleType)}
                  value={form.quantityValue} 
                  onChange={(e) => setForm({...form, quantityValue: e.target.value})}
                  className="w-full border rounded-lg p-2 disabled:bg-slate-100"
                  placeholder={form.quantityRuleType.includes('PERCENTAGE') ? '%' : 'Qty'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                <input 
                  type="text" required
                  value={form.unit} 
                  onChange={(e) => setForm({...form, unit: e.target.value})}
                  className="w-full border rounded-lg p-2"
                  placeholder="e.g. Kg, Bag"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg bg-slate-50">
              <div className="col-span-4 font-medium text-slate-700 text-sm border-b pb-2 mb-2">Tolerance Limits (Optional)</div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Expected</label>
                <input 
                  type="number" step="any"
                  value={form.expectedQuantity} 
                  onChange={(e) => setForm({...form, expectedQuantity: e.target.value})}
                  className="w-full border rounded-md p-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Minimum</label>
                <input 
                  type="number" step="any"
                  value={form.minimumQuantity} 
                  onChange={(e) => setForm({...form, minimumQuantity: e.target.value})}
                  className="w-full border rounded-md p-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Maximum</label>
                <input 
                  type="number" step="any"
                  value={form.maximumQuantity} 
                  onChange={(e) => setForm({...form, maximumQuantity: e.target.value})}
                  className="w-full border rounded-md p-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tolerance %</label>
                <input 
                  type="number" step="any"
                  value={form.tolerancePercent} 
                  onChange={(e) => setForm({...form, tolerancePercent: e.target.value})}
                  className="w-full border rounded-md p-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input 
                type="checkbox" id="outIsRequired" 
                checked={form.isRequired}
                onChange={(e) => setForm({...form, isRequired: e.target.checked})}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <label htmlFor="outIsRequired" className="text-sm font-medium text-slate-700">Required Output</label>
            </div>
            
          </form>
        </div>
        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-slate-600 font-medium hover:bg-slate-100">Cancel</button>
          <button form="output-form" type="submit" disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-sm disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Output'}
          </button>
        </div>
      </div>
    </div>
  );
}
