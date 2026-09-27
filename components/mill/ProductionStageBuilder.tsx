'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, GripVertical, Search, Check, ChevronUp, ChevronDown, Sparkles, Bookmark, Layers } from 'lucide-react';
import api from '@/lib/api';

const STANDARD_LIBRARY = [
  'Cleaning',
  'Grading',
  'Dehusking',
  'Sorting',
  'Destoning',
  'Milling',
  'Grinding',
  'Sieving',
  'Washing',
  'Drying',
  'Filtration',
  'Processing',
  'Quality Check',
  'Packing',
  'Filling',
  'Assembly',
  'Cutting',
  'Inspection',
];

export function getProductSmartSuggestions(productName?: string): string[] {
  if (!productName) return ['Cleaning', 'Processing', 'Quality Check', 'Packing'];
  const p = productName.toLowerCase();
  if (p.includes('bhagar')) return ['Cleaning', 'Grading', 'Dehusking', 'Sorting', 'Packing'];
  if (p.includes('rice') || p.includes('paddy')) return ['Cleaning', 'Destoning', 'Milling', 'Grading', 'Sorting', 'Packing'];
  if (p.includes('wheat')) return ['Cleaning', 'Destoning', 'Grinding', 'Sieving', 'Quality Check', 'Packing'];
  if (p.includes('oil')) return ['Filtration', 'Processing', 'Quality Check', 'Filling', 'Packing'];
  if (p.includes('dal') || p.includes('pulse')) return ['Cleaning', 'Dehusking', 'Splitting', 'Grading', 'Polishing', 'Packing'];
  if (p.includes('flour') || p.includes('atta') || p.includes('maida') || p.includes('sooji')) return ['Cleaning', 'Destoning', 'Grinding', 'Sieving', 'Packing'];
  if (p.includes('spice') || p.includes('masala') || p.includes('chilli') || p.includes('turmeric')) return ['Cleaning', 'Drying', 'Grinding', 'Sieving', 'Packing'];
  if (p.includes('sugar')) return ['Crushing', 'Filtration', 'Crystallization', 'Grading', 'Packing'];
  return ['Cleaning', 'Processing', 'Quality Check', 'Packing'];
}

interface Props {
  productId?: string;
  productName?: string;
  selectedStages: string[];
  onChange: (stages: string[]) => void;
  saveAsDefault: boolean;
  onSaveAsDefaultChange: (save: boolean) => void;
  isLoadingTemplate?: boolean;
  isTemplateLoaded?: boolean;
}

export default function ProductionStageBuilder({
  productId,
  productName,
  selectedStages,
  onChange,
  saveAsDefault,
  onSaveAsDefaultChange,
  isLoadingTemplate = false,
  isTemplateLoaded = false,
}: Props) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStageName, setCustomStageName] = useState('');
  const [customStageDesc, setCustomStageDesc] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [customLibrary, setCustomLibrary] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Load custom stages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('vyapar_custom_production_stages');
      if (stored) {
        setCustomLibrary(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  const fullLibrary = Array.from(new Set([...STANDARD_LIBRARY, ...customLibrary]));
  const smartSuggestions = getProductSmartSuggestions(productName);

  const addStage = (stageName: string) => {
    const trimmed = stageName.trim();
    if (!trimmed) return;
    if (selectedStages.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...selectedStages, trimmed]);
  };

  const removeStage = (index: number) => {
    onChange(selectedStages.filter((_, i) => i !== index));
  };

  const moveStage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= selectedStages.length) return;
    const updated = [...selectedStages];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    onChange(updated);
  };

  const handleAddCustomStage = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    const name = customStageName.trim();
    if (!name) return;

    addStage(name);

    if (saveToLibrary) {
      const existsInCustom = customLibrary.some((c) => c.toLowerCase() === name.toLowerCase());
      if (!existsInCustom) {
        const updated = [...customLibrary, name];
        setCustomLibrary(updated);
        try {
          localStorage.setItem('vyapar_custom_production_stages', JSON.stringify(updated));
        } catch (err) {
          // Ignore
        }
      }
    }

    setCustomStageName('');
    setCustomStageDesc('');
    setShowCustomModal(false);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    moveStage(draggedIndex, targetIndex);
    setDraggedIndex(null);
  };

  const filteredLibrary = fullLibrary.filter(
    (stage) =>
      stage.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedStages.some((s) => s.toLowerCase() === stage.toLowerCase())
  );

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-100">
      {/* Header & Badges */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
          <Layers size={14} className="text-amber-500" />
          Production Stages
        </label>
        {isTemplateLoaded && !isLoadingTemplate && (
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1">
            <Check size={10} /> Product Master Template
          </span>
        )}
      </div>

      {/* Suggested Chips */}
      {smartSuggestions.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
            <Sparkles size={12} className="text-amber-500" />
            Suggested for {productName || 'Raw Material'}:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {smartSuggestions.map((stg) => {
              const isAdded = selectedStages.some((s) => s.toLowerCase() === stg.toLowerCase());
              return (
                <button
                  key={stg}
                  type="button"
                  onClick={() => (isAdded ? null : addStage(stg))}
                  disabled={isAdded}
                  className={`text-xs px-2.5 py-1 rounded-lg transition flex items-center gap-1 font-medium ${
                    isAdded
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-transparent'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 hover:shadow-sm'
                  }`}
                >
                  {isAdded ? <Check size={12} /> : <Plus size={12} />}
                  {stg}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Stages List */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center justify-between">
          <span>Selected Workflow Sequence ({selectedStages.length})</span>
          <span className="text-[10px] text-slate-400 font-normal">Drag ☰ or use arrows to reorder</span>
        </span>

        {selectedStages.length === 0 ? (
          <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/20">
            No stages added yet. Pick from suggestions above or click <b>+ Add Stage</b>.
          </div>
        ) : (
          <div className="space-y-1.5">
            {selectedStages.map((stageName, idx) => (
              <div
                key={`${stageName}-${idx}`}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                className={`flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition hover:border-slate-300 dark:hover:border-slate-700 ${
                  draggedIndex === idx ? 'opacity-40 border-amber-500 border-dashed' : ''
                }`}
              >
                {/* Drag Handle */}
                <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <GripVertical size={16} />
                </div>

                {/* Sequence Number */}
                <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-black flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>

                {/* Stage Name */}
                <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {stageName}
                </span>

                {/* Reorder Buttons */}
                <div className="flex items-center gap-0.5 border-r border-slate-200 dark:border-slate-800 pr-1.5 mr-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveStage(idx, idx - 1)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === selectedStages.length - 1}
                    onClick={() => moveStage(idx, idx + 1)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={() => removeStage(idx)}
                  className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                  title="Remove stage"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons: Add Stage & Add Custom Stage */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setShowLibrary(!showLibrary)}
          className="flex-1 h-9 px-3 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-bold rounded-xl border border-amber-200 dark:border-amber-800/80 transition flex items-center justify-center gap-1.5"
        >
          <Plus size={14} />
          {showLibrary ? 'Close Stage Library' : '+ Add Stage from Library'}
        </button>

        <button
          type="button"
          onClick={() => setShowCustomModal(true)}
          className="h-9 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 transition flex items-center justify-center gap-1.5"
        >
          <Plus size={14} />
          + Custom Stage
        </button>
      </div>

      {/* Searchable Library Panel */}
      {showLibrary && (
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg space-y-2.5 animate-in fade-in duration-150">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search stage library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-amber-500"
            />
          </div>

          <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1.5 p-1">
            {filteredLibrary.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 w-full text-center">No matching stages found.</p>
            ) : (
              filteredLibrary.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => addStage(stage)}
                  className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-500 dark:hover:text-white text-slate-700 dark:text-slate-200 rounded-lg transition font-medium flex items-center gap-1"
                >
                  <Plus size={12} />
                  {stage}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Custom Stage Dialog */}
      {showCustomModal && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus size={16} className="text-amber-500" />
                Add Custom Production Stage
              </h3>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Stage Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Quality Inspection"
                  value={customStageName}
                  onChange={(e) => setCustomStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomStage(e);
                    }
                  }}
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-amber-500"
                  maxLength={60}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Description <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Checks moisture and impurity levels"
                  value={customStageDesc}
                  onChange={(e) => setCustomStageDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomStage(e);
                    }
                  }}
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-amber-500"
                  maxLength={120}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="saveToLibrary"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="saveToLibrary" className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer flex items-center gap-1">
                  <Bookmark size={12} className="text-amber-500" />
                  Save to Stage Library for future reuse
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomStage}
                  className="px-4 h-9 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md transition"
                >
                  Add Stage
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save as Default Workflow Checkbox */}
      {productId && productName && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => onSaveAsDefaultChange(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
              Save this workflow as default template for <b>{productName}</b>
            </span>
          </label>
          <p className="text-[10px] text-slate-400 ml-6 mt-0.5">
            Future production batches for {productName} will automatically suggest this stage sequence.
          </p>
        </div>
      )}
    </div>
  );
}
