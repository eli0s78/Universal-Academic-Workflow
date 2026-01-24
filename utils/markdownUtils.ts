

export const applyInlineFormatting = (line: string): string => {
    return line
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<u>$1</u>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
};

// Helper for generating styled HTML tags
const styled = (tag: string, classes: string, styles: string, content: string, forClipboard: boolean): string => {
    return forClipboard ? `<${tag} style="${styles}">${content}</${tag}>` : `<${tag} class="${classes}">${content}</${tag}>`;
};

export const processMarkdown = (text: string, forClipboard: boolean): string => {
    const cleanedText = text.replace(/^\s*class=".*">\s*(\r\n|\n|\r)?/gm, '');

    const lines = cleanedText.split('\n');
    let html = '';
    let listType: 'ul' | 'ol' | null = null;
    let inBlockquote = false;

    const closeList = () => {
        if (listType) {
            html += `</${listType}>`;
            listType = null;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
        const ulMatch = line.match(/^(\s*)[-*•]\s+(.*)/);

        if (!olMatch && !ulMatch) {
            closeList();
        }

        if (inBlockquote && !line.trim().startsWith('>')) {
            if (html.endsWith('<br>')) html = html.slice(0, -4);
            html += '</blockquote>';
            inBlockquote = false;
        }
        
        const hierarchicalHeadingMatch = line.match(/^\s*(?:[-*•]\s+)?(\d+(\.\d+)+)\.?\s+(.*)/);
        if (hierarchicalHeadingMatch) {
            const numberString = hierarchicalHeadingMatch[1];
            const content = applyInlineFormatting(hierarchicalHeadingMatch[3]);
            const cleanNumberString = numberString.replace(/\.0$/, '');
            const depth = cleanNumberString.split('.').length;
            const headingLevel = Math.min(6, depth + 1);
            const hClasses = ['text-2xl font-bold mt-8 mb-4', 'text-xl font-bold mt-6 mb-3 border-b pb-2', 'text-lg font-semibold mt-4 mb-2', 'text-md font-semibold mt-3 mb-2', 'text-base font-semibold mt-2 mb-1', 'text-sm font-semibold mt-2 mb-1'];
            const hStyles = ['font-size: 1.875rem; font-weight: bold; margin-top: 0.67em; margin-bottom: 0.33em; page-break-after: avoid;', 'font-size: 1.5rem; font-weight: bold; margin-top: 0.83em; margin-bottom: 0.33em; page-break-after: avoid;', 'font-size: 1.25rem; font-weight: bold; margin-top: 1em; margin-bottom: 0.33em; page-break-after: avoid;', 'font-size: 1.125rem; font-weight: bold; margin-top: 1.1em; margin-bottom: 0.33em;', 'font-size: 1rem; font-weight: bold; margin-top: 1.33em; margin-bottom: 0.33em;', 'font-size: 0.875rem; font-weight: bold; margin-top: 1.67em; margin-bottom: 0.33em;'];
            const classIndex = headingLevel - 1;
            html += styled(`h${headingLevel}`, hClasses[classIndex], hStyles[classIndex], `${cleanNumberString} ${content}`, forClipboard);
            continue;
        }
        
        const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const content = applyInlineFormatting(headingMatch[2]);
            const hClasses = ['text-2xl font-bold mt-8 mb-4', 'text-xl font-bold mt-6 mb-3 border-b pb-2', 'text-lg font-semibold mt-4 mb-2', 'text-md font-semibold mt-3 mb-2', 'text-base font-semibold mt-2 mb-1', 'text-sm font-semibold mt-2 mb-1'];
            const hStyles = ['font-size: 2em; font-weight: bold; margin-top: 0.67em; margin-bottom: 0.33em; page-break-after: avoid;', 'font-size: 1.5em; font-weight: bold; margin-top: 0.83em; margin-bottom: 0.33em; page-break-after: avoid;', 'font-size: 1.17em; font-weight: bold; margin-top: 1em; margin-bottom: 0.33em; page-break-after: avoid;', 'font-size: 1em; font-weight: bold; margin-top: 1.33em; margin-bottom: 0.33em;', 'font-size: 0.83em; font-weight: bold; margin-top: 1.67em; margin-bottom: 0.33em;', 'font-size: 0.67em; font-weight: bold; margin-top: 2.33em; margin-bottom: 0.33em;'];
            html += styled(`h${level}`, hClasses[level-1], hStyles[level-1], content, forClipboard);
            continue;
        }

        if (line.trim().startsWith('>')) {
            if (!inBlockquote) {
                html += styled('blockquote', 'pl-4 my-2 border-l-4 border-slate-300 dark:border-slate-600 italic text-slate-600 dark:text-slate-400', 'padding-left: 1em; margin: 0.5em 0; border-left: 4px solid #d1d5db; font-style: italic; color: #4b5563;', '', forClipboard);
                inBlockquote = true;
            }
            html += applyInlineFormatting(line.trim().substring(1).trim()) + '<br>';
            continue;
        }

        if (line.startsWith('```')) {
            const lang = line.substring(3).trim();
            let code = '';
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                code += lines[i] + '\n';
                i++;
            }
            const escapedCode = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            // For clipboard/export, use pre-wrap to avoid scrolling and allow printing
            const preStyles = forClipboard 
                ? "background-color: #f3f4f6; border-radius: 6px; padding: 12px; margin: 8px 0; font-size: 12px; color: #1f2937; white-space: pre-wrap; word-wrap: break-word; border: 1px solid #e5e7eb;" 
                : "background-color: #f3f4f6; border-radius: 6px; padding: 16px; margin: 8px 0; overflow-x: auto; font-size: 14px; color: #1f2937;";
                
            html += styled('pre', "bg-slate-100 dark:bg-slate-800 rounded-md p-4 my-2 overflow-x-auto text-sm", preStyles, styled('code', `font-mono ${lang ? `language-${lang}` : ''}`, "font-family: monospace;", escapedCode, forClipboard), forClipboard);
            continue;
        }

        const isTableLine = line.trim().startsWith('|') && line.trim().endsWith('|');
        const nextLineIsSeparator = /^\s*\|?(\s*:?-+\s*:?\s*\|)+(\s*:?-+\s*:?)?\s*\|?\s*$/.test(lines[i + 1] || '');
        if (isTableLine && nextLineIsSeparator) {
            const headers = line.split('|').map(h => h.trim()).slice(1, -1);
            i++; 
            const tableClasses = "not-prose w-full table-auto border-collapse my-4 text-sm";
            // Fixed table layout helps PDF rendering stability by preventing horizontal overflow
            const tableStyles = "border-collapse: collapse; width: 100%; table-layout: fixed; border: 1px solid #e5e7eb; margin: 1em 0; font-size: 0.875rem; line-height: 1.25rem;";
            const thClasses = "border border-slate-300 dark:border-slate-600 px-4 py-2 text-left bg-slate-200 dark:bg-slate-700 font-semibold";
            const thStyles = "border: 1px solid #9ca3af; padding: 6px; text-align: left; background-color: #e5e7eb; font-weight: bold; word-wrap: break-word; vertical-align: top;";
            const tdClasses = "border border-slate-300 dark:border-slate-600 px-4 py-2 bg-white dark:bg-slate-800";
            const tdStyles = "border: 1px solid #e5e7eb; padding: 6px; text-align: left; background-color: #ffffff; word-wrap: break-word; vertical-align: top;";
            const trStyles = "";
            
            let tableHtml = `<table ${forClipboard ? `style="${tableStyles}"` : `class="${tableClasses}"`}>`;
            tableHtml += `<thead><tr ${forClipboard ? `style="${trStyles}"` : ''}>`;
            tableHtml += headers.map(h => styled('th', thClasses, thStyles, applyInlineFormatting(h), forClipboard)).join('');
            tableHtml += `</tr></thead><tbody>`;

            i++;
            while(i < lines.length && lines[i].trim().startsWith('|')) {
                const cells = lines[i].split('|').map(c => c.trim()).slice(1, -1);
                tableHtml += `<tr ${forClipboard ? `style="${trStyles}"` : ''}>`;
                tableHtml += cells.map(c => styled('td', tdClasses, tdStyles, applyInlineFormatting(c), forClipboard)).join('');
                tableHtml += '</tr>';
                i++;
            }
            i--; 
            tableHtml += `</tbody></table>`;
            html += tableHtml;
            continue;
        }
        
        if (olMatch) {
            if (listType !== 'ol') {
                closeList();
                const olClasses = 'list-decimal list-inside space-y-1 my-2 pl-4';
                const olStyles = 'list-style-type: decimal; list-style-position: inside; margin: 0.5rem 0; padding-left: 1rem;';
                html += forClipboard ? `<ol style="${olStyles}">` : `<ol class="${olClasses}">`;
                listType = 'ol';
            }
            html += styled('li', 'mb-1', 'margin-bottom: 0.25rem;', applyInlineFormatting(olMatch[2]), forClipboard);
            continue;
        }
        
        if (ulMatch) {
            if (listType !== 'ul') {
                closeList();
                const ulClasses = 'list-disc list-inside space-y-1 my-2 pl-4';
                const ulStyles = 'list-style-type: disc; list-style-position: inside; margin: 0.5rem 0; padding-left: 1rem;';
                html += forClipboard ? `<ul style="${ulStyles}">` : `<ul class="${ulClasses}">`;
                listType = 'ul';
            }
            html += styled('li', 'mb-1', 'margin-bottom: 0.25rem;', applyInlineFormatting(ulMatch[2]), forClipboard);
            continue;
        }

        if (line.trim()) {
            html += styled('p', 'my-2', 'margin: 0.5em 0;', applyInlineFormatting(line), forClipboard);
        }
    }
    
    closeList();
    
    if (inBlockquote) {
        if (html.endsWith('<br>')) html = html.slice(0, -4);
        html += '</blockquote>';
    }
    
    return html;
};

export const processRedTeamMarkdown = (text: string, forClipboard: boolean): string => {
    const styled = (tag: string, classes: string, styles: string, content: string, forClipboard: boolean): string => {
        return forClipboard ? `<${tag} style="${styles}">${content}</${tag}>` : `<${tag} class="${classes}">${content}</${tag}>`;
    };

    const blocks = text.split(/\n(?=Part \d+:)/);
    let html = '';

    blocks.forEach(block => {
        const match = block.match(/^Part (\d+):\s+(.*)/i);
        if (match) {
            const partNumber = match[1];
            const partTitle = applyInlineFormatting(match[2]);
            const content = block.substring(match[0].length).trim();

            const containerClasses = "my-6 rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden";
            const headerClasses = "flex items-center gap-x-3 bg-slate-100 dark:bg-slate-800 px-4 py-2 border-b border-slate-300 dark:border-slate-700";
            const numberClasses = "flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-xs font-bold rounded-full";
            const titleClasses = "font-semibold text-md text-slate-800 dark:text-slate-200";
            const contentContainerClasses = "p-4";
            
            const containerStyles = "margin: 1.5em 0; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid;";
            const headerStyles = "display: flex; align-items: center; gap: 0.75em; background-color: #f1f5f9; padding: 0.5em 1em; border-bottom: 1px solid #cbd5e1;";
            const numberStyles = "width: 1.5em; height: 1.5em; background-color: #4f46e5; color: white; font-size: 0.75em; font-weight: bold; border-radius: 50%; text-align: center; line-height: 1.5em; display: inline-block; margin-right: 10px;";
            const titleStyles = "font-weight: 600; font-size: 1em; color: #1e293b; display: inline-block;";
            const contentStyles = "padding: 1em;";

            if (forClipboard) {
                html += `<div style="${containerStyles}">`;
                html += `<div style="${headerStyles}">
                            <span style="${numberStyles}">${partNumber}</span>
                            <span style="${titleStyles}">${partTitle}</span>
                        </div>`;
                html += `<div style="${contentStyles}">${processMarkdown(content, forClipboard)}</div>`;
                html += `</div>`;
            } else {
                html += `<div class="${containerClasses}">`;
                html += `<div class="${headerClasses}">
                            <span class="${numberClasses}">${partNumber}</span>
                            <h3 class="${titleClasses}">${partTitle}</h3>
                        </div>`;
                html += `<div class="${contentContainerClasses}">${processMarkdown(content, forClipboard)}</div>`;
                html += `</div>`;
            }
        } else {
             html += processMarkdown(block, forClipboard);
        }
    });

    return html;
};

export interface SuggestionBlock {
    original: string;
    priority: string;
    title: string;
    context: string;
    action: string;
    markdownContent: string;
}

export const extractRedTeamSuggestions = (text: string): { cleanText: string, suggestions: SuggestionBlock[] } => {
    // Robust Regex: Matches tag with potential optional whitespace inside or around.
    // Handles multiline content non-greedily.
    const suggestionRegex = /<<<\s*SUGGESTION_START\s*>>>([\s\S]*?)<<<\s*SUGGESTION_END\s*>>>/gi;
    const suggestions: SuggestionBlock[] = [];
    
    // First pass: extract suggestions
    let cleanText = text.replace(suggestionRegex, (match, content) => {
        const priorityMatch = content.match(/\[Priority:\s*(.*?)\]/i);
        const priority = priorityMatch ? priorityMatch[1].trim() : 'MEDIUM';
        
        let title = 'Untitled Suggestion';
        let context = '';
        let action = '';

        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        
        // Find fields with simple loose matching
        lines.forEach((line) => {
            const lowerLine = line.toLowerCase();
            if (lowerLine.startsWith('**suggestion:**') || lowerLine.startsWith('suggestion:')) {
                // Remove prefix and priority block
                let cleanLine = line.replace(/\*\*Suggestion:\*\*/i, '').replace(/Suggestion:/i, '');
                cleanLine = cleanLine.replace(/\[Priority:.*?\]/i, '').trim();
                if (cleanLine) title = cleanLine;
            }
            else if (lowerLine.startsWith('**context:**') || lowerLine.startsWith('context:')) {
                 context = line.replace(/\*\*Context:\*\*/i, '').replace(/Context:/i, '').trim();
            }
        });
        
        // Robust Action Extraction: Find start of Action, take everything after
        const actionIndex = lines.findIndex(l => l.toLowerCase().startsWith('**action:**') || l.toLowerCase().startsWith('action:'));
        if (actionIndex !== -1) {
            let actionLines = [lines[actionIndex].replace(/\*\*Action:\*\*/i, '').replace(/Action:/i, '').trim()];
            for(let i = actionIndex + 1; i < lines.length; i++) {
                actionLines.push(lines[i]);
            }
            action = actionLines.join('\n').trim();
        }

        const markdownContent = `### ${title}\n**Priority:** ${priority}\n\n**Context:** ${context}\n\n**Action:**\n${action}`;

        suggestions.push({
            original: match,
            priority,
            title,
            context,
            action,
            markdownContent
        });

        return ''; // Remove extracted block from main text
    });

    // Cleanup: aggressively strip any left-over tags that might not have matched the full block regex
    // This cleans up the "left over code" issue reported by the user
    cleanText = cleanText
        .replace(/<<<\s*SUGGESTION_START\s*>>>/gi, '')
        .replace(/<<<\s*SUGGESTION_END\s*>>>/gi, '')
        .trim();

    return { cleanText, suggestions };
};
