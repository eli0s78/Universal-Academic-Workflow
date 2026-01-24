

export enum TaskType {
  OUTLINE_GENERATION = "OUTLINE_GENERATION",
  CHAPTER_GENERATION = "CHAPTER_GENERATION",
  CHAPTER_RECONSTRUCTION = "CHAPTER_RECONSTRUCTION",
  BOOK_TO_CHAPTER_TRANSMUTATION = "BOOK_TO_CHAPTER_TRANSMUTATION",
  CHAPTER_INFUSION = "CHAPTER_INFUSION",
  ACADEMIC_NOTE_GENERATION = "ACADEMIC_NOTE_GENERATION",
  RED_TEAM_REVIEW = "RED_TEAM_REVIEW",
  FINAL_SYNTHESIS = "FINAL_SYNTHESIS"
}

export type Phase = 'generation' | 'review' | 'synthesis'; // Legacy type, kept for compatibility if needed, but mostly replaced by Node Type

export enum OutlineInputType {
  TITLE_ONLY = "TITLE_ONLY",
  TITLE_AND_CONTEXT_DOCUMENT = "TITLE_AND_CONTEXT_DOCUMENT",
  BIBLIOGRAPHY = "BIBLIOGRAPHY"
}

export enum ChapterGenInputType {
  OUTLINE_ONLY = "OUTLINE_ONLY",
  OUTLINE_AND_BIBLIOGRAPHY = "OUTLINE_AND_BIBLIOGRAPHY",
}

export enum ChapterReconInputType {
  SOURCE_A_AND_SOURCE_B = "SOURCE_A_AND_SOURCE_B"
}

export enum ChapterInfusionInputType {
  SOURCE_A_AND_SOURCE_B = "SOURCE_A_AND_SOURCE_B"
}

export enum BookToChapterInputType {
  BOOK_FILE_ONLY = "BOOK_FILE_ONLY"
}

export enum AcademicNoteInputType {
  FILES_AND_TITLE = "FILES_AND_TITLE"
}

export enum RedTeamInputType {
  DRAFT_CHAPTER = "DRAFT_CHAPTER",
  DRAFT_CHAPTER_AND_BIBLIOGRAPHY = "DRAFT_CHAPTER_AND_BIBLIOGRAPHY"
}

export enum FinalSynthesisInputType {
  DRAFT_AND_RED_TEAM_REVIEW = "DRAFT_AND_RED_TEAM_REVIEW",
  DRAFT_AND_RED_TEAM_REVIEW_AND_BIBLIOGRAPHY = "DRAFT_AND_RED_TEAM_REVIEW_AND_BIBLIOGRAPHY"
}

export type InputType = OutlineInputType | ChapterGenInputType | ChapterReconInputType | BookToChapterInputType | ChapterInfusionInputType | AcademicNoteInputType | RedTeamInputType | FinalSynthesisInputType;


export enum ResearchRequirement {
  PROVIDED_SOURCES_ONLY = "PROVIDED_SOURCES_ONLY",
  SUPPLEMENTAL_RESEARCH = "SUPPLEMENTAL_RESEARCH",
  FULL_EXTERNAL_RESEARCH = "FULL_EXTERNAL_RESEARCH"
}

export enum AnalysisLevel {
  HYPER_DEEP = "HYPER_DEEP",
  FOCUSED_BALANCE = "FOCUSED_BALANCE",
  ECO_SCAN = "ECO_SCAN",
}

export interface FileData {
  name: string;
  content: string;
}

export interface Config {
  Task_Type: TaskType | "";
  Input_Type: InputType | "";
  Research_Requirement: ResearchRequirement | "";
  Analysis_Level: AnalysisLevel | "";
  Target_Word_Count: string;
  Output_Language: string;
  Chapter_Title: string;
  Chapter_Subtitle: string;
  Additional_Instructions: string;
  Source_A_File: string;

  Source_B_File: string;
  Source_B_Files?: FileData[];
  Source_B_Content?: string;
  Book_File: string;
  Core_Bibliography: string; // The *content* of the bibliography files, once processed
  Core_Bibliography_Files?: FileData[]; // The actual file objects selected by the user
  Complementary_Files?: FileData[]; // For Phase 2: Red Team Review (or additional bib for direct starts)
  Chapter_Outline: string;
  Draft_Chapter_Text: string; // AI's internal representation of the draft
  Red_Team_Review_Text: string; // AI's internal representation of the review
  Final_Draft_For_Review: string; // User-editable staging area for the draft chapter
}

export interface WebGroundingSource {
  uri: string;
  title: string;
}

export interface GroundingChunk {
  web?: WebGroundingSource;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  protocol?: string; // To identify which protocol generated the message for custom rendering
  groundingChunks?: GroundingChunk[];
  searchQueries?: string[];
  isHidden?: boolean; // To hide internal prompts from the UI
  duration?: number; // Duration of the task in seconds
}

export enum WorkflowState {
  CONFIGURING = 'CONFIGURING',
  PRE_PROCESSING = 'PRE_PROCESSING',
  PROCESSING = 'PROCESSING',
  AWAITING_USER_ACTION = 'AWAITING_USER_ACTION',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// Types for Live Document Editor
export interface SectionVersion {
  id: string;
  content: string;
  createdAt: Date;
  source: 'ai-generated' | 'user-edited' | 'ai-revised' | 'user-added';
}

export interface ChapterSection {
  id: string; // a unique id for this section
  order: number; // for sorting
  title: string; // The main heading of the section
  versions: SectionVersion[];
  activeVersionId: string; // which version is currently displayed/edited
  sourceMessageId?: string; // ID of the message this section was created from
  protocol?: string;
}

// --- NODE ARCHITECTURE TYPES ---

export interface WorkflowNode {
  id: string;
  type: TaskType;
  position: { x: number; y: number };
  config: Config;
  status: 'idle' | 'running' | 'completed' | 'error';
  label?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface NodeExecutionState {
  messages: Message[];
  workflowState: WorkflowState;
  documentSections: ChapterSection[];
  elapsedTime: number;
  logs: string[];
}