

import React, { useMemo, useState } from 'react';
import { Config, TaskType, ChapterGenInputType, Phase, BookToChapterInputType, ChapterReconInputType, ChapterInfusionInputType, AcademicNoteInputType, AnalysisLevel } from '../types';
import { TASK_TYPE_OPTIONS, INPUT_TYPE_OPTIONS, RESEARCH_REQUIREMENT_OPTIONS, CHAPTER_GEN_RESEARCH_OPTIONS, ANALYSIS_LEVEL_OPTIONS } from '../constants';
import SparklesIcon from './icons/SparklesIcon';
import FileUpload from './FileUpload';
import SpinnerIcon from './icons/SpinnerIcon';
import SidebarLeftIcon from './icons/SidebarLeftIcon';
import TrashIcon from './icons/TrashIcon';
import { parseUploadedFiles } from '../utils/fileParsing';

declare const pdfjsLib: any;
declare const mammoth: any;

interface ConfiguratorProps {
  config: Config;
  onConfigChange: (newConfig: Partial<Config>) => void;
  onStartPhase: (phase: Phase) => void;
  isWorkflowActive: boolean;
  isMultiPhase: boolean;
  currentPhase: Phase;
  completedPhases: Set<Phase>;
  onPhaseChange: (phase: Phase) => void;
  toggleSidebar: () => void;
}

const commonInputClass = "block w-full rounded-lg border-0 bg-slate-100 dark:bg-slate-800/50 py-2 px-3 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200";
const labelClass = "block text-sm font-medium leading-6 text-slate-800 dark:text-slate-200 mb-2";

const MemoizedTextArea = React.memo(({ id, name, value, onChange, placeholder, disabled, rows = 6, label, onDrop, onDragOver, onDragLeave, isDragging }: { id: string, name: keyof Config, value: string, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void, placeholder: string, disabled: boolean, rows?: number, label: string, onDrop?: (e: React.DragEvent) => void, onDragOver?: (e: React.DragEvent) => void, onDragLeave?: (e: React.DragEvent) => void, isDragging?: boolean }) => (
    <div className="relative">
        <label htmlFor={id} className={labelClass}>{label}</label>
        <div className={`relative rounded-lg transition-all duration-200 ${isDragging ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900 bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
            <textarea
                id={id}
                name={name}
                rows={rows}
                className={`${commonInputClass} ${isDragging ? 'bg-transparent' : ''}`}
                placeholder={placeholder}
                value={value}
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

const PhaseStepper: React.FC<{currentPhase: Phase, onPhaseChange: (phase: Phase) => void}> = ({currentPhase, onPhaseChange}) => {
    const steps: {id: Phase, label: string, number: number}[] = [
        {id: 'generation', label: 'Generation', number: 1},
        {id: 'review', label: 'Review', number: 2},
        {id: 'synthesis', label: 'Synthesis', number: 3},
    ];

    return (
        <div className="mb-8 px-2">
            <div className="relative flex justify-between items-center w-full">
                 <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 dark:bg-slate-800 -z-10 transform -translate-y-1/2"></div>
                 {steps.map((step) => {
                     const isActive = currentPhase === step.id;
                     return (
                        <button 
                            key={step.id}
                            onClick={() => onPhaseChange(step.id)}
                            className="group flex flex-col items-center focus:outline-none"
                        >
                            <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ring-4 ring-white dark:ring-slate-950
                                ${isActive 
                                    ? 'bg-indigo-600 text-white ring-indigo-100 dark:ring-indigo-900/30 scale-110' 
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-700'}
                            `}>
                                {step.number}
                            </div>
                            <span className={`mt-2 text-xs font-medium transition-colors duration-200 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                                {step.label}
                            </span>
                        </button>
                     );
                 })}
            </div>
        </div>
    );
}

const AnalysisLevelSelector: React.FC<{ value: AnalysisLevel | ""; onChange: (newValue: AnalysisLevel) => void; disabled: boolean }> = ({ value, onChange, disabled }) => (
    <div className="flex flex-col space-y-2">
        <label className={labelClass}>Analysis Level</label>
        <div className="flex flex-col sm:flex-row gap-3">
            {ANALYSIS_LEVEL_OPTIONS.map(opt => (
                <label key={opt.value} className={`
                    flex-1 rounded-lg px-3 py-2 cursor-pointer transition-colors duration-200 text-xs text-center font-medium
                    ${value === opt.value
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}>
                    <input
                        type="radio"
                        name="Analysis_Level"
                        value={opt.value}
                        checked={value === opt.value}
                        onChange={() => onChange(opt.value)}
                        disabled={disabled}
                        className="sr-only"
                    />
                    {opt.label}
                </label>
            ))}
        </div>
    </div>
  );

const Configurator: React.FC<ConfiguratorProps> = ({ config, onConfigChange, onStartPhase, isWorkflowActive, isMultiPhase, currentPhase, completedPhases, onPhaseChange, toggleSidebar }) => {
  const [isDraggingOutline, setIsDraggingOutline] = useState(false);
  const [isParsingOutline, setIsParsingOutline] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    onConfigChange({ [e.target.name]: e.target.value });
  };
  
  const handleTaskTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTaskType = e.target.value as TaskType;
    const newConfig: Partial<Config> = {
      Task_Type: newTaskType,
      Input_Type: '',
      Additional_Instructions: ''
    };
    // Auto-set input types for specific tasks
    if (newTaskType === TaskType.BOOK_TO_CHAPTER_TRANSMUTATION) newConfig.Input_Type = BookToChapterInputType.BOOK_FILE_ONLY;
    if (newTaskType === TaskType.CHAPTER_RECONSTRUCTION) newConfig.Input_Type = ChapterReconInputType.SOURCE_A_AND_SOURCE_B;
    if (newTaskType === TaskType.CHAPTER_INFUSION) newConfig.Input_Type = ChapterInfusionInputType.SOURCE_A_AND_SOURCE_B;
    if (newTaskType === TaskType.ACADEMIC_NOTE_GENERATION) newConfig.Input_Type = AcademicNoteInputType.FILES_AND_TITLE;
    
    onConfigChange(newConfig);
  };
  
  // Drag and Drop Handlers for Outline Text Area
  const handleOutlineDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isWorkflowActive) setIsDraggingOutline(true);
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
      
      if (isWorkflowActive) return;

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
                  onConfigChange({ Chapter_Outline: updatedContent });
              }
              if (errors.length > 0) {
                  console.warn("Errors processing dropped files:", errors);
                  alert(`Failed to process some files: ${errors.join(', ')}`);
              }
          } catch (err) {
              console.error("Drop processing error:", err);
          } finally {
              setIsParsingOutline(false);
          }
      }
  };


  // Determine which fields to show in Phase 1 based on Task Type
  const generationFields = useMemo(() => {
    const fields = new Set<keyof Config>();
    if (!config.Task_Type) return fields;

    if (config.Task_Type === TaskType.BOOK_TO_CHAPTER_TRANSMUTATION) {
        fields.add('Book_File').add('Target_Word_Count').add('Additional_Instructions');
        return fields;
    }
    if (config.Task_Type === TaskType.CHAPTER_INFUSION) {
        fields.add('Source_A_File').add('Source_B_Files').add('Additional_Instructions');
        return fields;
    }
    if (config.Task_Type === TaskType.ACADEMIC_NOTE_GENERATION) {
        fields.add('Target_Word_Count').add('Output_Language').add('Chapter_Title').add('Source_B_Files').add('Additional_Instructions'); 
        return fields;
    }
    if (config.Task_Type === TaskType.OUTLINE_GENERATION || config.Task_Type === TaskType.CHAPTER_GENERATION) {
        fields.add('Target_Word_Count');
    }

    switch (config.Input_Type) {
        case 'TITLE_ONLY':
            fields.add('Chapter_Title').add('Research_Requirement').add('Additional_Instructions');
            break;
        case 'TITLE_AND_CONTEXT_DOCUMENT':
            fields.add('Chapter_Title').add('Source_A_File').add('Research_Requirement').add('Additional_Instructions');
            break;
        case 'BIBLIOGRAPHY':
            fields.add('Chapter_Title').add('Core_Bibliography_Files').add('Research_Requirement').add('Additional_Instructions');
            break;
        case ChapterGenInputType.OUTLINE_ONLY:
            fields.add('Chapter_Outline').add('Research_Requirement').add('Additional_Instructions');
            break;
        case ChapterGenInputType.OUTLINE_AND_BIBLIOGRAPHY:
            fields.add('Chapter_Outline').add('Core_Bibliography_Files').add('Additional_Instructions').add('Research_Requirement');
            break;
        case 'SOURCE_A_AND_SOURCE_B':
            fields.add('Source_A_File').add('Source_B_File').add('Target_Word_Count').add('Additional_Instructions');
            break;
    }
    return fields;
  }, [config.Task_Type, config.Input_Type]);

  const renderGenerationPhase = () => (
    <div className="space-y-6 animate-fadeIn">
        <div>
          <label htmlFor="Task_Type" className={labelClass}>Select Task</label>
          <select 
            id="Task_Type" 
            name="Task_Type" 
            className={commonInputClass} 
            value={config.Task_Type} 
            onChange={handleTaskTypeChange} 
            disabled={isWorkflowActive}
          >
            <option value="">-- Select Protocol --</option>
            {TASK_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        {config.Task_Type && (
           <>
            {config.Task_Type !== TaskType.BOOK_TO_CHAPTER_TRANSMUTATION && 
            config.Task_Type !== TaskType.CHAPTER_RECONSTRUCTION && 
            config.Task_Type !== TaskType.CHAPTER_INFUSION && 
            config.Task_Type !== TaskType.ACADEMIC_NOTE_GENERATION && (
                <div>
                <label htmlFor="Input_Type" className={labelClass}>Source Input</label>
                <select id="Input_Type" name="Input_Type" className={commonInputClass} value={config.Input_Type} onChange={handleInputChange} disabled={isWorkflowActive}>
                    <option value="">Select input method...</option>
                    {INPUT_TYPE_OPTIONS[config.Task_Type] && INPUT_TYPE_OPTIONS[config.Task_Type].map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                </div>
            )}

            {/* Dynamic Field Rendering */}
            {generationFields.has('Research_Requirement') && (
                <div>
                    <label htmlFor="Research_Requirement" className={labelClass}>Research Depth</label>
                    <select id="Research_Requirement" name="Research_Requirement" className={commonInputClass} value={config.Research_Requirement} onChange={handleInputChange} disabled={isWorkflowActive}>
                        <option value="">Select depth...</option>
                        {(config.Input_Type === ChapterGenInputType.OUTLINE_ONLY ? CHAPTER_GEN_RESEARCH_OPTIONS : RESEARCH_REQUIREMENT_OPTIONS).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
            )}

            {generationFields.has('Chapter_Title') && (
                <>
                <div>
                    <label htmlFor="Chapter_Title" className={labelClass}>
                        {config.Task_Type === TaskType.ACADEMIC_NOTE_GENERATION ? 'Note Title (Optional)' : 'Chapter Title'}
                    </label>
                    <input 
                        type="text" 
                        id="Chapter_Title" 
                        name="Chapter_Title" 
                        className={commonInputClass} 
                        placeholder={config.Task_Type === TaskType.ACADEMIC_NOTE_GENERATION ? "Leave empty to auto-generate title" : ""}
                        value={config.Chapter_Title} 
                        onChange={handleInputChange} 
                        disabled={isWorkflowActive} 
                    />
                </div>
                {config.Task_Type !== TaskType.ACADEMIC_NOTE_GENERATION && (
                    <div>
                        <label htmlFor="Chapter_Subtitle" className={labelClass}>Chapter Subtitle (Optional)</label>
                        <input type="text" id="Chapter_Subtitle" name="Chapter_Subtitle" className={commonInputClass} placeholder="N/A" value={config.Chapter_Subtitle} onChange={handleInputChange} disabled={isWorkflowActive} />
                    </div>
                )}
                </>
            )}
            
            {generationFields.has('Source_A_File') && <FileUpload id="Source_A_File" key="Source_A_File" label="Source A / Context Document" onFileUploaded={(content) => onConfigChange({ Source_A_File: content })} disabled={isWorkflowActive} />}
            {generationFields.has('Source_B_File') && <FileUpload id="Source_B_File" key="Source_B_File" label="Source B (The Lens)" onFileUploaded={(content) => onConfigChange({ Source_B_File: content })} disabled={isWorkflowActive} />}
            {generationFields.has('Source_B_Files') && <FileUpload id="Source_B_Files" key="Source_B_Files" label={config.Task_Type === TaskType.ACADEMIC_NOTE_GENERATION ? "Source Documents" : "Infusion Sources"} onFilesUploaded={(files) => onConfigChange({ Source_B_Files: files })} disabled={isWorkflowActive} multiple />}
            
            {generationFields.has('Book_File') && <FileUpload id="Book_File" key="Book_File" label="Book File" onFileUploaded={(content) => onConfigChange({ Book_File: content })} disabled={isWorkflowActive} />}
            
            {generationFields.has('Chapter_Outline') && (
                <div className="space-y-4">
                    {isParsingOutline ? (
                         <div className="flex items-center justify-center p-8 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700">
                             <SpinnerIcon className="w-6 h-6 mr-2 text-indigo-600"/>
                             <span className="text-sm text-slate-600 dark:text-slate-300">Extracting text from dropped file...</span>
                         </div>
                    ) : (
                        <MemoizedTextArea 
                            label="Chapter Outline" 
                            id="Chapter_Outline" 
                            name="Chapter_Outline" 
                            value={config.Chapter_Outline} 
                            onChange={handleInputChange} 
                            placeholder="Paste outline or drag and drop a PDF/DOCX file directly here..." 
                            disabled={isWorkflowActive} 
                            rows={8}
                            onDrop={handleOutlineDrop}
                            onDragOver={handleOutlineDragOver}
                            onDragLeave={handleOutlineDragLeave}
                            isDragging={isDraggingOutline}
                        />
                    )}
                </div>
            )}

            {generationFields.has('Core_Bibliography_Files') && (
                <>
                    <FileUpload id="Core_Bibliography_Files" key="Core_Bibliography_Files_Gen" label="Bibliography Files" onFilesUploaded={(files) => onConfigChange({ Core_Bibliography_Files: files })} disabled={isWorkflowActive} multiple initialFiles={config.Core_Bibliography_Files} />
                    <AnalysisLevelSelector value={config.Analysis_Level} onChange={(newValue) => onConfigChange({ Analysis_Level: newValue })} disabled={isWorkflowActive} />
                </>
            )}
            
            {generationFields.has('Output_Language') && (
                <div>
                   <label htmlFor="Output_Language" className={labelClass}>Output Language</label>
                   <input type="text" id="Output_Language" name="Output_Language" className={commonInputClass} placeholder="e.g. English, French, Spanish (Default: English)" value={config.Output_Language} onChange={handleInputChange} disabled={isWorkflowActive}/>
               </div>
           )}

            {generationFields.has('Target_Word_Count') && (
                 <div>
                    <label htmlFor="Target_Word_Count" className={labelClass}>Target Word Count</label>
                    <input type="text" id="Target_Word_Count" name="Target_Word_Count" className={commonInputClass} placeholder="e.g., 3000 words" value={config.Target_Word_Count} onChange={handleInputChange} disabled={isWorkflowActive}/>
                </div>
            )}
            
            {(config.Task_Type === TaskType.ACADEMIC_NOTE_GENERATION || generationFields.has('Additional_Instructions')) && (
                 <MemoizedTextArea 
                    label="Additional Instructions" 
                    id="Additional_Instructions" 
                    name="Additional_Instructions" 
                    value={config.Additional_Instructions} 
                    onChange={handleInputChange} 
                    placeholder="Specific guidance..." 
                    disabled={isWorkflowActive} 
                    rows={3}
                 />
            )}
           </>
        )}
    </div>
  );

  const renderReviewFields = () => (
      <div className="space-y-6 animate-fadeIn">
          <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-sm text-indigo-800 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-800">
             <p className="font-semibold mb-1">Phase 2: Red Team Review</p>
             <p className="opacity-90">The AI will critically analyze the draft below using the Red Team protocol. You can edit the draft before submitting.</p>
          </div>
          <MemoizedTextArea 
            label="Draft Chapter Input" 
            id="Final_Draft_For_Review" 
            name="Final_Draft_For_Review" 
            value={config.Final_Draft_For_Review} 
            onChange={handleInputChange} 
            placeholder="Paste draft here, upload a file, or use auto-filled content from generation phase..." 
            disabled={isWorkflowActive} 
            rows={10} 
          />
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
             <FileUpload id="Final_Draft_For_Review" key="Final_Draft_Upload" label="Or Upload Draft File" onFileUploaded={(content) => onConfigChange({ Final_Draft_For_Review: content })} disabled={isWorkflowActive} virtualFileName="Uploaded_Draft.txt" />
          </div>
          <FileUpload 
            id="Core_Bibliography_Files" 
            key="Core_Bibliography_Files_Review"
            label="Context Bibliography (Optional)" 
            onFilesUploaded={(files) => onConfigChange({ Core_Bibliography_Files: files })} 
            disabled={isWorkflowActive} 
            multiple 
            initialFiles={config.Core_Bibliography_Files}
          />
          <AnalysisLevelSelector value={config.Analysis_Level} onChange={(newValue) => onConfigChange({ Analysis_Level: newValue })} disabled={isWorkflowActive} />
          <MemoizedTextArea label="Review Instructions" id="Additional_Instructions" name="Additional_Instructions" value={config.Additional_Instructions} onChange={handleInputChange} placeholder="Focus primarily on..." disabled={isWorkflowActive} rows={3} />
      </div>
  );

  const renderSynthesisFields = () => (
      <div className="space-y-6 animate-fadeIn">
          <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-sm text-indigo-800 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-800">
             <p className="font-semibold mb-1">Phase 3: Final Synthesis</p>
             <p className="opacity-90">Combines your Draft and the Red Team Report into a final polished artifact.</p>
          </div>
          <MemoizedTextArea 
            label="Original Draft" 
            id="Final_Draft_For_Review" 
            name="Final_Draft_For_Review" 
            value={config.Final_Draft_For_Review} 
            onChange={handleInputChange} 
            placeholder="Draft text..." 
            disabled={isWorkflowActive} 
            rows={6} 
          />
          <MemoizedTextArea 
            label="Red Team Report (Directives)" 
            id="Red_Team_Review_Text" 
            name="Red_Team_Review_Text" 
            value={config.Red_Team_Review_Text} 
            onChange={handleInputChange} 
            placeholder="Paste review report..." 
            disabled={isWorkflowActive} 
            rows={6} 
          />
          <FileUpload 
            id="Core_Bibliography_Files" 
            key="Core_Bibliography_Files_Synth"
            label="Bibliography (Optional)" 
            onFilesUploaded={(files) => onConfigChange({ Core_Bibliography_Files: files })} 
            disabled={isWorkflowActive} 
            multiple 
            initialFiles={config.Core_Bibliography_Files}
          />
           <AnalysisLevelSelector value={config.Analysis_Level} onChange={(newValue) => onConfigChange({ Analysis_Level: newValue })} disabled={isWorkflowActive} />
           <MemoizedTextArea label="Synthesis Instructions" id="Additional_Instructions" name="Additional_Instructions" value={config.Additional_Instructions} onChange={handleInputChange} placeholder="Ensure that..." disabled={isWorkflowActive} rows={3} />
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Header with Close Button */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Project Setup</h2>
          <div className="flex items-center gap-2">
            <button 
                type="button"
                onClick={toggleSidebar}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close Sidebar (Zen Mode)"
            >
                <SidebarLeftIcon className="w-5 h-5" />
            </button>
          </div>
      </div>

      {/* Main Scrollable Form Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <form className="space-y-6">
            <PhaseStepper currentPhase={currentPhase} onPhaseChange={onPhaseChange} />

            {currentPhase === 'generation' && renderGenerationPhase()}
            {currentPhase === 'review' && renderReviewFields()}
            {currentPhase === 'synthesis' && renderSynthesisFields()}
            
            {/* Action Button */}
            { (config.Task_Type || currentPhase !== 'generation') && (
            <div className="pt-6 pb-10">
                <button
                type="button"
                onClick={() => onStartPhase(currentPhase)}
                disabled={isWorkflowActive}
                className="w-full flex items-center justify-center gap-x-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all duration-200"
                >
                {isWorkflowActive ? (
                    <>
                    <SpinnerIcon className="h-5 w-5" />
                    <span>Running Protocol...</span>
                    </>
                ) : (
                    <>
                    <SparklesIcon className="h-5 w-5" />
                    {completedPhases.has(currentPhase) ? 'Regenerate Phase' : `Start ${currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}`}
                    </>
                )}
                </button>
            </div>
            )}
        </form>
      </div>
    </div>
  );
};

export default Configurator;
