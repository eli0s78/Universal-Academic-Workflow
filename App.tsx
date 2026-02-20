
// Main App component for the Universal Academic Workflow
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
// import { GenerateContentResponse } from "@google/genai";
import { Config, Message, WorkflowState, TaskType, WorkflowNode, WorkflowEdge, NodeExecutionState, SectionVersion, ChapterSection, AnalysisLevel, InputType, ContextProcessingInputType, TokenUsage, ProjectInputType } from './types';
import { startGenerationPhase, executeReviewPhase, executeSynthesisPhase, continueWorkflow, extractRelevantContent } from './services/geminiService';
import NodeCanvas from './components/NodeCanvas';
import NodeConfigurator from './components/NodeConfigurator';
import NodeOutputPanel from './components/NodeOutputPanel';
import SaveIcon from './components/icons/SaveIcon';
import UploadIcon from './components/icons/UploadIcon';
import PlusCircleIcon from './components/icons/PlusCircleIcon';

const LOCAL_STORAGE_KEY = 'universal_academic_workflow_nodes_v1';

const getInitialConfig = (type: TaskType): Config => ({
    Task_Type: type,
    Input_Type: type === TaskType.PROJECT_DEFINITION ? ProjectInputType.MANUAL_ENTRY : (type === TaskType.CONTEXT_PROCESSING ? ContextProcessingInputType.FILES_ONLY : ''), 
    Research_Requirement: '',
    Analysis_Level: AnalysisLevel.FOCUSED_BALANCE,
    Target_Word_Count: '',
    Output_Language: 'English',
    Chapter_Title: '',
    Chapter_Subtitle: '',
    Additional_Instructions: '',
    Source_A_File: '',
    Source_B_File: '',
    Source_B_Files: [],
    Source_B_Content: '',
    Book_File: '',
    Core_Bibliography: '',
    Core_Bibliography_Files: [],
    Complementary_Files: [],
    Chapter_Outline: '',
    Draft_Chapter_Text: '',
    Red_Team_Review_Text: '',
    Final_Draft_For_Review: ''
});

const getInitialExecutionState = (): NodeExecutionState => ({
    messages: [],
    workflowState: WorkflowState.CONFIGURING,
    documentSections: [],
    elapsedTime: 0,
    logs: [],
    tokenUsage: { promptTokens: 0, responseTokens: 0, totalTokens: 0 }
});

const extractTitleFromMarkdown = (content: string): string => {
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^\s*(?:[-*•]\s+)?(?:\d+(\.\d+)*\.?)\s+(.*)/) || line.match(/^#{1,6}\s+(.*)/);
        if (match && match[match.length - 1]) {
            return match[match.length - 1].trim();
        }
    }
    return 'Untitled Section';
};

// Helper to clean response text
const processResponseText = (responseText: string): { cleanedText: string, isAwaitingAction: boolean } => {
    const triggerPhrases = [
      'awaiting command', 'please confirm', 'await explicit user approval',
      'ask the user the guiding question', 'which specific theory',
      'awaiting your selection'
    ];
    const lowercased = responseText.toLowerCase();
    const isAwaitingAction = triggerPhrases.some(p => lowercased.includes(p));

    let cleanedText = responseText.replace(/^\s*[•*-]\s*$/gm, '').replace(/\n{3,}/g, '\n\n');
    const stopPhrases = [
        'Awaiting command for the next section.', 'Awaiting command for the first section.',
        'Awaiting command to generate a visual.', 'Please confirm.',
        'Awaiting your selection of topics to infuse.', 'Please confirm if this infusion plan is approved.'
    ];
    for (const phrase of stopPhrases) {
        if (cleanedText.trim().endsWith(phrase)) {
            cleanedText = cleanedText.trim().slice(0, -phrase.length).trim();
            break; 
        }
    }
    return { cleanedText, isAwaitingAction };
};


function App() {
    const [nodes, setNodes] = useState<WorkflowNode[]>([]);
    const [edges, setEdges] = useState<WorkflowEdge[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [executionStates, setExecutionStates] = useState<Record<string, NodeExecutionState>>({});
    const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
    
    // Panel Resizing State
    const [leftWidth, setLeftWidth] = useState(384); // Default 384px (w-96)
    const [rightWidth, setRightWidth] = useState(500); // Default 500px
    const [isResizingLeft, setIsResizingLeft] = useState(false);
    const [isResizingRight, setIsResizingRight] = useState(false);

    // Timer Refs
    const timerRefs = useRef<Record<string, number | null>>({});
    const startTimesRef = useRef<Record<string, number | null>>({});

    // --- Persistence ---
    useEffect(() => {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setNodes(parsed.nodes || []);
                setEdges(parsed.edges || []);
                
                // Rehydrate dates in execution states
                if (parsed.executionStates) {
                    const states = parsed.executionStates;
                    Object.keys(states).forEach(key => {
                        if (states[key].documentSections) {
                            states[key].documentSections.forEach((sec: ChapterSection) => {
                                sec.versions.forEach((v: SectionVersion) => v.createdAt = new Date(v.createdAt));
                            });
                        }
                        // Ensure tokenUsage exists for legacy saves
                        if (!states[key].tokenUsage) {
                            states[key].tokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
                        }
                    });
                    setExecutionStates(states);
                }
            } catch (e) {
                console.error("Failed to load state", e);
            }
        }
    }, []);

    // Debounced Save Effect
    useEffect(() => {
        const saveState = () => {
            try {
                // Tier 1: Try saving everything
                const fullState = { nodes, edges, executionStates };
                try {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fullState));
                    return;
                } catch (e) {
                     // proceed to tier 2
                }

                console.warn("Quota exceeded. Attempting Tier 2 save (stripping execution history)...");
                // Tier 2: Save topology + config, but strip heavy execution states (chat/artifacts)
                // We keep keys but reset state
                const reducedExecutionStates: Record<string, NodeExecutionState> = {};
                Object.keys(executionStates).forEach(k => {
                    reducedExecutionStates[k] = getInitialExecutionState(); // Reset history
                });
                
                const tier2State = { nodes, edges, executionStates: reducedExecutionStates };
                try {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tier2State));
                    return;
                } catch(e) {
                    // proceed to tier 3
                }

                console.warn("Quota exceeded. Attempting Tier 3 save (stripping heavy config content)...");
                // Tier 3: Strip heavy content from Config files in nodes
                const minimalNodes = nodes.map(node => {
                    const minimalConfig = { ...node.config };
                    // Remove large text blobs
                    const heavyKeys: (keyof Config)[] = [
                        'Source_A_File', 'Source_B_File', 'Book_File', 
                        'Core_Bibliography', 'Source_B_Content', 
                        'Draft_Chapter_Text', 'Red_Team_Review_Text', 
                        'Final_Draft_For_Review', 'Chapter_Outline'
                    ];
                    
                    heavyKeys.forEach(key => {
                        if (typeof minimalConfig[key] === 'string' && (minimalConfig[key] as string).length > 500) {
                            (minimalConfig as any)[key] = "[CONTENT_CLEARED_TO_SAVE_SPACE]";
                        }
                    });

                    // Clear file arrays if they contain content (ours usually don't, but for safety)
                    if (minimalConfig.Source_B_Files) minimalConfig.Source_B_Files = [];
                    if (minimalConfig.Core_Bibliography_Files) minimalConfig.Core_Bibliography_Files = [];

                    return { ...node, config: minimalConfig };
                });

                const tier3State = { nodes: minimalNodes, edges, executionStates: reducedExecutionStates };
                try {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tier3State));
                } catch(e) {
                    console.error("Critical: Failed to save state even with minimal data.", e);
                }

            } catch (error) {
                console.error("Unexpected error during save:", error);
            }
        };

        const timeoutId = setTimeout(saveState, 2000); // Debounce save by 2s
        return () => clearTimeout(timeoutId);
    }, [nodes, edges, executionStates]);

    // --- Resizing Logic ---
    const startResizingLeft = useCallback(() => setIsResizingLeft(true), []);
    const startResizingRight = useCallback(() => setIsResizingRight(true), []);
    
    const stopResizing = useCallback(() => {
        setIsResizingLeft(false);
        setIsResizingRight(false);
    }, []);

    const resize = useCallback((mouseEvent: MouseEvent) => {
        if (isResizingLeft) {
            setLeftWidth(current => {
                const newWidth = mouseEvent.clientX;
                if (newWidth < 280) return 280;
                if (newWidth > 600) return 600;
                return newWidth;
            });
        }
        if (isResizingRight) {
            setRightWidth(current => {
                const newWidth = window.innerWidth - mouseEvent.clientX;
                if (newWidth < 350) return 350;
                if (newWidth > 900) return 900;
                return newWidth;
            });
        }
    }, [isResizingLeft, isResizingRight]);

    useEffect(() => {
        if (isResizingLeft || isResizingRight) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        } else {
             document.body.style.userSelect = '';
             document.body.style.cursor = '';
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isResizingLeft, isResizingRight, resize, stopResizing]);

    // --- Node Operations ---

    const handleAddNode = useCallback((type: TaskType, position: { x: number, y: number }) => {
        const newNode: WorkflowNode = {
            id: uuidv4(),
            type,
            position,
            config: getInitialConfig(type),
            status: 'idle'
        };
        setNodes(prev => [...prev, newNode]);
        setExecutionStates(prev => ({ ...prev, [newNode.id]: getInitialExecutionState() }));
        setSelectedNodeId(newNode.id);
    }, []);

    const handleDeleteNode = useCallback((id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
        setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
        setExecutionStates(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        if (selectedNodeId === id) setSelectedNodeId(null);
    }, [selectedNodeId]);

    const handleMoveNode = useCallback((id: string, position: { x: number, y: number }) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, position } : n));
    }, []);

    const handleConnect = useCallback((source: string, target: string) => {
        // Prevent cycles or duplicates if desired, simplistic for now
        setEdges(prev => {
            if (prev.some(e => e.source === source && e.target === target)) return prev;
            return [...prev, { id: uuidv4(), source, target }];
        });
    }, []);

    const handleDeleteEdge = useCallback((edgeId: string) => {
        setEdges(prev => prev.filter(e => e.id !== edgeId));
    }, []);

    const handleUpdateConfig = useCallback((nodeId: string, newConfig: Partial<Config>) => {
        setNodes(prev => prev.map(n => 
            n.id === nodeId ? { ...n, config: { ...n.config, ...newConfig } } : n
        ));
    }, []);

    // --- Execution Logic ---

    const updateExecutionState = useCallback((nodeId: string, updates: Partial<NodeExecutionState> | ((prev: NodeExecutionState) => Partial<NodeExecutionState>)) => {
        setExecutionStates(prev => {
            const current = prev[nodeId] || getInitialExecutionState();
            const newValues = typeof updates === 'function' ? updates(current) : updates;
            return { ...prev, [nodeId]: { ...current, ...newValues } };
        });
    }, []);

    const startTimer = (nodeId: string) => {
        if (timerRefs.current[nodeId]) clearInterval(timerRefs.current[nodeId]!);
        startTimesRef.current[nodeId] = Date.now();
        updateExecutionState(nodeId, { elapsedTime: 0 });
        timerRefs.current[nodeId] = window.setInterval(() => {
            if (startTimesRef.current[nodeId]) {
                const elapsed = Math.round((Date.now() - startTimesRef.current[nodeId]!) / 1000);
                updateExecutionState(nodeId, { elapsedTime: elapsed });
            }
        }, 1000);
    };

    const stopTimer = (nodeId: string): number => {
        if (timerRefs.current[nodeId]) {
            clearInterval(timerRefs.current[nodeId]!);
            timerRefs.current[nodeId] = null;
        }
        let duration = 0;
        if (startTimesRef.current[nodeId]) {
            duration = Math.round((Date.now() - startTimesRef.current[nodeId]!) / 1000);
            startTimesRef.current[nodeId] = null;
        }
        return duration;
    };

    // --- Artifact/Context Integration ---
    const getUpstreamContext = useCallback((node: WorkflowNode) => {
        const incomingEdges = edges.filter(e => e.target === node.id);
        const effectiveConfig = { ...node.config };
        const upstreamSources: Record<string, string> = {};

        // Accumulators for multi-source nodes
        let combinedSourceB = effectiveConfig.Source_B_Content || '';
        let combinedBibliography = effectiveConfig.Core_Bibliography || '';

        incomingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const sourceState = executionStates[edge.source];
            if (!sourceNode || !sourceState) return;
            
            // Get text from artifacts (document sections)
            const sourceText = sourceState.documentSections
                .sort((a,b) => a.order - b.order)
                .map(s => s.versions.find(v => v.id === s.activeVersionId)?.content || '')
                .join('\n\n');
            
            // Get raw chat message content if no artifacts (fallback for Context Processing)
            const sourceChatContent = sourceState.messages
                .filter(m => m.role === 'assistant' && !m.isHidden)
                .map(m => m.content)
                .join('\n\n');

            const contentToUse = sourceText || sourceChatContent;
            const sType = sourceNode.type;
            const tType = node.type;

            // --- PROJECT DEFINITION INHERITANCE (METADATA) ---
            if (sType === TaskType.PROJECT_DEFINITION) {
                // All downstream nodes inherit metadata from Project Definition
                if (sourceNode.config.Chapter_Title) {
                    effectiveConfig.Chapter_Title = sourceNode.config.Chapter_Title;
                    upstreamSources['Chapter_Title'] = "Project Definition";
                }
                if (sourceNode.config.Chapter_Subtitle) {
                    effectiveConfig.Chapter_Subtitle = sourceNode.config.Chapter_Subtitle;
                }
                if (sourceNode.config.Additional_Instructions) {
                    // Append instructions or set if empty
                    const existing = effectiveConfig.Additional_Instructions || '';
                    effectiveConfig.Additional_Instructions = existing 
                        ? `${existing}\n\nGlobal Project Directives:\n${sourceNode.config.Additional_Instructions}`
                        : sourceNode.config.Additional_Instructions;
                }
                if (sourceNode.config.Target_Word_Count) effectiveConfig.Target_Word_Count = sourceNode.config.Target_Word_Count;
                if (sourceNode.config.Output_Language) effectiveConfig.Output_Language = sourceNode.config.Output_Language;
            }

            // --- CONTEXT PROCESSING INHERITANCE (DATA) ---
            else if (sType === TaskType.CONTEXT_PROCESSING) {
                // WE USE XML TAGS to help the model distinguish sources and prevent "overload confusion"
                const label = sourceNode.label || "Context_Batch";
                const safeLabel = label.replace(/\s+/g, '_');
                
                // Structured XML Block
                const structuredBlock = `
<context_source id="${safeLabel}" type="context_processing_output">
${contentToUse}
</context_source>
`;
                // Append to BOTH bibliography and Source B content
                combinedBibliography += structuredBlock;
                combinedSourceB += structuredBlock;
                
                upstreamSources['Core_Bibliography'] = "Context Library";
                upstreamSources['Source_B_Content'] = "Context Library";
                
                // Note: We deliberately do NOT inherit title from Context Processing nodes anymore,
                // as the Project Definition node is now the single source of truth for Titles.
            }
            
            // --- STANDARD NODE INHERITANCE ---
            else if (sourceNode.config.Core_Bibliography && !effectiveConfig.Core_Bibliography) {
                if (!combinedBibliography.includes("context_source")) {
                     effectiveConfig.Core_Bibliography = sourceNode.config.Core_Bibliography;
                     upstreamSources['Core_Bibliography'] = sourceNode.label || sourceNode.type;
                }
            }
            
            // General fallback inheritance for non-Project nodes
            if (sType !== TaskType.PROJECT_DEFINITION) {
                if (!effectiveConfig.Chapter_Title && sourceNode.config.Chapter_Title) {
                     effectiveConfig.Chapter_Title = sourceNode.config.Chapter_Title;
                     upstreamSources['Chapter_Title'] = sourceNode.label || sourceNode.type;
                }
                if (!effectiveConfig.Chapter_Subtitle && sourceNode.config.Chapter_Subtitle) {
                     effectiveConfig.Chapter_Subtitle = sourceNode.config.Chapter_Subtitle;
                }
            }

            // Inherit Outline for Context Processing context-aware extraction
            if (tType === TaskType.CONTEXT_PROCESSING && !effectiveConfig.Chapter_Outline && contentToUse && sType === TaskType.OUTLINE_GENERATION) {
                 effectiveConfig.Chapter_Outline = contentToUse;
                 upstreamSources['Chapter_Outline'] = sourceNode.label || sourceNode.type;
            }

            if (!contentToUse) return;

            if (sType === TaskType.OUTLINE_GENERATION && tType === TaskType.CHAPTER_GENERATION) {
                effectiveConfig.Chapter_Outline = contentToUse;
                upstreamSources['Chapter_Outline'] = sourceNode.label || sourceNode.type;
            } else if (tType === TaskType.RED_TEAM_REVIEW || tType === TaskType.CITATION_VERIFICATION) {
                // Accepts text from any upstream node as the draft to be reviewed/verified
                effectiveConfig.Draft_Chapter_Text = contentToUse;
                upstreamSources['Draft_Chapter_Text'] = sourceNode.label || sourceNode.type;
            } else if (sType === TaskType.RED_TEAM_REVIEW && tType === TaskType.FINAL_SYNTHESIS) {
                effectiveConfig.Red_Team_Review_Text = contentToUse;
                upstreamSources['Red_Team_Review_Text'] = sourceNode.label || sourceNode.type;
                const draftEdge = edges.find(e => e.target === sourceNode.id);
                if (draftEdge) {
                     const draftNodeId = draftEdge.source;
                     const draftState = executionStates[draftNodeId];
                     const draftNode = nodes.find(n => n.id === draftNodeId);
                     if (draftState) {
                        const draftText = draftState.documentSections.map(s => s.versions.find(v => v.id === s.activeVersionId)?.content).join('\n\n');
                        effectiveConfig.Draft_Chapter_Text = draftText;
                        upstreamSources['Draft_Chapter_Text'] = draftNode?.label || draftNode?.type || 'Upstream Draft';
                     }
                }
            } else if (tType === TaskType.ACADEMIC_NOTE_GENERATION && sType !== TaskType.PROJECT_DEFINITION) {
                 const separator = combinedSourceB ? '\n\n' : '';
                 combinedSourceB = `${combinedSourceB}${separator}--- Input from ${TaskType[sType]} ---\n${contentToUse}`;
                 upstreamSources['Source_B_Content'] = sourceNode.label || sourceNode.type;
            }
        });

        // Apply accumulated values
        if (combinedSourceB) effectiveConfig.Source_B_Content = combinedSourceB;
        if (combinedBibliography) effectiveConfig.Core_Bibliography = combinedBibliography;

        return { effectiveConfig, upstreamSources };
    }, [nodes, edges, executionStates]);

    const handleRunNode = async (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'running' } : n));
        updateExecutionState(nodeId, { workflowState: WorkflowState.PROCESSING });
        startTimer(nodeId);

        try {
            const { effectiveConfig: runConfig } = getUpstreamContext(node);
            let accumulatedTokens: TokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
            
            // Special handling for CONTEXT_PROCESSING to ensure files are processed even if "Source_B_Files" is populated
            if (node.type === TaskType.CONTEXT_PROCESSING && runConfig.Source_B_Files && runConfig.Source_B_Files.length > 0) {
                 // Intentional no-op: files are processed in the block below
            }

            if (runConfig.Core_Bibliography_Files && runConfig.Core_Bibliography_Files.length > 0 && !runConfig.Core_Bibliography) {
                const contextTitle = runConfig.Chapter_Title || '';
                const contextSubtitle = runConfig.Chapter_Subtitle || '';
                const fullContext = `${contextTitle} ${contextSubtitle}`.trim();

                const { text: bibContent, usage: bibUsage } = await extractRelevantContent(
                    runConfig.Core_Bibliography_Files, 
                    { 
                        contextText: fullContext || 'Academic Context',
                        instructions: runConfig.Additional_Instructions
                    }, 
                    runConfig.Analysis_Level
                );
                
                runConfig.Core_Bibliography = bibContent;
                handleUpdateConfig(nodeId, { Core_Bibliography: bibContent });
                
                accumulatedTokens.promptTokens += bibUsage.promptTokens;
                accumulatedTokens.responseTokens += bibUsage.responseTokens;
                accumulatedTokens.totalTokens += bibUsage.totalTokens;
            } else if (runConfig.Core_Bibliography && !node.config.Core_Bibliography) {
                handleUpdateConfig(nodeId, { Core_Bibliography: runConfig.Core_Bibliography });
            }

            if ((node.type === TaskType.ACADEMIC_NOTE_GENERATION || node.type === TaskType.CHAPTER_INFUSION || node.type === TaskType.CONTEXT_PROCESSING) && runConfig.Source_B_Files && runConfig.Source_B_Files.length > 0) {
                 let contextInfo = runConfig.Chapter_Title || 'Academic Content';
                 
                 if (node.type === TaskType.CHAPTER_INFUSION && runConfig.Source_A_File) {
                     contextInfo = `Primary Source Content Preview (for Infusion context): ${runConfig.Source_A_File.slice(0, 500)}...`;
                 } else if (node.type === TaskType.ACADEMIC_NOTE_GENERATION) {
                     contextInfo = runConfig.Chapter_Title || 'Academic Note Generation';
                 } else if (node.type === TaskType.CONTEXT_PROCESSING) {
                     // Smart Context Extraction Logic: Uses inherited Title (from Project Node) to filter files
                     const title = runConfig.Chapter_Title || '';
                     const subtitle = runConfig.Chapter_Subtitle || '';
                     const outline = runConfig.Chapter_Outline || '';
                     
                     if (title || subtitle) {
                        contextInfo = `Context: ${title} ${subtitle}\n${outline ? `Outline Scope:\n${outline}` : ''}`;
                     } else {
                        contextInfo = 'Knowledge Base Extraction (General)';
                     }
                 }

                 const { text: fileContent, usage: fileUsage } = await extractRelevantContent(
                    runConfig.Source_B_Files,
                    { 
                        contextText: contextInfo,
                        instructions: runConfig.Additional_Instructions
                    },
                    runConfig.Analysis_Level
                 );
                 
                 const existing = runConfig.Source_B_Content || '';
                 runConfig.Source_B_Content = existing ? `${existing}\n\n${fileContent}` : fileContent;
                 
                 accumulatedTokens.promptTokens += fileUsage.promptTokens;
                 accumulatedTokens.responseTokens += fileUsage.responseTokens;
                 accumulatedTokens.totalTokens += fileUsage.totalTokens;
            }

            let responsePayload: { userPrompt: string, response: any };

            if (node.type === TaskType.RED_TEAM_REVIEW) {
                runConfig.Final_Draft_For_Review = runConfig.Draft_Chapter_Text; 
                responsePayload = await executeReviewPhase(runConfig, nodeId);
            } else if (node.type === TaskType.FINAL_SYNTHESIS) {
                runConfig.Final_Draft_For_Review = runConfig.Draft_Chapter_Text; 
                responsePayload = await executeSynthesisPhase(runConfig, nodeId);
            } else {
                responsePayload = await startGenerationPhase(runConfig, nodeId);
            }

            const duration = stopTimer(nodeId);
            const responseText = (responsePayload.response.text as string | undefined) ?? '';
            const { cleanedText, isAwaitingAction } = processResponseText(responseText);
            const groundingMetadata = (responsePayload.response.candidates?.[0] as any)?.groundingMetadata;
            
            // Add usage from the main call
            const usageMeta = responsePayload.response.usageMetadata;
            if (usageMeta) {
                accumulatedTokens.promptTokens += usageMeta.promptTokenCount || 0;
                accumulatedTokens.responseTokens += usageMeta.candidatesTokenCount || 0;
                accumulatedTokens.totalTokens += usageMeta.totalTokenCount || 0;
            }

            updateExecutionState(nodeId, prev => {
                 const newMessages = [...prev.messages];
                 if (responsePayload.userPrompt) {
                     newMessages.push({ id: uuidv4(), role: 'user', content: responsePayload.userPrompt, isHidden: true });
                 }
                 newMessages.push({ 
                     id: uuidv4(), 
                     role: 'assistant', 
                     content: cleanedText, 
                     groundingChunks: groundingMetadata?.groundingChunks,
                     duration,
                     protocol: node.type
                 });
                 
                 // Update tokens
                 const updatedTokens = {
                     promptTokens: prev.tokenUsage.promptTokens + accumulatedTokens.promptTokens,
                     responseTokens: prev.tokenUsage.responseTokens + accumulatedTokens.responseTokens,
                     totalTokens: prev.tokenUsage.totalTokens + accumulatedTokens.totalTokens
                 };

                 // --- AUTO-POPULATE ARTIFACTS FOR CITATION VERIFICATION ---
                 let updatedSections = prev.documentSections;
                 if (node.type === TaskType.CITATION_VERIFICATION && runConfig.Draft_Chapter_Text && prev.documentSections.length === 0) {
                     const sectionId = uuidv4();
                     const versionId = uuidv4();
                     updatedSections = [{
                         id: sectionId,
                         order: 1,
                         title: "Draft Chapter (For Verification)",
                         versions: [{
                             id: versionId,
                             content: runConfig.Draft_Chapter_Text,
                             createdAt: new Date(),
                             source: 'ai-generated'
                         }],
                         activeVersionId: versionId,
                         sourceMessageId: 'upstream-import',
                         protocol: node.type
                     }];
                 }
                 // ----------------------------------------------------------

                 return { 
                     messages: newMessages, 
                     workflowState: isAwaitingAction ? WorkflowState.AWAITING_USER_ACTION : WorkflowState.COMPLETED,
                     tokenUsage: updatedTokens,
                     documentSections: updatedSections
                 };
            });
            
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: isAwaitingAction ? 'running' : 'completed' } : n));

        } catch (error) {
            stopTimer(nodeId);
            console.error(error);
            updateExecutionState(nodeId, prev => ({ 
                workflowState: WorkflowState.ERROR,
                logs: [...prev.logs, `Error: ${(error as Error).message}`]
            }));
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'error' } : n));
        }
    };

    const handleContinueNode = async (message: string) => {
        if (!selectedNodeId) return;
        const nodeId = selectedNodeId;
        const node = nodes.find(n => n.id === nodeId);
        
        updateExecutionState(nodeId, prev => ({ 
            workflowState: WorkflowState.PROCESSING,
            messages: [...prev.messages, { id: uuidv4(), role: 'user', content: message }]
        }));
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'running' } : n));
        startTimer(nodeId);

        try {
            const response = await continueWorkflow(message, nodeId);
            const duration = stopTimer(nodeId);
            const responseText = response.text ?? '';
            const { cleanedText, isAwaitingAction } = processResponseText(responseText);
            
            const usageMeta = response.usageMetadata;
            const newTokens: TokenUsage = {
                promptTokens: usageMeta?.promptTokenCount || 0,
                responseTokens: usageMeta?.candidatesTokenCount || 0,
                totalTokens: usageMeta?.totalTokenCount || 0
            };

            updateExecutionState(nodeId, prev => ({
                messages: [...prev.messages, { id: uuidv4(), role: 'assistant', content: cleanedText, duration, protocol: node?.type }],
                workflowState: isAwaitingAction ? WorkflowState.AWAITING_USER_ACTION : WorkflowState.COMPLETED,
                tokenUsage: {
                    promptTokens: prev.tokenUsage.promptTokens + newTokens.promptTokens,
                    responseTokens: prev.tokenUsage.responseTokens + newTokens.responseTokens,
                    totalTokens: prev.tokenUsage.totalTokens + newTokens.totalTokens
                }
            }));
             setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: isAwaitingAction ? 'running' : 'completed' } : n));
        } catch (error) {
            stopTimer(nodeId);
            updateExecutionState(nodeId, { workflowState: WorkflowState.ERROR });
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'error' } : n));
        }
    };

    // --- Document Section Handlers ---
    const handleAddSection = useCallback((messageId: string, content: string) => {
        if (!selectedNodeId) return;
        updateExecutionState(selectedNodeId, prev => {
            const newSection: ChapterSection = {
                id: uuidv4(),
                order: prev.documentSections.length + 1,
                title: extractTitleFromMarkdown(content),
                versions: [{ id: uuidv4(), content, createdAt: new Date(), source: 'ai-generated' }],
                activeVersionId: '', // Set below
                sourceMessageId: messageId
            };
            newSection.activeVersionId = newSection.versions[0].id;
            return { documentSections: [...prev.documentSections, newSection] };
        });
    }, [selectedNodeId]);

    const handleUpdateSection = useCallback((sectionId: string, content: string) => {
        if (!selectedNodeId) return;
        updateExecutionState(selectedNodeId, prev => ({
            documentSections: prev.documentSections.map(s => {
                if (s.id === sectionId) {
                    const newVersion: SectionVersion = { id: uuidv4(), content, createdAt: new Date(), source: 'user-edited' };
                    return { ...s, versions: [...s.versions, newVersion], activeVersionId: newVersion.id };
                }
                return s;
            })
        }));
    }, [selectedNodeId]);

    const handleDeleteSection = useCallback((sectionId: string) => {
        if (!selectedNodeId) return;
        updateExecutionState(selectedNodeId, prev => ({
            documentSections: prev.documentSections.filter(s => s.id !== sectionId)
        }));
    }, [selectedNodeId]);

    const handleRevertVersion = useCallback((sectionId: string, versionId: string) => {
        if (!selectedNodeId) return;
        updateExecutionState(selectedNodeId, prev => ({
            documentSections: prev.documentSections.map(s => s.id === sectionId ? { ...s, activeVersionId: versionId } : s)
        }));
    }, [selectedNodeId]);
    
    // --- Global Actions ---
    
    const resetProject = useCallback(() => {
        Object.keys(timerRefs.current).forEach(key => {
            if (timerRefs.current[key]) clearInterval(timerRefs.current[key]!);
        });
        timerRefs.current = {};
        startTimesRef.current = {};

        setNodes([]);
        setEdges([]);
        setExecutionStates({});
        setSelectedNodeId(null);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }, []);

    const handleNewProject = () => {
        if (nodes.length > 0) {
            setShowNewProjectDialog(true);
        } else {
            resetProject();
        }
    };

    const handleSaveWorkflow = () => {
        const data = JSON.stringify({ nodes, edges, executionStates }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleLoadWorkflow = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (re) => {
                try {
                    const parsed = JSON.parse(re.target?.result as string);
                    if (parsed.nodes) setNodes(parsed.nodes);
                    if (parsed.edges) setEdges(parsed.edges);
                    if (parsed.executionStates) {
                        // Ensure TokenUsage compatibility for old saves
                        Object.values(parsed.executionStates).forEach((state: any) => {
                            if (!state.tokenUsage) state.tokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
                        });
                        setExecutionStates(parsed.executionStates);
                    }
                } catch (err) {
                    alert("Invalid workflow file");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const selectedNode = nodes.find(n => n.id === selectedNodeId);
    const selectedExecutionState = selectedNodeId ? executionStates[selectedNodeId] : null;
    
    const upstreamContext = selectedNode ? getUpstreamContext(selectedNode) : { effectiveConfig: {}, upstreamSources: {} };

    // Dynamic classes based on resizing state to prevent lag
    const leftTransitionClass = isResizingLeft ? '' : 'transition-[width,opacity] duration-300 ease-in-out';
    const rightTransitionClass = isResizingRight ? '' : 'transition-[width,opacity] duration-300 ease-in-out';

    return (
        <div className="flex flex-col h-screen w-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden relative">
            {/* Top Menu Bar */}
            <div className="h-12 flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 z-20 relative">
                <div className="font-bold text-lg flex items-center gap-2">
                    <span className="bg-indigo-600 text-white p-1 rounded">UA</span>
                    <span>Universal Academic Workflow</span>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleNewProject} className="text-sm font-medium hover:text-indigo-600">New</button>
                    <button onClick={handleSaveWorkflow} className="text-sm font-medium hover:text-indigo-600 flex items-center gap-1"><SaveIcon className="w-4 h-4"/> Save</button>
                    <button onClick={handleLoadWorkflow} className="text-sm font-medium hover:text-indigo-600 flex items-center gap-1"><UploadIcon className="w-4 h-4"/> Load</button>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex-1 relative overflow-hidden">
                {/* Canvas (Bottom Layer) */}
                <div className="absolute inset-0 z-0">
                    <NodeCanvas 
                        nodes={nodes}
                        edges={edges}
                        selectedNodeId={selectedNodeId}
                        executionStates={executionStates}
                        onNodeSelect={setSelectedNodeId}
                        onNodeMove={handleMoveNode}
                        onAddNode={handleAddNode}
                        onDeleteNode={handleDeleteNode}
                        onConnect={handleConnect}
                        onDeleteEdge={handleDeleteEdge}
                    />
                    {!selectedNode && nodes.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-white/80 dark:bg-slate-800/80 p-6 rounded-xl shadow-xl text-center backdrop-blur-sm pointer-events-auto border border-slate-200 dark:border-slate-700">
                                <PlusCircleIcon className="w-12 h-12 mx-auto text-indigo-500 mb-2"/>
                                <h3 className="text-lg font-bold">Start your workflow</h3>
                                <p className="text-slate-500 mb-4">Right-click on the canvas to add the "Project Definition" node.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Left Panel: Properties (Floating) */}
                <div 
                    className={`absolute top-0 bottom-0 left-0 z-10 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex shadow-xl ${leftTransitionClass} ${!selectedNode ? 'pointer-events-none' : ''}`}
                    style={{ width: selectedNode ? leftWidth : 0, opacity: selectedNode ? 1 : 0 }}
                >
                    <div className="flex-1 h-full overflow-hidden relative">
                        {selectedNode && (
                            <NodeConfigurator 
                                node={selectedNode}
                                upstreamSources={upstreamContext.upstreamSources}
                                inheritedConfig={upstreamContext.effectiveConfig}
                                onUpdateConfig={handleUpdateConfig}
                                onRunNode={handleRunNode}
                                isNodeRunning={selectedNode.status === 'running'}
                            />
                        )}
                    </div>
                    {/* Resizer */}
                    {selectedNode && (
                        <div 
                            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-600 z-50 transition-colors"
                            onMouseDown={startResizingLeft}
                        />
                    )}
                </div>

                {/* Right Panel: Output (Floating) */}
                <div 
                    className={`absolute top-0 bottom-0 right-0 z-10 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex shadow-xl ${rightTransitionClass} ${!selectedNode ? 'pointer-events-none' : ''}`}
                    style={{ width: selectedNode ? rightWidth : 0, opacity: selectedNode ? 1 : 0 }}
                >
                     {/* Resizer */}
                    {selectedNode && (
                        <div 
                            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-600 z-50 transition-colors"
                            onMouseDown={startResizingRight}
                        />
                    )}
                    <div className="flex-1 h-full overflow-hidden relative">
                        {selectedNode && selectedExecutionState && (
                            <NodeOutputPanel 
                                nodeId={selectedNode.id}
                                executionState={selectedExecutionState}
                                onContinue={handleContinueNode}
                                onAddSection={handleAddSection}
                                onUpdateSection={handleUpdateSection}
                                onDeleteSection={handleDeleteSection}
                                onRevertVersion={handleRevertVersion}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* New Project Confirmation Dialog */}
            {showNewProjectDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full mx-4 transform transition-all animate-fadeIn">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Start New Project?</h3>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            You have an active workflow. Do you want to save your current project before starting a new one?
                            <br/><span className="text-xs text-red-500 mt-2 block font-medium">Unsaved changes will be lost if you choose "Don't Save".</span>
                        </p>
                        
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => { handleSaveWorkflow(); resetProject(); setShowNewProjectDialog(false); }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                                <SaveIcon className="w-4 h-4" /> Save Project & Start New
                            </button>
                            <button 
                                onClick={() => { resetProject(); setShowNewProjectDialog(false); }}
                                className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors focus:ring-2 focus:ring-red-500 focus:outline-none"
                            >
                                Don't Save (Clear Everything)
                            </button>
                             <button 
                                onClick={() => setShowNewProjectDialog(false)}
                                className="w-full px-4 py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm font-medium transition-colors focus:outline-none"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
