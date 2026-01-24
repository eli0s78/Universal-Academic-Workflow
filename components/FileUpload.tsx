
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Config, FileData } from '../types';
import UploadIcon from './icons/UploadIcon';
import XCircleIcon from './icons/XCircleIcon';
import { parseUploadedFiles } from '../utils/fileParsing';

interface FileUploadProps {
    id: keyof Config;
    label: string;
    disabled: boolean;
    multiple?: boolean;
    onFileUploaded?: (content: string) => void;
    onFilesUploaded?: (files: FileData[]) => void;
    initialContent?: string;
    virtualFileName?: string; // New prop for displaying a name for initialContent
    initialFiles?: FileData[];
}

const labelClass = "block text-sm font-medium leading-6 text-slate-800 dark:text-slate-200 mb-2";

const FileUpload: React.FC<FileUploadProps> = ({ id, label, onFileUploaded, onFilesUploaded, disabled, multiple = false, initialContent = '', virtualFileName, initialFiles }) => {
    const [userManagedFiles, setUserManagedFiles] = useState<FileData[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Ref to track external changes to content for uncontrolled mode
    const previousContentRef = useRef(initialContent);

    // Determine if the component is controlled by the `initialFiles` prop
    const isControlled = useMemo(() => Array.isArray(initialFiles), [initialFiles]);

    // Effect to handle external content updates for text-driven (uncontrolled) mode only.
    // This resets the local user file if the AI or system updates the content prop.
    useEffect(() => {
        if (!isControlled && initialContent !== previousContentRef.current) {
            setUserManagedFiles([]);
            previousContentRef.current = initialContent;
        }
    }, [initialContent, isControlled]);

    // Determines what to show in the UI based on the mode
    const displayFiles = useMemo(() => {
        // Mode 1: Controlled (e.g., Bibliography). Source of truth is props.
        if (isControlled) {
            return initialFiles || [];
        }
        // Mode 2: Uncontrolled/Hybrid (e.g., Source File). Source of truth is local state OR props.
        if (userManagedFiles.length > 0) {
            return userManagedFiles;
        }
        if (initialContent) {
            return [{ name: virtualFileName || 'Pasted_Content_from_Workflow.txt', content: initialContent }];
        }
        return [];
    }, [isControlled, initialFiles, userManagedFiles, initialContent, virtualFileName]);

    // Centralized function to call the parent callbacks
    const callUploadCallbacks = (files: FileData[]) => {
        if (onFilesUploaded) {
            onFilesUploaded(files);
        } else if (onFileUploaded) {
            const concatenatedContent = files
                .map(f => `--- Document: ${f.name} ---\n\n${f.content}`)
                .join('\n\n');
            onFileUploaded(concatenatedContent);
        }
    };

    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setError(null);
        setIsParsing(true);

        const currentFiles = isControlled ? (initialFiles || []) : userManagedFiles;
        const currentUserFileNames = new Set(currentFiles.map(f => f.name));
        
        // Filter out duplicates before parsing to save resources, though parseUploadedFiles processes what's given.
        // Actually, we pass the whole list to the parser, but we should probably filter first or handle duplicates after.
        // Let's rely on the parser to parse valid files, then filter duplicates.
        
        const { parsedFiles, errors } = await parseUploadedFiles(files);
        
        const newUniqueFiles = parsedFiles.filter(f => !currentUserFileNames.has(f.name));

        if (newUniqueFiles.length < parsedFiles.length) {
             // Some were duplicates
             // We could notify user, but usually silent ignore is fine or we can add to error log
        }

        let updatedFiles: FileData[];
        if (multiple) {
            updatedFiles = [...currentFiles, ...newUniqueFiles];
        } else {
            updatedFiles = newUniqueFiles.length > 0 ? [newUniqueFiles[0]] : [];
        }
        
        if (!isControlled) {
            setUserManagedFiles(updatedFiles);
        }
        
        callUploadCallbacks(updatedFiles); 

        if (errors.length > 0) {
            setError(`Issues: ${errors.join(', ')}.`);
        }
        
        if(fileInputRef.current) fileInputRef.current.value = "";
        setIsParsing(false);
    }, [multiple, isControlled, initialFiles, userManagedFiles, onFileUploaded, onFilesUploaded]);

    const onRemoveFile = useCallback((fileNameToRemove: string) => {
        if (isControlled) {
            const updatedFiles = (initialFiles || []).filter(f => f.name !== fileNameToRemove);
            callUploadCallbacks(updatedFiles);
        } else {
            const isVirtualFile = (virtualFileName && fileNameToRemove === virtualFileName) || fileNameToRemove === 'Pasted_Content_from_Workflow.txt';

            if (isVirtualFile) {
                if (onFileUploaded) onFileUploaded('');
            } else {
                const updatedFiles = userManagedFiles.filter(f => f.name !== fileNameToRemove);
                setUserManagedFiles(updatedFiles);
                callUploadCallbacks(updatedFiles);
            }
        }
    }, [isControlled, initialFiles, userManagedFiles, onFileUploaded, onFilesUploaded, virtualFileName]);


    const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled) return;
        handleFiles(e.dataTransfer.files);
    }, [disabled, handleFiles]);

    const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(e.target.files);
    }, [handleFiles]);

    const onBrowseClick = () => {
        if (!disabled) {
            fileInputRef.current?.click();
        }
    };
    
    const dropzoneClassName = `mt-2 flex justify-center rounded-lg border border-dashed px-6 py-10 transition-colors duration-200 ${
        isDragging ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/10' : 'border-slate-900/25 dark:border-slate-700'
    } ${disabled ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed' : 'hover:border-indigo-500'}`;

    const hasFiles = displayFiles.length > 0;

    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>

            {hasFiles && !isParsing && (
                 <div className="mt-2 space-y-2">
                    {displayFiles.map(file => (
                        <div key={file.name} className="flex items-center justify-between rounded-lg border border-slate-900/25 dark:border-slate-700 px-4 py-3 bg-white/5 dark:bg-slate-800/20">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-200 truncate pr-2">{file.name}</p>
                            <button
                                type="button"
                                onClick={() => onRemoveFile(file.name)}
                                disabled={disabled}
                                className="flex-shrink-0 text-slate-500 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Remove ${file.name}`}
                            >
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            
            {(!hasFiles || multiple) && !isParsing && (
                <div 
                    className={dropzoneClassName}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    aria-label={`Drop files for ${label}`}
                >
                    <div className="text-center">
                        <UploadIcon className="mx-auto h-12 w-12 text-slate-400" aria-hidden="true" />
                        <div className="mt-4 flex text-sm leading-6 text-slate-600 dark:text-slate-400">
                            <span 
                                className="relative font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer"
                                role="button"
                                tabIndex={disabled ? -1 : 0}
                                onClick={onBrowseClick}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBrowseClick(); }}}
                            >
                                {hasFiles ? 'Upload more files' : 'Upload a file'}
                                <input ref={fileInputRef} id={id} name={id} type="file" className="sr-only" onChange={onFileChange} accept=".pdf,.docx" disabled={disabled} multiple={multiple} />
                            </span>
                            <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs leading-5 text-slate-600 dark:text-slate-500">PDF or DOCX</p>
                    </div>
                </div>
            )}

            {isParsing && (
                <div className="mt-2 flex items-center justify-center rounded-lg border border-slate-900/25 dark:border-slate-700 px-6 py-10">
                    <div className="flex items-center space-x-2 text-slate-500">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                        <span className="text-sm">Parsing files...</span>
                    </div>
                </div>
            )}

            {error && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-500">{error}</p>
            )}
        </div>
    );
};

export default FileUpload;
