'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Plus, Settings, Edit2, Trash2, Check, X, AlertCircle, Layers } from 'lucide-react';
import api from '@/lib/api';
import WorkflowStageConfig from './WorkflowStageConfig';

export default function WorkflowConfigModule() {
  const { data: workflows, mutate: mutateWorkflows } = useSWR('/api/v1/mill/workflows');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  
  const selectedWorkflow = workflows?.find((w: any) => w.id === selectedWorkflowId);
  const { data: versions, mutate: mutateVersions } = useSWR(selectedWorkflowId ? `/api/v1/mill/workflows/${selectedWorkflowId}/versions` : null);
  
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const selectedVersion = versions?.find((v: any) => v.id === selectedVersionId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateVersion = async () => {
    if (!selectedWorkflowId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(`/api/v1/mill/workflows/${selectedWorkflowId}/versions`, {});
      await mutateVersions();
      setSelectedVersionId(res.data.id);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePublishVersion = async () => {
    if (!selectedWorkflowId || !selectedVersionId) return;
    setLoading(true);
    setError(null);
    try {
      await api.patch(`/api/v1/mill/workflows/${selectedWorkflowId}/versions/${selectedVersionId}`, { status: 'active' });
      await mutateVersions();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full gap-4 p-4">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border rounded-xl shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h2 className="font-semibold text-slate-800">Workflows</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {workflows?.map((wf: any) => (
            <div 
              key={wf.id}
              onClick={() => { setSelectedWorkflowId(wf.id); setSelectedVersionId(null); setError(null); }}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedWorkflowId === wf.id ? 'bg-blue-50 border-blue-500 shadow-sm' : 'hover:bg-slate-50 border-transparent'
              }`}
            >
              <div className="font-medium">{wf.name}</div>
              <div className="text-xs text-slate-500">{wf.code}</div>
            </div>
          ))}
          {!workflows?.length && (
            <div className="p-4 text-sm text-slate-500 text-center">No workflows found.</div>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="w-3/4 bg-white border rounded-xl shadow-sm flex flex-col overflow-hidden">
        {selectedWorkflow ? (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b bg-slate-50">
              <h2 className="text-xl font-bold">{selectedWorkflow.name} Configurations</h2>
            </div>
            
            <div className="p-4 border-b flex gap-2 items-center overflow-x-auto">
              <div className="text-sm font-semibold text-slate-600 mr-2">Versions:</div>
              {versions?.map((v: any) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionId(v.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                    selectedVersionId === v.id 
                      ? 'bg-slate-800 text-white border-slate-800' 
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  v{v.versionNumber} ({v.status})
                </button>
              ))}
              <button 
                onClick={handleCreateVersion}
                disabled={loading}
                className="px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"
              >
                + New Draft
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 bg-red-50 text-red-600 rounded-lg flex items-center text-sm border border-red-200">
                <AlertCircle className="w-4 h-4 mr-2" />
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {selectedVersion ? (
                <div className="p-4 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center">
                        Version {selectedVersion.versionNumber}
                        <span className={`ml-3 px-2 py-0.5 text-xs rounded-full uppercase font-bold ${
                          selectedVersion.status === 'active' ? 'bg-green-100 text-green-700' :
                          selectedVersion.status === 'archived' ? 'bg-slate-100 text-slate-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {selectedVersion.status}
                        </span>
                      </h3>
                      {selectedVersion.status !== 'draft' && (
                        <p className="text-sm text-slate-500 mt-1">This workflow version is read-only.</p>
                      )}
                    </div>
                    {selectedVersion.status === 'draft' && (
                      <button 
                        onClick={handlePublishVersion}
                        disabled={loading}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
                      >
                        Publish as Active
                      </button>
                    )}
                  </div>
                  
                  <WorkflowStageConfig 
                    workflowId={selectedWorkflow.id}
                    versionId={selectedVersion.id}
                    isReadOnly={selectedVersion.status !== 'draft'}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Settings className="w-12 h-12 mb-4 text-slate-300" />
                  <p>Select a version to configure</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Layers className="w-12 h-12 mb-4 text-slate-300" />
            <p>Select a workflow from the left sidebar</p>
          </div>
        )}
      </div>
    </div>
  );
}
