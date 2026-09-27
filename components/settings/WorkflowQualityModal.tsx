'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { X } from 'lucide-react';

export default function WorkflowQualityModal({ basePath, onClose, onSaved }: { basePath: string, onClose: () => void, onSaved: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    parameterName: '',
    parameterCode: '',
    dataType: 'NUMBER',
    unit: '',
    minValue: '',
    maxValue: '',
    targetValue: '',
    isRequired: true,
    isCritical: false,
    failureAction: 'WARNING',
    instructions: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post(`${basePath}/quality`, form);
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
      <div className="bg-white rounded-xl shadow-lg w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Add Quality Parameter</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto">
          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded border border-red-200">{error}</div>}
          <form id="quality-form" onSubmit={handleSubmit} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Parameter Name</label>
                <input 
                  type="text" required
                  value={form.parameterName} 
                  onChange={(e) => setForm({...form, parameterName: e.target.value})}
                  className="w-full border rounded-lg p-2"
                  placeholder="e.g. Moisture"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Code (Optional)</label>
                <input 
                  type="text"
                  value={form.parameterCode} 
                  onChange={(e) => setForm({...form, parameterCode: e.target.value})}
                  className="w-full border rounded-lg p-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Data Type</label>
                <select 
                  value={form.dataType} 
                  onChange={(e) => {
                    const dt = e.target.value;
                    setForm({...form, dataType: dt, minValue: '', maxValue: '', targetValue: ''});
                  }}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="NUMBER">NUMBER</option>
                  <option value="TEXT">TEXT</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="ENUM">ENUM</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Failure Action</label>
                <select 
                  value={form.failureAction} 
                  onChange={(e) => setForm({...form, failureAction: e.target.value})}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="WARNING">WARNING</option>
                  <option value="HOLD">HOLD</option>
                  <option value="REJECT">REJECT</option>
                </select>
              </div>
            </div>

            {form.dataType === 'NUMBER' && (
              <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg bg-slate-50">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Min Value</label>
                  <input 
                    type="number" step="any"
                    value={form.minValue} 
                    onChange={(e) => setForm({...form, minValue: e.target.value})}
                    className="w-full border rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Max Value</label>
                  <input 
                    type="number" step="any"
                    value={form.maxValue} 
                    onChange={(e) => setForm({...form, maxValue: e.target.value})}
                    className="w-full border rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Target</label>
                  <input 
                    type="number" step="any"
                    value={form.targetValue} 
                    onChange={(e) => setForm({...form, targetValue: e.target.value})}
                    className="w-full border rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                  <input 
                    type="text"
                    value={form.unit} 
                    onChange={(e) => setForm({...form, unit: e.target.value})}
                    className="w-full border rounded-md p-1.5 text-sm"
                    placeholder="e.g. %"
                  />
                </div>
              </div>
            )}

            {form.dataType !== 'NUMBER' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Value</label>
                  <input 
                    type="text"
                    value={form.targetValue} 
                    onChange={(e) => setForm({...form, targetValue: e.target.value})}
                    className="w-full border rounded-lg p-2"
                    placeholder={form.dataType === 'BOOLEAN' ? 'TRUE / FALSE' : ''}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" id="qIsRequired" 
                  checked={form.isRequired}
                  onChange={(e) => setForm({...form, isRequired: e.target.checked})}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="qIsRequired" className="text-sm font-medium text-slate-700">Required Test</label>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" id="qIsCritical" 
                  checked={form.isCritical}
                  onChange={(e) => setForm({...form, isCritical: e.target.checked})}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                />
                <label htmlFor="qIsCritical" className="text-sm font-medium text-red-600">Critical Parameter</label>
              </div>
            </div>
            
          </form>
        </div>
        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-slate-600 font-medium hover:bg-slate-100">Cancel</button>
          <button form="quality-form" type="submit" disabled={loading} className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 shadow-sm disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Quality Parameter'}
          </button>
        </div>
      </div>
    </div>
  );
}
