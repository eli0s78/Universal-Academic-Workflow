
import { FileData } from '../types';

declare const pdfjsLib: any;
declare const mammoth: any;

export const parseUploadedFiles = async (files: FileList): Promise<{ parsedFiles: FileData[], errors: string[] }> => {
    const parsedFiles: FileData[] = [];
    const errors: string[] = [];
    
    for (const file of Array.from(files)) {
        const isPdf = file.type === 'application/pdf';
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');

        if (!isPdf && !isDocx) {
            errors.push(`${file.name} (not a PDF or DOCX)`);
            continue;
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            let fullText = '';

            if (isPdf) {
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const items: any[] = textContent.items;
                    let pageText = '';
                    let lastY: number | null = null;
                    
                    for (const item of items) {
                        if (!('str' in item)) continue;
                        const currentY = item.transform[5]; // transform is [a, b, c, d, tx, ty]
                        
                        if (lastY !== null && Math.abs(currentY - lastY) > 5) {
                            pageText += '\n' + item.str;
                        } else {
                            if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n') && item.str) {
                                pageText += ' ';
                            }
                            pageText += item.str;
                        }
                        lastY = currentY;
                    }
                    fullText += pageText + '\n\n';
                }
            } else if (isDocx) {
                const result = await mammoth.extractRawText({ arrayBuffer });
                fullText = result.value;
                if (result.messages.length > 0) {
                    console.log("Mammoth parsing messages for " + file.name, result.messages);
                }
            }
            
            parsedFiles.push({ name: file.name, content: fullText.trim() });
        } catch (e) {
            console.error(`Error parsing ${file.name}:`, e);
            errors.push(`${file.name} (parsing failed)`);
        }
    }
    return { parsedFiles, errors };
};
