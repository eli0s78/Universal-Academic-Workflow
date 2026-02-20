


import React, { useState } from 'react';
import WorkflowDisplay from './WorkflowDisplay';
import LiveDocumentEditor from './LiveDocumentEditor';
import { NodeExecutionState } from '../types';

interface NodeOutputPanelProps {
    nodeId: string;
    executionState: NodeExecutionState;
    onContinue: (message: string) => void;
    onAddSection: (messageId: string, content: string) => void;
    onUpdateSection: (sectionId: string, content: string) => void;
    onDeleteSection: (sectionId: string) => void;
    onRevertVersion: (sectionId: string, versionId: string) => void;
}

const NodeOutputPanel: React.FC<NodeOutputPanelProps> = ({ 
    nodeId, 
    executionState, 
    onContinue, 
    onAddSection, 
    onUpdateSection, 
    onDeleteSection,
    onRevertVersion
}) => {
    const [activeTab, setActiveTab] = useState<'process' | 'artifact'>('process');

    const hasArtifacts = executionState.documentSections && executionState.documentSections.length > 0;
    const { totalTokens, promptTokens, responseTokens } = executionState.tokenUsage || { totalTokens: 0, promptTokens: 0, responseTokens: 0 };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab('process')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'process' 
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    Process & Chat
                </button>
                <button
                    onClick={() => setActiveTab('artifact')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'artifact' 
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    Artifacts {hasArtifacts && <span className="ml-2 bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full">{executionState.documentSections.length}</span>}
                </button>
            </div>
            
            {/* Token Usage Stats Header */}
            {totalTokens > 0 && (
                <div className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Token Usage: <span className="font-semibold text-slate-700 dark:text-slate-200">{totalTokens.toLocaleString()}</span></span>
                    <div className="flex gap-3">
                        <span title="Prompt (Input)">In: {promptTokens.toLocaleString()}</span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span title="Response (Output)">Out: {responseTokens.toLocaleString()}</span>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'process' && (
                    <div className="absolute inset-0">
                         <WorkflowDisplay
                            messages={executionState.messages}
                            workflowState={executionState.workflowState}
                            onContinue={onContinue}
                            onReset={() => {}} // Resetting handled at node level usually
                            onAddSection={onAddSection}
                            isMultiPhase={true} // Always allow adding to artifacts in node view
                            documentSections={executionState.documentSections}
                            elapsedTime={executionState.elapsedTime}
                            logs={executionState.logs}
                        />
                    </div>
                )}
                {activeTab === 'artifact' && (
                    <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900">
                        <LiveDocumentEditor
                            sections={executionState.documentSections}
                            onUpdateSection={onUpdateSection}
                            onDeleteSection={onDeleteSection}
                            onAddSection={() => {}} // Manual add handled within editor if needed, or we expose it
                            onAssembleDraft={() => {}} // Assembly is implicit in next node connection
                            onRevertToVersion={onRevertVersion}
                            allowAssembly={false} // Disable the button, logic is node-flow based
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default NodeOutputPanel;
