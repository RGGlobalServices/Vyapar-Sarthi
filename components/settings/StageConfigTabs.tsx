'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { Plus, Trash2, Edit2, AlertCircle } from 'lucide-react';
import WorkflowInputModal from './WorkflowInputModal';
import WorkflowOutputModal from './WorkflowOutputModal';
import WorkflowQualityModal from './WorkflowQualityModal';
import WorkflowExecutionFieldModal from './WorkflowExecutionFieldModal';

interface Props {
  workflowId: string;
  versionId: string;
  stage: any;
  isReadOnly: boolean;
}

export default function StageConfigTabs({ workflowId, versionId, stage, isReadOnly }: Props) {
  const [activeTab, setActiveTab] = useState<'stage' | 'inputs' | 'outputs' | 'quality' | 'execution'>('execution');

  const stageId = stage.id;
  const basePath = `/api/v1/mill/workflows/${workflowId}/versions/${versionId}/stages/${stageId}`;

  const { data: inputs, mutate: mutateInputs } = useSWR(`${basePath}/inputs`);
  const { data: outputs, mutate: mutateOutputs } = useSWR(`${basePath}/outputs`);
  const { data: quality, mutate: mutateQuality } = useSWR(`${basePath}/quality`);
  const { data: executionFields, mutate: mutateExecutionFields } = useSWR(`${basePath}/execution-config`);

  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [outputModalOpen, setOutputModalOpen] = useState(false);
  const [qualityModalOpen, setQualityModalOpen] = useState(false);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [fieldToEdit, setFieldToEdit] = useState<any | null>(null);

  const handleDeleteInput = async (id: string) => {
    if (!confirm('Delete input?')) return;
    await api.delete(`${basePath}/inputs/${id}`);
    mutateInputs();
  };

  const handleDeleteOutput = async (id: string) => {
    if (!confirm('Delete output?')) return;
    await api.delete(`${basePath}/outputs/${id}`);
    mutateOutputs();
  };

  const handleDeleteQuality = async (id: string) => {
    if (!confirm('Delete quality parameter?')) return;
    await api.delete(`${basePath}/quality/${id}`);
    mutateQuality();
  };

  const handleDeleteExecutionField = async (id: string) => {
    if (!confirm('Delete execution field configuration?')) return;
    await api.delete(`${basePath}/execution-config/${id}`);
    mutateExecutionFields();
  };

  const handleToggleActiveExecutionField = async (field: any) => {
    await api.put(`${basePath}/execution-config/${field.id}`, { isActive: !field.isActive });
    mutateExecutionFields();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b bg-white">
        {[
          { key: 'execution', label: 'Execution Details' },
          { key: 'inputs', label: 'Inputs' },
          { key: 'outputs', label: 'Outputs' },
          { key: 'quality', label: 'Quality' },
          { key: 'stage', label: 'Stage Info' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
        {/* EXECUTION DETAILS TAB */}
        {activeTab === 'execution' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-lg text-slate-800">Execution Details Fields</h3>
                <p className="text-xs text-slate-500">
                  Configure custom stage-specific fields auto-rendered during batch execution.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  onClick={() => {
                    setFieldToEdit(null);
                    setExecutionModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded shadow-sm text-sm font-medium flex items-center hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Field
                </button>
              )}
            </div>

            {executionFields?.length > 0 ? (
              <table className="w-full border rounded-lg bg-white overflow-hidden text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium text-slate-600">Seq</th>
                    <th className="p-3 text-left font-medium text-slate-600">Field Name</th>
                    <th className="p-3 text-left font-medium text-slate-600">Code</th>
                    <th className="p-3 text-left font-medium text-slate-600">Type</th>
                    <th className="p-3 text-left font-medium text-slate-600">Section</th>
                    <th className="p-3 text-center font-medium text-slate-600">Required</th>
                    <th className="p-3 text-center font-medium text-slate-600">Active</th>
                    {!isReadOnly && <th className="p-3 text-right font-medium text-slate-600">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {executionFields.map((f: any) => (
                    <tr key={f.id} className="border-b last:border-b-0 hover:bg-slate-50/50">
                      <td className="p-3 text-slate-500">{f.sequence}</td>
                      <td className="p-3 font-medium text-slate-800">
                        {f.fieldName}
                        {f.unit && <span className="ml-1 text-xs text-slate-400">({f.unit})</span>}
                      </td>
                      <td className="p-3 font-mono text-xs text-indigo-600">{f.fieldCode}</td>
                      <td className="p-3">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-semibold">
                          {f.fieldType}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{f.section || 'Default'}</td>
                      <td className="p-3 text-center">
                        {f.isRequired ? (
                          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded font-bold">
                            Yes
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">No</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleToggleActiveExecutionField(f)}
                          className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${
                            f.isActive
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {f.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      {!isReadOnly && (
                        <td className="p-3 text-right space-x-1">
                          <button
                            onClick={() => {
                              setFieldToEdit(f);
                              setExecutionModalOpen(true);
                            }}
                            className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteExecutionField(f.id)}
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center border rounded-lg border-dashed bg-white">
                <p className="text-slate-500 mb-3">No dynamic execution fields configured for this stage.</p>
                {!isReadOnly && (
                  <button
                    onClick={() => {
                      setFieldToEdit(null);
                      setExecutionModalOpen(true);
                    }}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-sm font-medium"
                  >
                    + Add Field
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* STAGE TAB */}
        {activeTab === 'stage' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-slate-800">Stage Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border rounded-lg bg-white">
                <div className="text-xs text-slate-500 mb-1">Process Stage</div>
                <div className="font-medium">{stage.processStage?.name}</div>
              </div>
              <div className="p-3 border rounded-lg bg-white">
                <div className="text-xs text-slate-500 mb-1">Sequence</div>
                <div className="font-medium">{stage.sequence}</div>
              </div>
              <div className="p-3 border rounded-lg bg-white">
                <div className="text-xs text-slate-500 mb-1">Required</div>
                <div className="font-medium">{stage.isRequired ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </div>
        )}

        {/* INPUTS TAB */}
        {activeTab === 'inputs' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg text-slate-800">Stage Inputs</h3>
              {!isReadOnly && (
                <button
                  onClick={() => setInputModalOpen(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded shadow-sm text-sm font-medium flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Input
                </button>
              )}
            </div>
            {inputs?.length > 0 ? (
              <table className="w-full border rounded-lg bg-white overflow-hidden text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium text-slate-600">Product</th>
                    <th className="p-3 text-left font-medium text-slate-600">Type</th>
                    <th className="p-3 text-left font-medium text-slate-600">Rule</th>
                    <th className="p-3 text-left font-medium text-slate-600">Value</th>
                    <th className="p-3 text-left font-medium text-slate-600">Unit</th>
                    {!isReadOnly && <th className="p-3 text-right font-medium text-slate-600">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {inputs.map((i: any) => (
                    <tr key={i.id} className="border-b last:border-b-0 hover:bg-slate-50/50">
                      <td className="p-3 font-medium">{i.product?.name}</td>
                      <td className="p-3">{i.inputType}</td>
                      <td className="p-3">{i.quantityRuleType}</td>
                      <td className="p-3">{i.quantityValue || '-'}</td>
                      <td className="p-3">{i.unit}</td>
                      {!isReadOnly && (
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteInput(i.id)}
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center border rounded-lg border-dashed bg-white">
                <p className="text-slate-500 mb-3">No inputs configured for this stage.</p>
                {!isReadOnly && (
                  <button
                    onClick={() => setInputModalOpen(true)}
                    className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium"
                  >
                    + Add Input
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* OUTPUTS TAB */}
        {activeTab === 'outputs' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg text-slate-800">Stage Outputs</h3>
              {!isReadOnly && (
                <button
                  onClick={() => setOutputModalOpen(true)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded shadow-sm text-sm font-medium flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Output
                </button>
              )}
            </div>
            {outputs?.length > 0 ? (
              <table className="w-full border rounded-lg bg-white overflow-hidden text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium text-slate-600">Product</th>
                    <th className="p-3 text-left font-medium text-slate-600">Type</th>
                    <th className="p-3 text-left font-medium text-slate-600">Rule</th>
                    <th className="p-3 text-left font-medium text-slate-600">Value/Exp</th>
                    <th className="p-3 text-left font-medium text-slate-600">Unit</th>
                    {!isReadOnly && <th className="p-3 text-right font-medium text-slate-600">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {outputs.map((o: any) => (
                    <tr key={o.id} className="border-b last:border-b-0 hover:bg-slate-50/50">
                      <td className="p-3 font-medium">{o.product?.name}</td>
                      <td className="p-3">{o.outputType}</td>
                      <td className="p-3">{o.quantityRuleType}</td>
                      <td className="p-3">{o.quantityValue || o.expectedQuantity || '-'}</td>
                      <td className="p-3">{o.unit}</td>
                      {!isReadOnly && (
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteOutput(o.id)}
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center border rounded-lg border-dashed bg-white">
                <p className="text-slate-500 mb-3">No outputs configured for this stage.</p>
                {!isReadOnly && (
                  <button
                    onClick={() => setOutputModalOpen(true)}
                    className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium"
                  >
                    + Add Output
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* QUALITY TAB */}
        {activeTab === 'quality' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg text-slate-800">Quality Parameters</h3>
              {!isReadOnly && (
                <button
                  onClick={() => setQualityModalOpen(true)}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded shadow-sm text-sm font-medium flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Quality Parameter
                </button>
              )}
            </div>
            {quality?.length > 0 ? (
              <table className="w-full border rounded-lg bg-white overflow-hidden text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium text-slate-600">Parameter</th>
                    <th className="p-3 text-left font-medium text-slate-600">Type</th>
                    <th className="p-3 text-left font-medium text-slate-600">Min/Max</th>
                    <th className="p-3 text-left font-medium text-slate-600">Target</th>
                    <th className="p-3 text-left font-medium text-slate-600">Action</th>
                    {!isReadOnly && <th className="p-3 text-right font-medium text-slate-600">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {quality.map((q: any) => (
                    <tr key={q.id} className="border-b last:border-b-0 hover:bg-slate-50/50">
                      <td className="p-3 font-medium flex items-center gap-2">
                        {q.parameterName}
                        {q.isCritical && (
                          <span className="bg-red-100 text-red-600 text-[10px] uppercase px-1.5 py-0.5 rounded font-bold">
                            Critical
                          </span>
                        )}
                      </td>
                      <td className="p-3">{q.dataType}</td>
                      <td className="p-3">
                        {q.dataType === 'NUMBER' ? `${q.minValue || '*'} - ${q.maxValue || '*'}` : '-'}
                      </td>
                      <td className="p-3">{q.targetValue || '-'}</td>
                      <td className="p-3">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">
                          {q.failureAction}
                        </span>
                      </td>
                      {!isReadOnly && (
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteQuality(q.id)}
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center border rounded-lg border-dashed bg-white">
                <p className="text-slate-500 mb-3">No quality parameters configured for this stage.</p>
                {!isReadOnly && (
                  <button
                    onClick={() => setQualityModalOpen(true)}
                    className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium"
                  >
                    + Add Quality Parameter
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {inputModalOpen && (
        <WorkflowInputModal
          basePath={basePath}
          onClose={() => setInputModalOpen(false)}
          onSaved={mutateInputs}
        />
      )}
      {outputModalOpen && (
        <WorkflowOutputModal
          basePath={basePath}
          onClose={() => setOutputModalOpen(false)}
          onSaved={mutateOutputs}
        />
      )}
      {qualityModalOpen && (
        <WorkflowQualityModal
          basePath={basePath}
          onClose={() => setQualityModalOpen(false)}
          onSaved={mutateQuality}
        />
      )}
      {executionModalOpen && (
        <WorkflowExecutionFieldModal
          basePath={basePath}
          fieldToEdit={fieldToEdit}
          onClose={() => setExecutionModalOpen(false)}
          onSaved={mutateExecutionFields}
        />
      )}
    </div>
  );
}
