

import React, { useMemo, useState, useRef } from 'react';
import { Config, TaskType, WorkflowNode, InputType, ResearchRequirement, AnalysisLevel, BookToChapterInputType, ChapterReconInputType, ChapterInfusionInputType, AcademicNoteInputType, ChapterGenInputType, OutlineInputType } from '../types';
import { TASK_TYPE_OPTIONS, INPUT_TYPE_OPTIONS, RESEARCH_REQUIREMENT_OPTIONS, CHAPTER_GEN_RESEARCH_OPTIONS, ANALYSIS_LEVEL_OPTIONS } from '../constants';
import SparklesIcon from './icons/SparklesIcon';
import FileUpload from './FileUpload';
import SpinnerIcon from './icons/SpinnerIcon';
import CheckIcon from './icons/CheckIcon';
import PinIcon from './icons/PinIcon';
import UploadIcon from './icons/UploadIcon';
import { parseUploadedFiles } from '../utils/fileParsing';

interface NodeConfiguratorProps {
  node: WorkflowNode;
  upstreamSources?: Record<string, string>; // Maps config key to source node name
  inheritedConfig?: Partial<Config>; // The config values inherited from upstream
  onUpdateConfig: (nodeId: string, newConfig: Partial<Config>) => void;
  onRunNode: (nodeId: string) => void;
  isNodeRunning: boolean;
}

const commonInputClass = "block w-full rounded-lg border-0 bg-slate-100 dark:bg-slate-800/50 py-2 px-3 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200";
const labelClass = "block text-sm font-medium leading-6 text-slate-800 dark:text-slate-200 mb-2";

const MemoizedTextArea = React.memo(({ id, name, value, onChange, placeholder, disabled, rows = 6, label, sourceName, onDrop, onDragOver, onDragLeave, isDragging }: any) => (
    <div className="relative">
        <div className="flex justify-between items-center mb-2">
            <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-800 dark:text-slate-200">{label}</label>
            {sourceName && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/20">
                    <PinIcon className="w-3 h-3" />
                    Linked from {sourceName}
                </span>
            )}
        </div>
        <div className={`relative rounded-lg transition-all duration-200 ${isDragging ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900 bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
            <textarea
                id={id}
                name={name}
                rows={rows}
                className={`${commonInputClass} ${isDragging ? 'bg-transparent' : ''}`}
                placeholder={placeholder}
                value={value || ''}
                onChange={onChange}
                disabled={disabled}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
            />
             {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-white/50 dark:bg-black/50 rounded-lg">
                    <div className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg font-medium text-sm animate-bounce">
                        Drop file to extract text
                    </div>
                </div>
            )}
        </div>
    </div>
));

const NodeConfigurator: React.FC<NodeConfiguratorProps> = ({ node, upstreamSources = {}, inheritedConfig = {} as Partial<Config>, onUpdateConfig, onRunNode, isNodeRunning }) => {
  const config = node.config;
  const [isDraggingOutline, setIsDraggingOutline] = useState(false);
  const [isParsingOutline, setIsParsingOutline] = useState(false);
  const [isDraggingDraft, setIsDraggingDraft] = useState(false);
  const [isParsingDraft, setIsParsingDraft] = useState(false);
  
  const draftFileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    onUpdateConfig(node.id, { [e.target.name]: e.target.value });
  };

  // Drag Handlers for Outline
  const handleOutlineDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isNodeRunning) setIsDraggingOutline(true);
  };
  
  const handleOutlineDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOutline(false);
  };

  const handleOutlineDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOutline(false);
      
      if (isNodeRunning) return;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          setIsParsingOutline(true);
          try {
              const { parsedFiles, errors } = await parseUploadedFiles(e.dataTransfer.files);
              if (parsedFiles.length > 0) {
                  // Combine all dragged files content
                  const newContent = parsedFiles.map(f => f.content).join('\n\n');
                  const currentContent = config.Chapter_Outline || '';
                  // Append if content exists, otherwise replace
                  const updatedContent = currentContent ? `${currentContent}\n\n${newContent}` : newContent;
                  onUpdateConfig(node.id, { Chapter_Outline: updatedContent });
              }
              if (errors.length > 0) {
                  console.warn("Errors processing dropped files:", errors);
              }
          } catch (err) {
              console.error("Drop processing error:", err);
          } finally {
              setIsParsingOutline(false);
          }
      }
  };

  // Drag Handlers for Draft Text
  const handleDraftDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isNodeRunning) setIsDraggingDraft(true);
  };

  const handleDraftDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingDraft(false);
  };

  const handleDraftDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingDraft(false);
      
      if (isNodeRunning) return;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          setIsParsingDraft(true);
          try {
              const { parsedFiles, errors } = await parseUploadedFiles(e.dataTransfer.files);
              if (parsedFiles.length > 0) {
                  const newContent = parsedFiles.map(f => f.content).join('\n\n');
                  const currentContent = config.Draft_Chapter_Text || '';
                  const updatedContent = currentContent ? `${currentContent}\n\n${newContent}` : newContent;
                  onUpdateConfig(node.id, { Draft_Chapter_Text: updatedContent });
              }
              if (errors.length > 0) {
                  console.warn("Errors processing dropped files:", errors);
              }
          } catch (err) {
              console.error("Drop processing error:", err);
          } finally {
              setIsParsingDraft(false);
          }
      }
  };

  const handleDraftBrowse = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setIsParsingDraft(true);
          try {
              const { parsedFiles, errors } = await parseUploadedFiles(e.target.files);
              if (parsedFiles.length > 0) {
                  const newContent = parsedFiles.map(f => f.content).join('\n\n');
                  const currentContent = config.Draft_Chapter_Text || '';
                  const updatedContent = currentContent ? `${currentContent}\n\n${newContent}` : newContent;
                  onUpdateConfig(node.id, { Draft_Chapter_Text: updatedContent });
              }
          } catch (err) {
              console.error(err);
          } finally {
              setIsParsingDraft(false);
              if (draftFileInputRef.current) draftFileInputRef.current.value = '';
          }
      }
  };
  
  // Logic to determine visible fields based on node type and input type
  const visibleFields = useMemo(() => {
    const fields = new Set<keyof Config>();
    const task = node.type;
    const hasInheritedBib = !!inheritedConfig.Core_Bibliography;
    
    // Always include Additional Instructions
    fields.add('Additional_Instructions');

    if (task === TaskType.OUTLINE_GENERATION) {
        fields.add('Chapter_Title').add('Chapter_Subtitle').add('Target_Word_Count').add('Research_Requirement');
        if (config.Input_Type === OutlineInputType.TITLE_AND_CONTEXT_DOCUMENT) fields.add('Source_A_File');
        if (config.Input_Type === OutlineInputType.BIBLIOGRAPHY || hasInheritedBib) fields.add('Core_Bibliography_Files').add('Analysis_Level');
    }
    else if (task === TaskType.CHAPTER_GENERATION) {
        fields.add('Chapter_Outline').add('Target_Word_Count').add('Research_Requirement');
        if (config.Input_Type === ChapterGenInputType.OUTLINE_AND_BIBLIOGRAPHY || hasInheritedBib) {
            fields.add('Core_Bibliography_Files');
            if (!hasInheritedBib) fields.add('Analysis_Level');
        }
    }
    else if (task === TaskType.CHAPTER_RECONSTRUCTION) {
        fields.add('Source_A_File').add('Source_B_File').add('Target_Word_Count');
    }
    else if (task === TaskType.CHAPTER_INFUSION) {
        fields.add('Source_A_File').add('Source_B_Files').add('Target_Word_Count').add('Analysis_Level');
    }
    else if (task === TaskType.ACADEMIC_NOTE_GENERATION) {
        fields.add('Chapter_Title').add('Source_B_Files').add('Target_Word_Count').add('Output_Language').add('Analysis_Level');
    }
    else if (task === TaskType.BOOK_TO_CHAPTER_TRANSMUTATION) {
        fields.add('Book_File').add('Target_Word_Count');
    }
    else if (task === TaskType.RED_TEAM_REVIEW) {
        fields.add('Draft_Chapter_Text').add('Core_Bibliography_Files');
        if (!hasInheritedBib) fields.add('Analysis_Level');
    }
    else if (task === TaskType.FINAL_SYNTHESIS) {
        fields.add('Draft_Chapter_Text').add('Red_Team_Review_Text').add('Core_Bibliography_Files');
         if (!hasInheritedBib) fields.add('Analysis_Level');
    }

    return fields;
  }, [node.type, config.Input_Type, inheritedConfig.Core_Bibliography]);

  const hasInputTypeOption = INPUT_TYPE_OPTIONS[node.type as TaskType] !== undefined;

  // Determine if input method is locked by an upstream connection
  const isInputLocked = useMemo(() => {
    if (node.type === TaskType.CHAPTER_GENERATION && upstreamSources['Chapter_Outline']) return true;
    if (node.type === TaskType.RED_TEAM_REVIEW && upstreamSources['Draft_Chapter_Text']) return true;
    if (node.type === TaskType.FINAL_SYNTHESIS && upstreamSources['Red_Team_Review_Text']) return true;
    return false;
  }, [node.type, upstreamSources]);
  
  // Determine actual values to display (inherited overrides local if local is empty/default for flow continuity)
  // For display purposes in the UI, if inheritedConfig has a value and local config doesn't, we show inherited.
  // We passed inheritedConfig separately so we can choose to auto-fill or just show indication.
  // For text fields like Outline, we'll auto-fill for preview.
  const displayConfig = { ...config };
  if (inheritedConfig.Chapter_Outline) displayConfig.Chapter_Outline = inheritedConfig.Chapter_Outline;
  if (inheritedConfig.Draft_Chapter_Text) displayConfig.Draft_Chapter_Text = inheritedConfig.Draft_Chapter_Text;
  if (inheritedConfig.Red_Team_Review_Text) displayConfig.Red_Team_Review_Text = inheritedConfig.Red_Team_Review_Text;
  
  // For Bibliography, it's boolean/token data.
  const isBibliographyInherited = !!inheritedConfig.Core_Bibliography;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Node Properties</h2>
          <p className="text-xs text-slate-500">{node.type}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <form className="space-y-6">
            {/* Input Type Selector (If applicable) */}
            {hasInputTypeOption && !isInputLocked && (
                <div>
                    <label htmlFor="Input_Type" className={labelClass}>Input Method</label>
                    <select id="Input_Type" name="Input_Type" className={commonInputClass} value={config.Input_Type} onChange={handleInputChange} disabled={isNodeRunning}>
                        <option value="">Select input method...</option>
                        {INPUT_TYPE_OPTIONS[node.type as TaskType].map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
            )}

            {isInputLocked && (
                 <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <span className="text-xs font-semibold uppercase text-indigo-500 block mb-1">Input Source</span>
                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        <span>Workflow Connected</span>
                    </div>
                </div>
            )}

            {visibleFields.has('Research_Requirement') && (
                <div>
                    <label htmlFor="Research_Requirement" className={labelClass}>Research Depth</label>
                    <select id="Research_Requirement" name="Research_Requirement" className={commonInputClass} value={config.Research_Requirement} onChange={handleInputChange} disabled={isNodeRunning}>
                         <option value="">Select depth...</option>
                         {(config.Input_Type === ChapterGenInputType.OUTLINE_ONLY ? CHAPTER_GEN_RESEARCH_OPTIONS : RESEARCH_REQUIREMENT_OPTIONS).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        Controls the AI's <strong>active research behavior</strong> during this specific step.
                    </p>
                </div>
            )}
            
            {visibleFields.has('Analysis_Level') && (
                 <div>
                    <label htmlFor="Analysis_Level" className={labelClass}>Analysis Level</label>
                    <select id="Analysis_Level" name="Analysis_Level" className={commonInputClass} value={config.Analysis_Level} onChange={handleInputChange} disabled={isNodeRunning}>
                         {ANALYSIS_LEVEL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
            )}

            {visibleFields.has('Chapter_Title') && (
                <div>
                     {upstreamSources['Chapter_Title'] && !config.Chapter_Title && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                             <PinIcon className="w-3 h-3" />
                             <span>Inheriting title from {upstreamSources['Chapter_Title']}</span>
                        </div>
                    )}
                    <label htmlFor="Chapter_Title" className={labelClass}>Title</label>
                    <input 
                        type="text" 
                        id="Chapter_Title" 
                        name="Chapter_Title" 
                        className={commonInputClass} 
                        value={config.Chapter_Title} 
                        onChange={handleInputChange} 
                        disabled={isNodeRunning} 
                        placeholder={upstreamSources['Chapter_Title'] ? `Inherited: ${inheritedConfig.Chapter_Title || "(from upstream)"}` : "Leave empty to auto-generate title"} 
                    />
                </div>
            )}

            {visibleFields.has('Chapter_Subtitle') && (
                <div>
                    <label htmlFor="Chapter_Subtitle" className={labelClass}>Subtitle</label>
                    <input type="text" id="Chapter_Subtitle" name="Chapter_Subtitle" className={commonInputClass} value={config.Chapter_Subtitle} onChange={handleInputChange} disabled={isNodeRunning} />
                </div>
            )}

            {visibleFields.has('Target_Word_Count') && (
                 <div>
                    <label htmlFor="Target_Word_Count" className={labelClass}>Target Word Count</label>
                    <input type="text" id="Target_Word_Count" name="Target_Word_Count" className={commonInputClass} placeholder="e.g. 3000" value={config.Target_Word_Count} onChange={handleInputChange} disabled={isNodeRunning}/>
                </div>
            )}

            {/* File Uploads */}
            {visibleFields.has('Source_A_File') && (
                upstreamSources['Source_A_File'] ? (
                     <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 text-sm font-medium">
                            <PinIcon className="w-4 h-4" />
                            <span>Context Document Linked</span>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-300 mt-1 ml-6">From node: {upstreamSources['Source_A_File']}</p>
                    </div>
                ) : (
                    <FileUpload id="Source_A_File" label="Source A / Context" onFileUploaded={(content) => onUpdateConfig(node.id, { Source_A_File: content })} disabled={isNodeRunning} initialContent={config.Source_A_File} />
                )
            )}

            {visibleFields.has('Source_B_File') && <FileUpload id="Source_B_File" label="Source B (Lens)" onFileUploaded={(content) => onUpdateConfig(node.id, { Source_B_File: content })} disabled={isNodeRunning} initialContent={config.Source_B_File} />}
            
            {visibleFields.has('Source_B_Files') && (
                <>
                    {upstreamSources['Source_B_Content'] && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                             <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 text-sm font-medium">
                                 <PinIcon className="w-4 h-4" />
                                 <span>Input from Workflow Linked</span>
                             </div>
                             <p className="text-xs text-blue-600 dark:text-blue-300 mt-1 ml-6">From node: {upstreamSources['Source_B_Content']}</p>
                        </div>
                    )}
                    <FileUpload 
                        id="Source_B_Files" 
                        label={node.type === TaskType.ACADEMIC_NOTE_GENERATION ? "Source Documents" : "Secondary Sources"} 
                        onFilesUploaded={(files) => onUpdateConfig(node.id, { Source_B_Files: files })} 
                        disabled={isNodeRunning} 
                        multiple 
                        initialFiles={config.Source_B_Files} 
                    />
                </>
            )}

            {visibleFields.has('Book_File') && <FileUpload id="Book_File" label="Book File" onFileUploaded={(content) => onUpdateConfig(node.id, { Book_File: content })} disabled={isNodeRunning} initialContent={config.Book_File} />}
            
            {visibleFields.has('Core_Bibliography_Files') && (
                 isBibliographyInherited ? (
                     <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                         <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-sm font-medium">
                             <CheckIcon className="w-4 h-4" />
                             <span>Tokenized Bibliography Linked</span>
                         </div>
                         <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-1 ml-6">
                            Data pre-processed by {upstreamSources['Core_Bibliography'] || 'upstream node'}.
                         </p>
                     </div>
                 ) : (
                    <FileUpload id="Core_Bibliography_Files" label="Bibliography" onFilesUploaded={(files) => onUpdateConfig(node.id, { Core_Bibliography_Files: files })} disabled={isNodeRunning} multiple initialFiles={config.Core_Bibliography_Files} />
                 )
            )}

            {/* Text Areas */}
            {visibleFields.has('Chapter_Outline') && (
                isParsingOutline ? (
                    <div className="flex items-center justify-center p-8 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700">
                        <SpinnerIcon className="w-6 h-6 mr-2 text-indigo-600"/>
                        <span className="text-sm text-slate-600 dark:text-slate-300">Extracting text from dropped file...</span>
                    </div>
                ) : (
                    <div>
                        <MemoizedTextArea 
                            label="Outline" 
                            id="Chapter_Outline" 
                            name="Chapter_Outline" 
                            value={displayConfig.Chapter_Outline} 
                            onChange={handleInputChange} 
                            rows={6} 
                            disabled={isNodeRunning} 
                            sourceName={upstreamSources['Chapter_Outline']} 
                            onDrop={handleOutlineDrop}
                            onDragOver={handleOutlineDragOver}
                            onDragLeave={handleOutlineDragLeave}
                            isDragging={isDraggingOutline}
                            placeholder="Paste outline or drag and drop a PDF/DOCX file directly here..." 
                        />
                         <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            * Supports dragging & dropping PDF/DOCX files directly into the text area.
                        </p>
                    </div>
                )
            )}
            {visibleFields.has('Draft_Chapter_Text') && (
                 isParsingDraft ? (
                    <div className="flex items-center justify-center p-8 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700">
                        <SpinnerIcon className="w-6 h-6 mr-2 text-indigo-600"/>
                        <span className="text-sm text-slate-600 dark:text-slate-300">Extracting text from uploaded file...</span>
                    </div>
                 ) : (
                 <div>
                     <MemoizedTextArea 
                        label="Draft Text" 
                        id="Draft_Chapter_Text" 
                        name="Draft_Chapter_Text" 
                        value={displayConfig.Draft_Chapter_Text} 
                        onChange={handleInputChange} 
                        rows={8} 
                        disabled={isNodeRunning}
                        sourceName={upstreamSources['Draft_Chapter_Text']}
                        onDrop={handleDraftDrop}
                        onDragOver={handleDraftDragOver}
                        onDragLeave={handleDraftDragLeave}
                        isDragging={isDraggingDraft}
                        placeholder="Paste draft text here, or drag and drop a PDF/DOCX file..."
                    />
                    <div className="mt-2">
                        <input
                            type="file"
                            ref={draftFileInputRef}
                            className="hidden"
                            accept=".pdf,.docx"
                            onChange={handleDraftBrowse}
                            multiple
                        />
                        <button
                            type="button"
                            onClick={() => draftFileInputRef.current?.click()}
                            disabled={isNodeRunning}
                            className="text-xs flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium transition-colors"
                        >
                            <UploadIcon className="w-3 h-3" />
                            Upload PDF/DOCX
                        </button>
                    </div>
                </div>
                )
            )}
             {visibleFields.has('Red_Team_Review_Text') && (
                 <MemoizedTextArea 
                    label="Red Team Review" 
                    id="Red_Team_Review_Text" 
                    name="Red_Team_Review_Text" 
                    value={displayConfig.Red_Team_Review_Text} 
                    onChange={handleInputChange} 
                    rows={6} 
                    disabled={isNodeRunning} 
                    sourceName={upstreamSources['Red_Team_Review_Text']}
                />
            )}
            
             {/* Instructions always editable and independent */}
             {visibleFields.has('Additional_Instructions') && (
                 <MemoizedTextArea 
                    label="Instructions" 
                    id="Additional_Instructions" 
                    name="Additional_Instructions" 
                    value={config.Additional_Instructions} 
                    onChange={handleInputChange} 
                    rows={3} 
                    disabled={isNodeRunning} 
                    placeholder="Specific guidance for this step..."
                />
            )}
        </form>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button
            type="button"
            onClick={() => onRunNode(node.id)}
            disabled={isNodeRunning}
            className="w-full flex items-center justify-center gap-x-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all duration-200"
        >
            {isNodeRunning ? (
                <>
                <SpinnerIcon className="h-5 w-5" />
                <span>Processing...</span>
                </>
            ) : (
                <>
                <SparklesIcon className="h-5 w-5" />
                <span>Run Node</span>
                </>
            )}
        </button>
      </div>
    </div>
  );
};

export default NodeConfigurator;
