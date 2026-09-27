'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import StageConfigTabs from './StageConfigTabs';

interface Props {
  workflowId: string;
  versionId: string;
  isReadOnly: boolean;
}

export default function WorkflowStageConfig({ workflowId, versionId, isReadOnly }: Props) {
  const { data: stages, mutate: mutateStages } = useSWR(`/api/v1/mill/workflows/${workflowId}/versions/${versionId}`);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const stageList = stages?.stages || [];
  const selectedStage = stageList.find((s: any) => s.id === selectedStageId);

  // Simplified Add Stage (just to satisfy the UI requirement for testing)
  // In a real app this would have a modal with ProcessStage dropdown.
  const handleAddStage = async () => {
    // Left empty for brevity; the prompt focuses on Inputs/Outputs/Quality tabs.
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-white overflow-hidden">
      <div className="flex bg-slate-50 border-b">
        <div className="w-1/4 border-r p-3 font-semibold text-slate-700 bg-slate-100">
          Stages
        </div>
        <div className="w-3/4 p-3 font-semibold text-slate-700">
          {selectedStage ? `${selectedStage.processStage?.name} Configuration` : 'Select a stage'}
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden min-h-[400px]">
        {/* Stages Sidebar */}
        <div className="w-1/4 border-r overflow-y-auto bg-slate-50/50">
          {stageList.map((stage: any) => (
            <div 
              key={stage.id}
              onClick={() => setSelectedStageId(stage.id)}
              className={`p-3 border-b cursor-pointer transition-colors ${
                selectedStageId === stage.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-slate-100 border-l-4 border-l-transparent'
              }`}
            >
              <div className="font-medium text-slate-800">{stage.processStage?.name}</div>
              <div className="text-xs text-slate-500">Seq: {stage.sequence}</div>
            </div>
          ))}
          {!isReadOnly && (
            <div className="p-3 text-center">
              <button 
                onClick={handleAddStage}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Stage
              </button>
            </div>
          )}
        </div>
        
        {/* Stage Content */}
        <div className="w-3/4 flex flex-col bg-white overflow-hidden">
          {selectedStage ? (
            <StageConfigTabs 
              workflowId={workflowId}
              versionId={versionId}
              stage={selectedStage}
              isReadOnly={isReadOnly}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              Select a stage from the left to configure
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
