
import React, { useState, useRef, useEffect } from 'react';
import { ChapterSection, SectionVersion } from '../types';
import PencilIcon from './icons/PencilIcon';
import TrashIcon from './icons/TrashIcon';
import HistoryIcon from './icons/HistoryIcon';
import ClipboardIcon from './icons/ClipboardIcon';
import CheckIcon from './icons/CheckIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import { downloadDocx, downloadPdf } from '../services/exportService';
import { processMarkdown, processRedTeamMarkdown } from '../utils/markdownUtils';

const SimpleMarkdown: React.FC<{ text: string; protocol?: string; }> = React.memo(({ text, protocol }) => {
    const html = protocol === 'RED_TEAM_REVIEW' ? processRedTeamMarkdown(text, false) : processMarkdown(text, false);
    return <div className="prose-sm dark:prose-invert max-w-none prose-pre:bg-slate-200 dark:prose-pre:bg-slate-700" dangerouslySetInnerHTML={{ __html: html }} />;
});

const VersionSourceBadge: React.FC<{ source: SectionVersion['source'] }> = ({ source }) => {
    const baseClass = "px-2 py-0.5 text-xs font-medium rounded-full";
    const styles = {
        'ai-generated': "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        'user-edited': "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        'ai-revised': "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
        'user-added': "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    };
    const labels = {
        'ai-generated': "AI Generated",
        'user-edited': "User Edit",
        'ai-revised': "AI Revision",
        'user-added': "User Added"
    };
    return <span className={`${baseClass} ${styles[source]}`}>{labels[source]}</span>;
};

interface LiveDocumentEditorProps {
    sections: ChapterSection[];
    onUpdateSection: (sectionId: string, newContent: string) => void;
    onDeleteSection: (sectionId:string) => void;
    onAddSection: () => void;
    onAssembleDraft: () => void;
    onRevertToVersion: (sectionId: string, versionId: string) => void;
    allowAssembly?: boolean;
}

const LiveDocumentEditor: React.FC<LiveDocumentEditorProps> = ({ sections, onUpdateSection, onDeleteSection, onAddSection, onAssembleDraft, onRevertToVersion, allowAssembly = true }) => {
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [historySectionId, setHistorySectionId] = useState<string | null>(null);
    const [isMasterCopied, setIsMasterCopied] = useState(false);
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

    const handleEdit = (section: ChapterSection) => {
        setHistorySectionId(null); // Close history when editing
        const activeVersion = section.versions.find(v => v.id === section.activeVersionId);
        if (activeVersion) {
            setEditingSectionId(section.id);
            setEditText(activeVersion.content);
        }
    };

    const handleSave = (sectionId: string) => {
        onUpdateSection(sectionId, editText);
        setEditingSectionId(null);
        setEditText('');
    };

    const handleCancel = () => {
        setEditingSectionId(null);
        setEditText('');
    };

    const toggleHistory = (sectionId: string) => {
        setEditingSectionId(null); // Close editor when viewing history
        setHistorySectionId(prev => prev === sectionId ? null : sectionId);
    };

    const handleCopyAll = async () => {
        if (isMasterCopied) return;

        const allContent = sections
            .sort((a, b) => a.order - b.order)
            .map(section => {
                const activeVersion = section.versions.find(v => v.id === section.activeVersionId);
                return activeVersion ? activeVersion.content : '';
            })
            .join('\n\n');
        
        if (!allContent.trim()) return;

        const htmlText = processMarkdown(allContent, true);
        try {
            const htmlBlob = new Blob([htmlText], { type: 'text/html' });
            const textBlob = new Blob([allContent], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
        } catch (err) {
            await navigator.clipboard.writeText(allContent);
        } finally {
            setIsMasterCopied(true);
            setTimeout(() => setIsMasterCopied(false), 2000);
        }
    };
    
    const handleExport = (format: 'docx' | 'pdf') => {
        const allContent = sections
            .sort((a, b) => a.order - b.order)
            .map(section => {
                const activeVersion = section.versions.find(v => v.id === section.activeVersionId);
                return activeVersion ? activeVersion.content : '';
            })
            .join('\n\n');

        if (!allContent.trim()) return;
        
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `document_draft_${timestamp}`;
        
        if (format === 'docx') {
            downloadDocx(allContent, filename);
        } else {
            downloadPdf(allContent, filename);
        }
        setIsExportMenuOpen(false);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800">
            <div className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Live Document Editor</h2>
                <div className="flex items-center gap-2">
                     {sections.length > 0 && (
                        <div className="relative" ref={exportMenuRef}>
                            <button
                                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                className="px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center gap-1"
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
                        onClick={handleCopyAll}
                        disabled={sections.length === 0}
                        className="px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                    >
                        {isMasterCopied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardIcon className="w-4 h-4" />}
                        <span>Copy All</span>
                    </button>
                    {allowAssembly && (
                        <button
                            onClick={onAssembleDraft}
                            disabled={sections.length === 0}
                            className="px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                            Assemble &amp; Proceed
                        </button>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {sections.length === 0 ? (
                    <div className="text-center text-slate-500 dark:text-slate-400 py-10">
                        <p>Add generated sections from the Workflow panel to build your document here.</p>
                    </div>
                ) : (
                    sections.map(section => {
                        const activeVersion = section.versions.find(v => v.id === section.activeVersionId);
                        if (!activeVersion) return null;
                        const isEditing = editingSectionId === section.id;
                        const isViewingHistory = historySectionId === section.id;

                        return (
                            <div key={section.id} className="group relative bg-white dark:bg-slate-800/70 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700/50 transition-shadow duration-200">
                               <div className="p-4">
                                    {isEditing ? (
                                        <div className="flex flex-col">
                                            <textarea
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                                className="w-full h-64 p-2 border rounded-lg bg-slate-100 dark:bg-slate-900/70 border-slate-300 dark:border-slate-600 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                            />
                                            <div className="flex justify-end space-x-2 mt-2">
                                                <button onClick={handleCancel} className="text-sm text-slate-600 dark:text-slate-300 hover:underline">Cancel</button>
                                                <button onClick={() => handleSave(section.id)} className="px-3 py-1 text-sm font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-500">Save</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="absolute top-2 right-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-slate-800 p-1 rounded-md z-10">
                                                <button onClick={() => handleEdit(section)} className="p-1 text-slate-500 hover:text-indigo-500"><PencilIcon className="w-4 h-4" /></button>
                                                <button onClick={() => toggleHistory(section.id)} className="p-1 text-slate-500 hover:text-indigo-500"><HistoryIcon className="w-4 h-4" /></button>
                                                <button onClick={() => onDeleteSection(section.id)} className="p-1 text-slate-500 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                            <SimpleMarkdown text={activeVersion.content} protocol={section.protocol} />
                                        </>
                                    )}
                                </div>
                                {isViewingHistory && (
                                    <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                                        <h4 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-300">Version History for "{section.title}"</h4>
                                        <ul className="space-y-2">
                                            {[...section.versions].reverse().map(version => (
                                                <li key={version.id} className={`p-2 rounded-md flex justify-between items-center ${version.id === section.activeVersionId ? 'bg-indigo-100/70 dark:bg-indigo-900/30' : 'bg-slate-100 dark:bg-slate-700/50'}`}>
                                                    <div>
                                                        <VersionSourceBadge source={version.source} />
                                                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{new Date(version.createdAt).toLocaleString()}</span>
                                                    </div>
                                                    {version.id !== section.activeVersionId && (
                                                        <button
                                                            onClick={() => onRevertToVersion(section.id, version.id)}
                                                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                                                        >
                                                            Revert
                                                        </button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default LiveDocumentEditor;
