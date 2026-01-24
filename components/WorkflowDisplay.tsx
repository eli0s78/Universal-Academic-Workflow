
import React, { useRef, useEffect, useState } from 'react';
import { Message, WorkflowState, ChapterSection } from '../types';
import PaperAirplaneIcon from './icons/PaperAirplaneIcon';
import SparklesIcon from './icons/SparklesIcon';
import ClipboardIcon from './icons/ClipboardIcon';
import CheckIcon from './icons/CheckIcon';
import SpinnerIcon from './icons/SpinnerIcon';
import PlusCircleIcon from './icons/PlusCircleIcon';
import ClockIcon from './icons/ClockIcon';
import DownloadIcon from './icons/DownloadIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import { downloadDocx, downloadPdf } from '../services/exportService';
import { processMarkdown, processRedTeamMarkdown, extractRedTeamSuggestions, SuggestionBlock } from '../utils/markdownUtils';

interface WorkflowDisplayProps {
  messages: Message[];
  workflowState: WorkflowState;
  onContinue: (message: string) => void;
  onReset: () => void;
  onAddSection: (messageId: string, content: string) => void;
  isMultiPhase: boolean;
  documentSections: ChapterSection[];
  elapsedTime: number;
  logs: string[];
}

const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
};

const SimpleMarkdown: React.FC<{ text: string; protocol?: string; }> = React.memo(({ text, protocol }) => {
    const html = protocol === 'RED_TEAM_REVIEW' ? processRedTeamMarkdown(text, false) : processMarkdown(text, false);
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

const SuggestionCard: React.FC<{ 
    suggestion: SuggestionBlock; 
    onAdd: () => void; 
    isAdded: boolean 
}> = ({ suggestion, onAdd, isAdded }) => {
    const priorityColors: Record<string, string> = {
        'HIGH': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
        'MEDIUM': 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
        'MINOR': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
    };
    
    // Normalize priority key
    const pKey = Object.keys(priorityColors).find(k => suggestion.priority.toUpperCase().includes(k)) || 'MEDIUM';

    return (
        <div className="mb-3 p-4 rounded-lg border bg-white dark:bg-slate-800 shadow-sm border-slate-200 dark:border-slate-700 flex flex-col gap-2">
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${priorityColors[pKey]}`}>
                        {suggestion.priority}
                    </span>
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">{suggestion.title}</h4>
                </div>
                <button
                    onClick={onAdd}
                    disabled={isAdded}
                    className={`p-1.5 rounded transition-colors ${isAdded ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-600'}`}
                    title={isAdded ? "Added to Artifacts" : "Add to Artifacts"}
                >
                    {isAdded ? <CheckIcon className="w-4 h-4" /> : <PlusCircleIcon className="w-5 h-5" />}
                </button>
            </div>
            {suggestion.context && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold">Context:</span> {suggestion.context}
                </div>
            )}
            <div className="text-sm text-slate-700 dark:text-slate-300 mt-1 bg-slate-50 dark:bg-slate-900/50 p-3 rounded border border-slate-100 dark:border-slate-800">
                <span className="font-semibold block mb-1 text-xs uppercase tracking-wider text-slate-400">Action</span>
                <div className="whitespace-pre-wrap">{suggestion.action}</div>
            </div>
        </div>
    );
};

const MessageActions: React.FC<{
    message: Message;
    onAddSection: (messageId: string, content: string) => void;
    isMultiPhase: boolean;
    documentSections: ChapterSection[];
}> = ({ message, onAddSection, isMultiPhase, documentSections }) => {
    const [isCopied, setIsCopied] = useState(false);
    const isAddedToDocument = documentSections.some(sec => sec.sourceMessageId === message.id);

    const handleCopy = async () => {
        if (isCopied) return;
        const htmlText = message.protocol === 'RED_TEAM_REVIEW' ? processRedTeamMarkdown(message.content, true) : processMarkdown(message.content, true);
        try {
            const htmlBlob = new Blob([htmlText], { type: 'text/html' });
            const textBlob = new Blob([message.content], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
        } catch (err) {
            await navigator.clipboard.writeText(message.content);
        } finally {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };
    
    const handleAddSection = () => {
        onAddSection(message.id, message.content);
    };

    return (
        <div className="mt-2 flex items-center space-x-1">
             {isMultiPhase && (
                <button
                    onClick={handleAddSection}
                    disabled={isAddedToDocument}
                    className="p-1.5 text-slate-400 hover:text-indigo-400 disabled:text-green-500 disabled:cursor-not-allowed"
                    aria-label={isAddedToDocument ? "Added to Document" : "Add to Document"}
                >
                    {isAddedToDocument ? <CheckIcon className="w-4 h-4" /> : <PlusCircleIcon className="w-4 h-4" />}
                </button>
            )}
            <button
                onClick={handleCopy}
                className="p-1.5 text-slate-400 hover:text-slate-200"
                aria-label={isCopied ? "Copied" : "Copy"}
            >
                {isCopied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardIcon className="w-4 h-4" />}
            </button>
        </div>
    );
};

const WorkflowDisplay: React.FC<WorkflowDisplayProps> = ({ messages, workflowState, onContinue, onReset, onAddSection, isMultiPhase, documentSections, elapsedTime, logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
            setIsExportMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, workflowState]);

  useEffect(() => {
    if (textareaRef.current) {
        const el = textareaRef.current;
        el.style.height = 'auto'; // Reset height to recalculate based on content
        const scrollHeight = el.scrollHeight;
        const maxHeight = 200; // Cap the height at 200px
        
        if (scrollHeight > maxHeight) {
            el.style.height = `${maxHeight}px`;
            el.style.overflowY = 'auto'; // Show scrollbar if max height is reached
        } else {
            el.style.height = `${scrollHeight}px`;
            el.style.overflowY = 'hidden'; // Hide scrollbar if within limits
        }
    }
  }, [userInput]);

  const handleSend = () => {
    if (userInput.trim()) {
      onContinue(userInput.trim());
      setUserInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDownloadLogs = () => {
      const logContent = logs.join('\n');
      const blob = new Blob([logContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workflow-log-${new Date().toISOString()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleExport = (format: 'docx' | 'pdf') => {
      const content = messages
          .filter(m => m.role === 'assistant' && !m.isHidden)
          .map(m => m.content)
          .join('\n\n---\n\n');
      
      if (!content) return;

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `workflow_export_${timestamp}`;

      if (format === 'docx') {
          downloadDocx(content, filename);
      } else {
          downloadPdf(content, filename);
      }
      setIsExportMenuOpen(false);
  };


  const renderMessage = (msg: Message) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';

    if (isSystem) {
        const lowerContent = msg.content.toLowerCase();
        const isAnalyzing = lowerContent.includes('analyzing');
        const isAnalysisComplete = lowerContent.includes('analysis complete');

        let icon = null;
        if (isAnalyzing) {
            icon = <SpinnerIcon className="w-4 h-4 text-slate-400" />;
        } else if (isAnalysisComplete) {
            icon = <CheckIcon className="w-4 h-4 text-green-500" />;
        }

        return (
            <div key={msg.id} className="flex items-center justify-center my-4 space-x-2">
                {icon}
                <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">{msg.content}</span>
            </div>
        );
    }

    if (isUser) {
        return (
            <div key={msg.id} className="flex justify-end mb-4">
                <div className={`max-w-4xl lg:max-w-6xl px-4 py-3 rounded-xl shadow-md bg-indigo-600 text-white`}>
                    <div className="prose-sm dark:prose-invert max-w-none">
                        <SimpleMarkdown text={msg.content} />
                    </div>
                </div>
            </div>
        );
    }
    
    // Assistant Message
    const hasGroundingInfo = (msg.searchQueries && msg.searchQueries.length > 0) || (msg.groundingChunks && msg.groundingChunks.length > 0);

    // Parse Red Team Suggestions if applicable
    const isRedTeam = msg.protocol === 'RED_TEAM_REVIEW' || (msg.role === 'assistant' && msg.content.includes('<<<SUGGESTION_START>>>'));
    let contentToRender = msg.content;
    let suggestions: SuggestionBlock[] = [];

    if (isRedTeam) {
        const extracted = extractRedTeamSuggestions(msg.content);
        contentToRender = extracted.cleanText;
        suggestions = extracted.suggestions;
    }

    const messageContainer = (
        <div className={`max-w-4xl lg:max-w-6xl px-4 py-3 rounded-xl shadow-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200`}>
            <div className="prose-sm dark:prose-invert max-w-none prose-pre:bg-slate-200 dark:prose-pre:bg-slate-700">
                {contentToRender && <SimpleMarkdown text={contentToRender} protocol={msg.protocol} />}
            </div>
            
            {/* Red Team Suggestions Panel */}
            {isRedTeam && suggestions.length > 0 && (
                <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4 text-indigo-500" />
                        Actionable Suggestions ({suggestions.length})
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                        {suggestions.map((s, idx) => {
                            // Heuristic check if added
                            const isAdded = documentSections.some(sec => {
                                const activeV = sec.versions.find(v => v.id === sec.activeVersionId);
                                return activeV?.content.includes(s.action) || activeV?.content.includes(s.title);
                            });
                            
                            return (
                                <SuggestionCard 
                                    key={idx} 
                                    suggestion={s} 
                                    onAdd={() => onAddSection(msg.id, s.markdownContent)}
                                    isAdded={isAdded}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

             {msg.duration !== undefined && (
                <div className="mt-3 flex items-center text-xs text-slate-500 dark:text-slate-400">
                    <ClockIcon className="w-3.5 h-3.5 mr-1.5" />
                    <span>Task completed in {formatDuration(msg.duration)}</span>
                </div>
            )}
            {hasGroundingInfo && (
                <div className="mt-4 pt-3 border-t border-slate-300 dark:border-slate-700 space-y-4">
                    {msg.searchQueries && msg.searchQueries.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Search Queries Performed</h4>
                            <ul className="list-disc list-inside space-y-1">
                                {msg.searchQueries.map((query, index) => (
                                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300">
                                        <code className="text-sm bg-slate-200 dark:bg-slate-900 rounded px-1.5 py-0.5 font-mono">{query}</code>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Sources</h4>
                            <ol className="list-decimal list-inside space-y-1">
                                {msg.groundingChunks.map((chunk, index) => (
                                    chunk.web && (
                                        <li key={index} className="text-sm">
                                            <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline break-all">
                                                {chunk.web.title || chunk.web.uri}
                                            </a>
                                        </li>
                                    )
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
    
    // Only show manual add button if NOT Red Team Review (which has dedicated buttons)
    const actions = !isRedTeam && msg.content && (
        <MessageActions 
            message={msg} 
            onAddSection={onAddSection} 
            isMultiPhase={isMultiPhase} 
            documentSections={documentSections}
        />
    );

    return (
        <div key={msg.id} className="flex justify-start mb-4 group">
             <div className="flex flex-col items-end w-full">
                <div className="flex justify-start w-full">
                    {messageContainer}
                </div>
                <div className="flex justify-end w-full max-w-4xl lg:max-w-6xl">
                    {actions}
                </div>
            </div>
        </div>
    );
  };

  const hasContent = messages.some(m => m.role === 'assistant' && !m.isHidden);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
        <div className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Workflow Execution</h2>
            <div className="flex items-center gap-4">
                {hasContent && (
                    <div className="relative" ref={exportMenuRef}>
                        <button
                            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                            className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            title="Export Content"
                        >
                            <span>Export</span>
                            <ChevronDownIcon className="w-4 h-4" />
                        </button>
                        {isExportMenuOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10 border border-slate-200 dark:border-slate-700">
                                <div className="py-1">
                                    <button
                                        onClick={() => handleExport('docx')}
                                        className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                        Word (.docx)
                                    </button>
                                    <button
                                        onClick={() => handleExport('pdf')}
                                        className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                        PDF (.pdf)
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <button
                    onClick={handleDownloadLogs}
                    className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title="Download Logs"
                >
                    <DownloadIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Logs</span>
                </button>
                <button
                    onClick={onReset}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                    Reset
                </button>
            </div>
        </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
                <SparklesIcon className="w-16 h-16 mb-4 opacity-50"/>
                <p className="text-lg">Your academic workflow will appear here.</p>
                <p>Configure your project and click "Start Workflow".</p>
            </div>
        ) : (
            messages.filter(msg => !msg.isHidden).map(renderMessage)
        )}
        {(workflowState === 'PROCESSING' || workflowState === 'PRE_PROCESSING') && (
             <div className="flex justify-start mb-4">
                <div className="max-w-2xl px-4 py-3 rounded-xl shadow-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                        </div>
                        <span className="text-sm italic text-slate-500 dark:text-slate-400">
                           {workflowState === 'PRE_PROCESSING' ? 'Pre-processing...' : 'AI is thinking...'} ({formatDuration(elapsedTime)})
                        </span>
                    </div>
                </div>
             </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        {workflowState === 'ERROR' && (
            <div className="p-3 mb-2 rounded-md bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm ring-1 ring-inset ring-red-500/20">
                <p className="font-semibold text-red-900 dark:text-red-200">Workflow Interrupted</p>
                <p>An unexpected error occurred. You can try your last prompt again or enter a new one below to continue.</p>
            </div>
        )}
        {(workflowState === 'AWAITING_USER_ACTION' || workflowState === 'COMPLETED' || (workflowState === 'CONFIGURING' && messages.length > 0) || workflowState === 'ERROR') && (
          <div className="flex items-end gap-4">
            {workflowState === 'AWAITING_USER_ACTION' && (
                <button
                onClick={() => onContinue('Proceed')}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 flex-shrink-0"
                >
                Proceed
                </button>
            )}
             <div className="relative flex-grow">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        workflowState === 'AWAITING_USER_ACTION' ? "Provide a specific instruction (e.g., 'Generate section 1.1')..." :
                        workflowState === 'ERROR' ? "Retry your prompt or enter a new one to recover..." :
                        "Ask a follow-up question..."
                    }
                    className="block w-full rounded-lg border-0 bg-slate-100 dark:bg-slate-800 py-2.5 pl-4 pr-12 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm resize-none"
                    aria-label="Chat input"
                />
                <button
                    onClick={handleSend}
                    className="absolute bottom-2.5 right-0 flex items-center justify-center w-10 text-slate-500 hover:text-indigo-500"
                    aria-label="Send message"
                >
                    <PaperAirplaneIcon className="w-5 h-5" />
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowDisplay;
