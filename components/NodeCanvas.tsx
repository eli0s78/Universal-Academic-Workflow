
import React, { useRef, useState, useEffect } from 'react';
import { WorkflowNode, WorkflowEdge, TaskType } from '../types';
import PlusCircleIcon from './icons/PlusCircleIcon';
import TrashIcon from './icons/TrashIcon';

interface NodeCanvasProps {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    selectedNodeId: string | null;
    onNodeSelect: (id: string) => void;
    onNodeMove: (id: string, position: { x: number, y: number }) => void;
    onAddNode: (type: TaskType, position: { x: number, y: number }) => void;
    onDeleteNode: (id: string) => void;
    onConnect: (sourceId: string, targetId: string) => void;
}

const GRID_SIZE = 20;

const TASK_COLORS: Record<TaskType, string> = {
    [TaskType.OUTLINE_GENERATION]: 'bg-blue-600',
    [TaskType.CHAPTER_GENERATION]: 'bg-indigo-600',
    [TaskType.CHAPTER_RECONSTRUCTION]: 'bg-violet-600',
    [TaskType.CHAPTER_INFUSION]: 'bg-purple-600',
    [TaskType.ACADEMIC_NOTE_GENERATION]: 'bg-teal-600',
    [TaskType.BOOK_TO_CHAPTER_TRANSMUTATION]: 'bg-cyan-600',
    [TaskType.RED_TEAM_REVIEW]: 'bg-rose-600',
    [TaskType.FINAL_SYNTHESIS]: 'bg-emerald-600',
};

const TASK_LABELS: Record<TaskType, string> = {
    [TaskType.OUTLINE_GENERATION]: 'Outline',
    [TaskType.CHAPTER_GENERATION]: 'Chapter',
    [TaskType.CHAPTER_RECONSTRUCTION]: 'Reconstruct',
    [TaskType.CHAPTER_INFUSION]: 'Infusion',
    [TaskType.ACADEMIC_NOTE_GENERATION]: 'Note Gen',
    [TaskType.BOOK_TO_CHAPTER_TRANSMUTATION]: 'Book Transmute',
    [TaskType.RED_TEAM_REVIEW]: 'Red Team',
    [TaskType.FINAL_SYNTHESIS]: 'Synthesis',
};

const NodeCanvas: React.FC<NodeCanvasProps> = ({ nodes, edges, selectedNodeId, onNodeSelect, onNodeMove, onAddNode, onDeleteNode, onConnect }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [showAddMenu, setShowAddMenu] = useState<{ x: number, y: number } | null>(null);

    // Pan/Zoom State (Basic implementation)
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const newScale = Math.min(Math.max(0.5, scale - e.deltaY * zoomSensitivity), 2);
            setScale(newScale);
        } else {
             // Pan
             setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle mouse or Alt+Click
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            return;
        }
        // Click on canvas background to deselect or close menus
        if (e.target === canvasRef.current) {
            onNodeSelect('');
            setShowAddMenu(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });

        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            setPanStart({ x: e.clientX, y: e.clientY });
        }

        if (draggingNodeId) {
            // Calculate new node position in canvas space
            // (Mouse - CanvasOffset - DragOffset) / Scale
            const canvasRect = canvasRef.current?.getBoundingClientRect();
            if (canvasRect) {
                const x = (e.clientX - canvasRect.left - pan.x) / scale - dragOffset.x;
                const y = (e.clientY - canvasRect.top - pan.y) / scale - dragOffset.y;
                onNodeMove(draggingNodeId, { x, y });
            }
        }
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        setDraggingNodeId(null);
        if (connectingNodeId) {
            // If we dropped on nothing, cancel connection
            setConnectingNodeId(null);
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onNodeSelect(id);
        const node = nodes.find(n => n.id === id);
        if (node && canvasRef.current) {
             const canvasRect = canvasRef.current.getBoundingClientRect();
             // Calculate offset of mouse relative to node top-left
             const nodeScreenX = canvasRect.left + pan.x + node.position.x * scale;
             const nodeScreenY = canvasRect.top + pan.y + node.position.y * scale;
             
             setDragOffset({
                 x: (e.clientX - nodeScreenX) / scale,
                 y: (e.clientY - nodeScreenY) / scale
             });
             setDraggingNodeId(id);
        }
    };

    const handlePortMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        e.preventDefault();
        setConnectingNodeId(id);
    };

    const handlePortMouseUp = (e: React.MouseEvent, targetId: string) => {
        e.stopPropagation();
        if (connectingNodeId && connectingNodeId !== targetId) {
            onConnect(connectingNodeId, targetId);
        }
        setConnectingNodeId(null);
    };
    
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if(canvasRect) {
            // Position relative to canvas logic 0,0 (not screen)
             const x = (e.clientX - canvasRect.left - pan.x) / scale;
             const y = (e.clientY - canvasRect.top - pan.y) / scale;
             setShowAddMenu({ x, y });
        }
    };

    const addNode = (type: TaskType) => {
        if (showAddMenu) {
            onAddNode(type, showAddMenu);
            setShowAddMenu(null);
        }
    };

    return (
        <div 
            ref={canvasRef}
            className="w-full h-full bg-slate-100 dark:bg-slate-900 overflow-hidden relative select-none cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            style={{
                backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
                backgroundSize: `${20 * scale}px ${20 * scale}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`
            }}
        >
            <div 
                className="absolute origin-top-left transition-transform duration-75 ease-linear"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
                {/* Edges Layer */}
                <svg className="overflow-visible pointer-events-none absolute top-0 left-0 w-full h-full">
                    {edges.map(edge => {
                        const source = nodes.find(n => n.id === edge.source);
                        const target = nodes.find(n => n.id === edge.target);
                        if (!source || !target) return null;
                        
                        const sx = source.position.x + 200; // Right side of source
                        const sy = source.position.y + 40;  // Middle of source
                        const tx = target.position.x;       // Left side of target
                        const ty = target.position.y + 40;

                        const dx = Math.abs(tx - sx) / 2;
                        const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;

                        return (
                            <path 
                                key={edge.id} 
                                d={d} 
                                stroke="currentColor" 
                                className="text-slate-400 dark:text-slate-600" 
                                strokeWidth="3" 
                                fill="none" 
                            />
                        );
                    })}
                    {/* Active Connection Line */}
                    {connectingNodeId && (
                        (() => {
                            const source = nodes.find(n => n.id === connectingNodeId);
                            if (!source) return null;
                            const sx = source.position.x + 200;
                            const sy = source.position.y + 40;
                            
                            // Mouse position in canvas coordinates
                            const canvasRect = canvasRef.current?.getBoundingClientRect();
                            if (!canvasRect) return null;
                            const mx = (mousePos.x - canvasRect.left - pan.x) / scale;
                            const my = (mousePos.y - canvasRect.top - pan.y) / scale;

                            const d = `M ${sx} ${sy} L ${mx} ${my}`;
                            return <path d={d} stroke="#6366f1" strokeWidth="2" strokeDasharray="5,5" fill="none" />;
                        })()
                    )}
                </svg>

                {/* Nodes Layer */}
                {nodes.map(node => (
                    <div
                        key={node.id}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        className={`absolute w-[200px] bg-white dark:bg-slate-800 rounded-lg shadow-md border-2 transition-shadow group
                            ${selectedNodeId === node.id ? 'border-indigo-500 shadow-xl z-20' : 'border-slate-200 dark:border-slate-700 z-10'}
                        `}
                        style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
                    >
                        {/* Header */}
                        <div className={`${TASK_COLORS[node.type]} h-2 rounded-t-md`}></div>
                        
                        {/* Body */}
                        <div className="p-3">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">{node.label || TASK_LABELS[node.type]}</h3>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                {node.status === 'running' && <span className="text-indigo-500 animate-pulse">Running...</span>}
                                {node.status === 'completed' && <span className="text-green-500">Completed</span>}
                                {node.status === 'error' && <span className="text-red-500">Error</span>}
                                {node.status === 'idle' && <span>Ready</span>}
                            </div>
                        </div>

                        {/* Input Port */}
                        <div 
                            className="absolute left-[-8px] top-[36px] w-4 h-4 bg-slate-300 dark:bg-slate-600 rounded-full border-2 border-white dark:border-slate-900 hover:bg-indigo-500 cursor-crosshair z-30"
                            onMouseUp={(e) => handlePortMouseUp(e, node.id)}
                            title="Input"
                        />
                        
                        {/* Output Port */}
                        <div 
                            className="absolute right-[-8px] top-[36px] w-4 h-4 bg-slate-300 dark:bg-slate-600 rounded-full border-2 border-white dark:border-slate-900 hover:bg-indigo-500 cursor-crosshair z-30"
                            onMouseDown={(e) => handlePortMouseDown(e, node.id)}
                            title="Output"
                        />
                    </div>
                ))}
            </div>

            {/* Context Menu for Adding Nodes */}
            {showAddMenu && (
                <div 
                    className="absolute bg-white dark:bg-slate-800 shadow-xl rounded-lg border border-slate-200 dark:border-slate-700 p-2 z-50 flex flex-col gap-1 w-48"
                    style={{ 
                        left: showAddMenu.x * scale + pan.x, 
                        top: showAddMenu.y * scale + pan.y 
                    }}
                >
                    <div className="text-xs font-semibold text-slate-500 px-2 py-1 uppercase">Add Node</div>
                    {Object.entries(TASK_LABELS).map(([type, label]) => (
                        <button
                            key={type}
                            onClick={() => addNode(type as TaskType)}
                            className="text-left px-2 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded text-slate-700 dark:text-slate-200 flex items-center gap-2"
                        >
                            <div className={`w-2 h-2 rounded-full ${TASK_COLORS[type as TaskType]}`}></div>
                            {label}
                        </button>
                    ))}
                </div>
            )}
            
            {/* Overlay Controls */}
            <div className="absolute bottom-6 left-6 flex gap-2">
                 <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-2 flex gap-2 border border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                    <span className="flex items-center gap-1"><span className="font-bold">Right-Click</span> to Add Node</span>
                    <span className="w-px bg-slate-200 dark:bg-slate-700"></span>
                    <span className="flex items-center gap-1"><span className="font-bold">Alt+Drag</span> to Pan</span>
                    <span className="w-px bg-slate-200 dark:bg-slate-700"></span>
                    <span className="flex items-center gap-1"><span className="font-bold">Ctrl+Scroll</span> to Zoom</span>
                 </div>
            </div>
        </div>
    );
};

export default NodeCanvas;
