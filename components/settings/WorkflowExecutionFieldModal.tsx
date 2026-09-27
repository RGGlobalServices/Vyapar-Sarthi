'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { X, AlertCircle } from 'lucide-react';

interface Props {
  basePath: string;
  fieldToEdit?: any;
  onClose: () => void;
  onSaved: () => void;
}

const FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DECIMAL',
  'SELECT',
  'MULTI_SELECT',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TEXTAREA',
  'MACHINE',
  'OPERATOR',
  'PRODUCT',
  'GODOWN',
  'LOT',
];

export default function WorkflowExecutionFieldModal({
  basePath,
  fieldToEdit,
  onClose,
  onSaved,
}: Props) {
  const isEditing = !!fieldToEdit;

  const [fieldCode, setFieldCode] = useState(fieldToEdit?.fieldCode || '');
  const [fieldName, setFieldName] = useState(fieldToEdit?.fieldName || '');
  const [description, setDescription] = useState(fieldToEdit?.description || '');
  const [fieldType, setFieldType] = useState(fieldToEdit?.fieldType || 'TEXT');
  const [unit, setUnit] = useState(fieldToEdit?.unit || '');
  const [isRequired, setIsRequired] = useState(fieldToEdit?.isRequired ?? false);
  const [isActive, setIsActive] = useState(fieldToEdit?.isActive ?? true);
  const [sequence, setSequence] = useState(fieldToEdit?.sequence ?? 1);
  const [defaultValue, setDefaultValue] = useState(fieldToEdit?.defaultValue || '');
  const [placeholder, setPlaceholder] = useState(fieldToEdit?.placeholder || '');
  const [helpText, setHelpText] = useState(fieldToEdit?.helpText || '');
  const [section, setSection] = useState(fieldToEdit?.section || '');
  const [optionsStr, setOptionsStr] = useState<string>(() => {
    if (fieldToEdit?.options) {
      if (Array.isArray(fieldToEdit.options)) return fieldToEdit.options.join(', ');
      if (typeof fieldToEdit.options === 'string') return fieldToEdit.options;
    }
    return '';
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let parsedOptions: string[] | null = null;
    if (fieldType === 'SELECT' || fieldType === 'MULTI_SELECT') {
      if (optionsStr.trim()) {
        parsedOptions = optionsStr
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    const payload = {
      fieldCode: fieldCode.trim(),
      fieldName: fieldName.trim(),
      description: description.trim() || null,
      fieldType,
      unit: unit.trim() || null,
      isRequired,
      isActive,
      sequence: Number(sequence) || 0,
      defaultValue: defaultValue.trim() || null,
      placeholder: placeholder.trim() || null,
      helpText: helpText.trim() || null,
      section: section.trim() || null,
      options: parsedOptions,
    };

    try {
      if (isEditing) {
        await api.put(`${basePath}/execution-config/${fieldToEdit.id}`, payload);
      } else {
        await api.post(`${basePath}/execution-config`, payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save field configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {isEditing ? 'Edit Execution Field' : 'Add Execution Field'}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-center rounded-lg bg-red-50 p-3 text-xs text-red-600 border border-red-200">
            <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Field Code *
              </label>
              <input
                type="text"
                required
                value={fieldCode}
                onChange={(e) => setFieldCode(e.target.value)}
                placeholder="e.g. bag_size"
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Field Name *
              </label>
              <input
                type="text"
                required
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="e.g. Bag Size"
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Field Type *
              </label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Unit (Optional)
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. Kg, Bags, Pcs"
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sequence
              </label>
              <input
                type="number"
                min="0"
                value={sequence}
                onChange={(e) => setSequence(Number(e.target.value))}
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Section (Optional)
              </label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. Packaging, Resources"
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
          </div>

          {(fieldType === 'SELECT' || fieldType === 'MULTI_SELECT') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Options (comma or newline separated) *
              </label>
              <textarea
                rows={2}
                value={optionsStr}
                onChange={(e) => setOptionsStr(e.target.value)}
                placeholder="e.g. HDPE Bag, PP Bag, Jute Bag"
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Placeholder
              </label>
              <input
                type="text"
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                placeholder="e.g. Enter bag size in Kg"
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Default Value
              </label>
              <input
                type="text"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Description / Help Text
            </label>
            <input
              type="text"
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              placeholder="e.g. Specify net weight per bag"
              className="mt-1 w-full rounded border px-3 py-1.5 text-sm dark:bg-slate-800"
            />
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="rounded"
              />
              Is Required
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded"
              />
              Is Active
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
