
import { GoogleGenAI } from "@google/genai";
import { Config, ResearchRequirement, TaskType, FileData, Phase, AnalysisLevel, TokenUsage } from '../types';
import { MASTER_PROMPT, WORKFLOW_PROTOCOLS, UNIVERSAL_OVERRIDE_INSTRUCTION } from '../constants';

const isRetryableError = (error: any): boolean => {
  if (error && typeof error.message === 'string') {
    const message = error.message.toLowerCase();
    // Check for common transient error indicators from the Gemini API.
    return message.includes('503') || message.includes('unavailable') || message.includes('overloaded') || message.includes('rate limit');
  }
  return false;
};

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries || !isRetryableError(error)) {
        console.error(`Request failed after ${attempt} attempts or with a non-retryable error.`, error);
        throw error;
      }
      const delay = initialDelay * (2 ** (attempt - 1)) + Math.random() * 1000;
      console.log(`Attempt ${attempt} failed with a retryable error. Retrying in ${delay.toFixed(0)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};


const chats: Record<string, any> = {};
let ai: GoogleGenAI | null = null;

export function buildConfigYaml(config: Config, phase: Phase): string {
  let relevantConfig: Partial<Config> = {};
  
  switch(phase) {
    case 'generation':
        relevantConfig = { 
            Task_Type: config.Task_Type,
            Input_Type: config.Input_Type,
            Research_Requirement: config.Research_Requirement,
            Target_Word_Count: config.Target_Word_Count,
            Output_Language: config.Output_Language,
            Chapter_Title: config.Chapter_Title,
            Chapter_Subtitle: config.Chapter_Subtitle,
            Additional_Instructions: config.Additional_Instructions,
            Source_A_File: config.Source_A_File,
            Source_B_File: config.Source_B_File,
            Source_B_Content: config.Source_B_Content,
            Book_File: config.Book_File,
            Core_Bibliography: config.Core_Bibliography, // This will be the processed string content
            Chapter_Outline: config.Chapter_Outline,
            Draft_Chapter_Text: config.Draft_Chapter_Text // Included for Citation Verification
        };
        break;
    case 'review':
        relevantConfig = {
            Task_Type: "RED_TEAM_REVIEW" as any, // For protocol selection
            Draft_Chapter_Text: config.Draft_Chapter_Text, // Use Draft_Chapter_Text for model input
            Core_Bibliography: config.Core_Bibliography, // This will be the processed string content
            Additional_Instructions: config.Additional_Instructions,
        };
        break;
    case 'synthesis':
        relevantConfig = {
            Task_Type: "FINAL_SYNTHESIS" as any, // For protocol selection
            Draft_Chapter_Text: config.Draft_Chapter_Text, // Use Draft_Chapter_Text for model input
            Red_Team_Review_Text: config.Red_Team_Review_Text, // Use Red_Team_Review_Text for model input
            Core_Bibliography: config.Core_Bibliography, // This will be the processed string content
            Additional_Instructions: config.Additional_Instructions,
        };
        break;
  }

  // Filter out empty/default values
  Object.keys(relevantConfig).forEach(keyStr => {
      const key = keyStr as keyof Config;
      if (relevantConfig[key] === '' || relevantConfig[key] === 'N/A' || relevantConfig[key] === undefined) {
          delete relevantConfig[key];
      }
  });


  let yamlString = '```yaml\n# ------------------ PROJECT CONFIGURATION ------------------\n';
  for (const [key, value] of Object.entries(relevantConfig)) {
    if (['Core_Bibliography', 'Chapter_Outline', 'Draft_Chapter_Text', 'Red_Team_Review_Text', 'Book_File', 'Source_A_File', 'Source_B_File', 'Source_B_Content', 'Additional_Instructions'].includes(key)) {
      yamlString += `${key}: |\n  ${(value as string).replace(/\n/g, '\n  ')}\n`;
    } else {
      yamlString += `${key}: "${value}"\n`;
    }
  }
  yamlString += '# ---------------- END CONFIGURATION ------------------\n```';
  return yamlString;
}

function getRelevantProtocol(taskType: TaskType | "RED_TEAM_REVIEW" | "FINAL_SYNTHESIS"): string {
    const protocolMap: Record<string, string> = {
        [TaskType.OUTLINE_GENERATION]: "Protocol A: OUTLINE_GENERATION",
        [TaskType.CHAPTER_GENERATION]: "Protocol B: CHAPTER_GENERATION",
        [TaskType.CHAPTER_RECONSTRUCTION]: "Protocol C: CHAPTER_RECONSTRUCTION (The \"Lens\")",
        [TaskType.BOOK_TO_CHAPTER_TRANSMUTATION]: "Protocol D: BOOK_TO_CHAPTER_TRANSMUTATION",
        [TaskType.CHAPTER_INFUSION]: "Protocol G: CHAPTER_INFUSION",
        [TaskType.ACADEMIC_NOTE_GENERATION]: "Protocol H: ACADEMIC_NOTE_GENERATION",
        [TaskType.CONTEXT_PROCESSING]: "Protocol I: CONTEXT_PROCESSING",
        [TaskType.CITATION_VERIFICATION]: "Protocol K: CITATION_VERIFICATION",
        "RED_TEAM_REVIEW": "Protocol E: RED_TEAM_REVIEW",
        "FINAL_SYNTHESIS": "Protocol F: FINAL_SYNTHESIS",
    };

    const protocolIdentifier = protocolMap[taskType];
    if (!protocolIdentifier) {
        return WORKFLOW_PROTOCOLS; // Fallback for safety
    }
    
    const parts = WORKFLOW_PROTOCOLS.split('-----');
    const header = parts.shift() || '';
    
    const relevantProtocolBody = parts.find(p => p.includes(protocolIdentifier));

    if (!relevantProtocolBody) {
        return WORKFLOW_PROTOCOLS; // Fallback for safety
    }
    
    const modifiedHeader = header.replace(
        "select the **one** matching protocol to execute", 
        "execute the following protocol"
    );

    return `${modifiedHeader.trim()}\n-----\n${relevantProtocolBody.trim()}`;
}

const chunkText = (text: string, chunkSize: number): string[] => {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
};

// Helper for concurrency control
async function pLimit<T>(concurrency: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];
    
    for (const task of tasks) {
        const p = task().then(result => {
            results.push(result);
        });
        executing.push(p);
        
        if (executing.length >= concurrency) {
            await Promise.race(executing);
            // Clean up finished promises
            // In a real implementation we'd manage the array index, but Promise.race is tricky for simple removal.
            // Simplified: Wait for one, then continue. Note: this isn't perfect optimal scheduling but works for small batches.
            // Better: remove completed from `executing`.
        }
        
        // Removal logic
        p.finally(() => {
            const idx = executing.indexOf(p);
            if (idx !== -1) executing.splice(idx, 1);
        });
    }
    
    await Promise.all(executing);
    return results;
}


export const extractRelevantContent = async (
    files: FileData[],
    scope: { contextText: string; instructions?: string },
    analysisLevel: AnalysisLevel | ""
): Promise<{ text: string, usage: TokenUsage }> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set");
    }

    const localAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const MAX_CHARS_PER_CHUNK = 100000;
    const INTER_REQUEST_DELAY = 200; 

    // Define the processing function for a SINGLE file
    const processFile = async (file: FileData): Promise<{ text: string, usage: TokenUsage }> => {
        let synthesizedFromFile = '';
        let fileUsage: TokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
        
        const chunks = chunkText(file.content, MAX_CHARS_PER_CHUNK);
        
        for (const chunk of chunks) {
             const prompt = generateExtractionPrompt(chunk, scope, analysisLevel);
             try {
                // Use gemini-3-flash-preview for speed
                const response: any = await withRetry(() => localAi.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: prompt,
                }));
                synthesizedFromFile += (response.text || '') + '\n';
                
                if (response.usageMetadata) {
                    fileUsage.promptTokens += response.usageMetadata.promptTokenCount || 0;
                    fileUsage.responseTokens += response.usageMetadata.candidatesTokenCount || 0;
                    fileUsage.totalTokens += response.usageMetadata.totalTokenCount || 0;
                }
            } catch (error) {
                console.error(`Error processing chunk from document ${file.name}:`, error);
                synthesizedFromFile += `--- Error processing a chunk from this document ---\n`;
            }
             await new Promise(resolve => setTimeout(resolve, INTER_REQUEST_DELAY));
        }
        return { 
            text: `--- From document: ${file.name} ---\n${synthesizedFromFile.trim()}\n\n`,
            usage: fileUsage
        };
    };

    // Parallelize file processing
    // Batch size of 3 is a safe middle ground for browser + API limits
    const tasks = files.map(file => () => processFile(file));
    
    // Simple custom concurrent execution since we don't have p-limit library
    const BATCH_SIZE = 3;
    let results: { text: string, usage: TokenUsage }[] = [];
    
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        const batch = tasks.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(t => t()));
        results = results.concat(batchResults);
    }
    
    const aggregatedText = results.map(r => r.text).join('');
    const aggregatedUsage = results.reduce((acc, curr) => ({
        promptTokens: acc.promptTokens + curr.usage.promptTokens,
        responseTokens: acc.responseTokens + curr.usage.responseTokens,
        totalTokens: acc.totalTokens + curr.usage.totalTokens
    }), { promptTokens: 0, responseTokens: 0, totalTokens: 0 });

    return { text: aggregatedText, usage: aggregatedUsage };
};

const generateExtractionPrompt = (documentChunk: string, scope: { contextText: string; instructions?: string }, analysisLevel: AnalysisLevel | "") => {
        const effectiveAnalysisLevel = analysisLevel || AnalysisLevel.FOCUSED_BALANCE;
        
        let analysisInstruction = '';
        switch (effectiveAnalysisLevel) {
            case AnalysisLevel.HYPER_DEEP:
                analysisInstruction = `
**Analysis Mode: HYPER-DEEP (Full Analysis)**
Your objective is to maximize analytical depth. Conduct a comprehensive semantic interpretation of all materials. Map conceptual networks, theoretical layers, and intertextual relationships. Extract any information that may be relevant, even if marginal. Prioritize completeness, high-resolution contextual understanding, and deep inference. Your summary should be exhaustive and detailed.
                `;
                break;
            case AnalysisLevel.FOCUSED_BALANCE:
                analysisInstruction = `
**Analysis Mode: FOCUSED-BALANCE (Medium Analysis)**
Your objective is a measured and efficient interpretive depth. Conduct a structured analysis guided by the provided context. Filter out peripheral or low-relevance content using semantic relevance detection. Extract the subset of information most likely to be important to the user’s goals. Your summary should be focused and balanced between thoroughness and brevity.
                `;
                break;
            case AnalysisLevel.ECO_SCAN:
                analysisInstruction = `
**Analysis Mode: ECO-SCAN (High-Efficiency Optimization)**
Your objective is to minimize quota usage while retaining critical data.
1. **Contextual Evaluation:** Use the provided context (Title/Subtitle: "${scope.contextText}") to rigorously filter the document.
2. **Semantic Tokenization:** Do not output full prose summaries. Instead, extract and output a condensed, structured list of key semantic tokens, entities, statistical data points, and core arguments that are *strictly* relevant to the context.
3. **Data Reduction:** Discard all preamble, filler, and tangential information.
4. **Format:** Output as a dense, machine-parsable set of notes or bullet points.
                `;
                break;
        }

        const scopeDescription = `**Interpretive Context (Title/Subtitle/Scope):**\n---\n${scope.contextText}\n---`;

        let instructionsPart = '';
        if (scope.instructions && scope.instructions.trim().toLowerCase() !== 'n/a' && scope.instructions.trim() !== '') {
            instructionsPart = `\n\n**Additional Guidance/Instructions:**\n${scope.instructions}`;
        }
        
        return `
You are an expert research assistant. Your task is to analyze a document chunk and extract the most relevant information based on the provided interpretive context, guidance, and specified analysis mode.

${scopeDescription}
${instructionsPart}

${analysisInstruction}

**Source Document Chunk:**
---
${documentChunk}
---

**Core Instructions:**
1.  Adhere strictly to the specified **Analysis Mode**.
2.  Carefully read and understand the **Interpretive Context** and any **Additional Guidance/Instructions**.
3.  Thoroughly scan the provided **Source Document Chunk**.
4.  Extract and synthesize the relevant content.
5.  Combine the extracted information into a single, cohesive output. Do not add any commentary, introductions, or meta-discussion. Your output should be ONLY the processed content.
    `;
};

const executePrompt = async (prompt: string, phaseId: string): Promise<any> => {
    const chat = chats[phaseId];
    if (!chat) {
        throw new Error(`Workflow has not been started for phase ${phaseId}. Call startPhase first.`);
    }
    return await withRetry(() => chat.sendMessage({ message: prompt }));
};


export const startGenerationPhase = async (config: Config, phaseId: string): Promise<{ userPrompt: string, response: any }> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const modelConfig: { tools?: any[] } = {};
  
  // Enable Google Search for both Supplemental (Active) and Full External (Deep) research modes
  // AND ALWAYS for Citation Verification
  if (config.Research_Requirement === ResearchRequirement.FULL_EXTERNAL_RESEARCH || 
      config.Research_Requirement === ResearchRequirement.SUPPLEMENTAL_RESEARCH ||
      config.Task_Type === TaskType.CITATION_VERIFICATION) {
    modelConfig.tools = [{googleSearch: {}}];
  }

  chats[phaseId] = ai.chats.create({
    model: 'gemini-3.1-pro-preview',
    config: modelConfig,
  });

  const configYaml = buildConfigYaml(config, 'generation');
  const relevantProtocols = config.Task_Type ? getRelevantProtocol(config.Task_Type) : WORKFLOW_PROTOCOLS;
  const fullPrompt = `${MASTER_PROMPT}\n${configYaml}\n${relevantProtocols}\n${UNIVERSAL_OVERRIDE_INSTRUCTION}`;

  const response = await executePrompt(fullPrompt, phaseId);
  
  return {
    userPrompt: configYaml,
    response,
  };
};

export const executeReviewPhase = async (config: Config, phaseId: string): Promise<{ userPrompt: string, response: any }> => {
    if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set");
    
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chats[phaseId] = ai.chats.create({ model: 'gemini-3.1-pro-preview' });

    const configYaml = buildConfigYaml(config, 'review');
    const relevantProtocols = getRelevantProtocol("RED_TEAM_REVIEW");
    const fullPrompt = `${MASTER_PROMPT}\n${configYaml}\n${relevantProtocols}\n${UNIVERSAL_OVERRIDE_INSTRUCTION}`;
    const response = await executePrompt(fullPrompt, phaseId);
    return { userPrompt: configYaml, response };
};

export const executeSynthesisPhase = async (config: Config, phaseId: string): Promise<{ userPrompt: string, response: any }> => {
    if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set");
    
    // Always create a fresh instance and chat for the Synthesis phase to ensure clean context
    // and support the multi-step sequential protocol correctly.
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chats[phaseId] = ai.chats.create({ model: 'gemini-3.1-pro-preview' });

    const configYaml = buildConfigYaml(config, 'synthesis');
    const relevantProtocols = getRelevantProtocol("FINAL_SYNTHESIS");
    const fullPrompt = `${MASTER_PROMPT}\n${configYaml}\n${relevantProtocols}\n${UNIVERSAL_OVERRIDE_INSTRUCTION}`;
    const response = await executePrompt(fullPrompt, phaseId);
    return { userPrompt: configYaml, response };
};

export const continueWorkflow = async (userMessage: string, phaseId: string): Promise<any> => {
  const chat = chats[phaseId];
  if (!chat) {
    throw new Error(`Workflow has not been started for phase ${phaseId}. Call startPhase first.`);
  }
  
  // Continue with the existing text-based chat session for this phase
  return await withRetry(() => chat.sendMessage({ message: userMessage }));
};
