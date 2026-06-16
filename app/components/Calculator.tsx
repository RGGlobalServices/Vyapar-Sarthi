'use client';
import { useState } from 'react';
import { X, Delete } from 'lucide-react';

export default function Calculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');

  const handleNumber = (num: string) => {
    setDisplay(prev => prev === '0' ? num : prev + num);
  };

  const handleOperator = (op: string) => {
    setEquation(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const calculate = () => {
    try {
      const result = Function('"use strict"; return (' + equation + display + ')')();
      setDisplay(String(result));
      setEquation('');
    } catch (e) {
      setDisplay('Error');
    }
  };

  const clear = () => {
    setDisplay('0');
    setEquation('');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-64 shadow-2xl animate-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center mb-4">
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Calculator</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X size={16} />
        </button>
      </div>
      
      <div className="bg-slate-950 rounded-xl p-3 mb-4 text-right overflow-hidden">
        <div className="text-slate-500 text-xs h-4 mb-1">{equation}</div>
        <div className="text-slate-100 text-2xl font-bold truncate">{display}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button onClick={clear} className="col-span-2 bg-slate-800 text-red-400 p-3 rounded-lg font-bold hover:bg-slate-700">AC</button>
        <button onClick={() => setDisplay(prev => prev.slice(0, -1) || '0')} className="bg-slate-800 text-slate-300 p-3 rounded-lg font-bold hover:bg-slate-700 flex justify-center"><Delete size={18}/></button>
        <button onClick={() => handleOperator('/')} className="bg-emerald-500/10 text-emerald-500 p-3 rounded-lg font-bold hover:bg-emerald-500/20">/</button>
        
        {[7, 8, 9].map(n => <button key={n} onClick={() => handleNumber(String(n))} className="bg-slate-800 text-slate-200 p-3 rounded-lg font-bold hover:bg-slate-700">{n}</button>)}
        <button onClick={() => handleOperator('*')} className="bg-emerald-500/10 text-emerald-500 p-3 rounded-lg font-bold hover:bg-emerald-500/20">*</button>
        
        {[4, 5, 6].map(n => <button key={n} onClick={() => handleNumber(String(n))} className="bg-slate-800 text-slate-200 p-3 rounded-lg font-bold hover:bg-slate-700">{n}</button>)}
        <button onClick={() => handleOperator('-')} className="bg-emerald-500/10 text-emerald-500 p-3 rounded-lg font-bold hover:bg-emerald-500/20">-</button>
        
        {[1, 2, 3].map(n => <button key={n} onClick={() => handleNumber(String(n))} className="bg-slate-800 text-slate-200 p-3 rounded-lg font-bold hover:bg-slate-700">{n}</button>)}
        <button onClick={() => handleOperator('+')} className="bg-emerald-500/10 text-emerald-500 p-3 rounded-lg font-bold hover:bg-emerald-500/20">+</button>
        
        <button onClick={() => handleNumber('0')} className="col-span-2 bg-slate-800 text-slate-200 p-3 rounded-lg font-bold hover:bg-slate-700">0</button>
        <button onClick={() => handleNumber('.')} className="bg-slate-800 text-slate-200 p-3 rounded-lg font-bold hover:bg-slate-700">.</button>
        <button onClick={calculate} className="bg-emerald-500 text-slate-900 p-3 rounded-lg font-bold hover:bg-emerald-400">=</button>
      </div>
    </div>
  );
}
