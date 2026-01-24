
import { processMarkdown } from '../utils/markdownUtils';

declare global {
    interface Window {
        docx: any;
        jspdf: any;
        html2canvas: any;
    }
}

export const downloadDocx = async (content: string, filename: string) => {
    if (!window.docx) {
        console.error("DOCX library not loaded");
        return;
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } = window.docx;

    // Split by newline
    const lines = content.split('\n');
    const children = [];
    let i = 0;

    // Helper to clean markdown cell content
    const cleanCellText = (text: string) => {
        // Remove bold/italic/code markers and leading hash marks if generic cleaning is needed
        // We keep it simple to avoid stripping content, just remove standard markdown emphasized markers
        return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
    };

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            i++;
            continue;
        }

        // Enhanced Table Detection
        // 1. Check if next line is a separator (e.g., |---| or ---|---)
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        // Regex checks for lines containing only |, -, :, and spaces, must have at least one -
        const isSeparator = /^\|?[\s\-:|]+\|?$/.test(nextLine) && nextLine.includes('-');
        
        // 2. Check if current line looks like a header row (has | separators)
        const hasPipes = trimmed.includes('|');

        if (hasPipes && isSeparator) {
            const tableRows = [];
            
            // Parse Header
            // Remove potential outer pipes for splitting
            const headerContent = trimmed.replace(/^\|/, '').replace(/\|$/, '');
            const headerCells = headerContent.split('|').map(c => c.trim());
            
            tableRows.push(
                new TableRow({
                    children: headerCells.map(text => new TableCell({
                        children: [new Paragraph({ 
                            text: cleanCellText(text), 
                            heading: HeadingLevel.HEADING_4,
                            spacing: { after: 60 }
                        })],
                        shading: { fill: "E5E7EB" }, 
                        width: { size: 100 / headerCells.length, type: WidthType.PERCENTAGE },
                        margins: { top: 100, bottom: 100, left: 100, right: 100 }
                    })),
                })
            );

            // Skip header and separator lines
            i += 2;

            // Parse Body
            while (i < lines.length) {
                const rowLine = lines[i].trim();
                
                // Stop if line doesn't look like a table row or is empty
                if (!rowLine || !rowLine.includes('|')) {
                    break;
                }
                
                // Check if it's just another separator line that crept in
                if (/^\|?[\s\-:|]+\|?$/.test(rowLine) && rowLine.includes('-')) {
                    i++;
                    continue;
                }

                const rowContent = rowLine.replace(/^\|/, '').replace(/\|$/, '');
                const cells = rowContent.split('|').map(c => c.trim());
                
                // Normalize cell count to match header
                // If row has fewer cells, pad with empty strings. If more, they will be added naturally.
                // Word tables prefer uniform grids, so we trust the map iteration or pad.
                // We map based on headerCells to ensure column alignment.
                
                const rowCells = headerCells.map((_, index) => {
                    const cellText = cells[index] || '';
                    return new TableCell({
                        children: [new Paragraph({ text: cleanCellText(cellText), spacing: { after: 40 } })],
                        width: { size: 100 / headerCells.length, type: WidthType.PERCENTAGE },
                        margins: { top: 100, bottom: 100, left: 100, right: 100 }
                    });
                });

                tableRows.push(
                    new TableRow({
                        children: rowCells,
                    })
                );
                i++;
            }

            children.push(new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            }));
            
            children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
            continue;
        }
        
        // Headers
        if (trimmed.startsWith('# ')) {
             children.push(new Paragraph({
                text: cleanCellText(trimmed.replace(/^#\s+/, '')),
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 240, after: 120 }
            }));
            i++; continue;
        }
        if (trimmed.startsWith('## ')) {
             children.push(new Paragraph({
                text: cleanCellText(trimmed.replace(/^##\s+/, '')),
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 100 }
            }));
            i++; continue;
        }
        if (trimmed.startsWith('### ')) {
             children.push(new Paragraph({
                text: cleanCellText(trimmed.replace(/^###\s+/, '')),
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 160, after: 80 }
            }));
            i++; continue;
        }
        if (/^#{4,6}\s/.test(trimmed)) {
             children.push(new Paragraph({
                text: cleanCellText(trimmed.replace(/^#+\s+/, '')),
                heading: HeadingLevel.HEADING_4,
                spacing: { before: 140, after: 60 }
            }));
            i++; continue;
        }

        // Lists
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
             children.push(new Paragraph({
                text: cleanCellText(trimmed.replace(/^[-*]\s+/, '')),
                bullet: { level: 0 },
                spacing: { after: 80 }
            }));
            i++; continue;
        }

        // Numbered Lists
        if (/^\d+\.\s/.test(trimmed)) {
            children.push(new Paragraph({
                text: cleanCellText(trimmed.replace(/^\d+\.\s+/, '')),
                bullet: { level: 0 }, // Using bullet style for simplicity in docx unless strictly numbered list style is configured
                spacing: { after: 80 }
            }));
            i++; continue;
        }

        // Standard Paragraph
        children.push(new Paragraph({
            children: [new TextRun(cleanCellText(line))],
            spacing: { after: 120 } 
        }));

        i++;
    }
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: children,
        }],
    });

    try {
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error generating DOCX:", error);
    }
};

export const downloadPdf = (content: string, filename: string) => {
    if (!window.jspdf) {
        console.error("jsPDF library not loaded");
        return;
    }

    const { jsPDF } = window.jspdf;
    // Use pt units for easier font size calculation
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxLineWidth = pageWidth - (margin * 2);
    
    let y = margin;

    // Reusing cleanup logic similar to docx export
    const cleanText = (text: string) => {
        return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
    };

    const checkPageBreak = (heightNeeded: number) => {
        if (y + heightNeeded > pageHeight - margin) {
            doc.addPage();
            y = margin;
            return true;
        }
        return false;
    };

    const lines = content.split(/\r?\n/);
    let i = 0;

    // Helper to determine context for tighter list spacing
    const getNextLineType = (index: number): 'list' | 'text' => {
        for (let j = index + 1; j < lines.length; j++) {
            const t = lines[j].trim();
            if (t) {
                 if (t.startsWith('- ') || t.startsWith('* ') || /^\d+\.\s/.test(t)) return 'list';
                 return 'text';
            }
        }
        return 'text';
    };

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            // SKIP empty lines. We rely on spacingAfter/spacingBefore for layout gaps.
            i++;
            continue;
        }

        // Code Block Detection
        if (trimmed.startsWith('```')) {
            let codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            
            if (codeLines.length > 0) {
                doc.setFont("courier", "normal");
                doc.setFontSize(10);
                const codeText = codeLines.join('\n');
                // Wrap code text
                const codeSplit = doc.splitTextToSize(codeText, maxLineWidth - 20);
                const blockHeight = (codeSplit.length * 12) + 20;
                
                checkPageBreak(blockHeight);
                
                // Background
                doc.setFillColor(248, 248, 250);
                doc.setDrawColor(220, 220, 230);
                doc.rect(margin, y, maxLineWidth, blockHeight, 'FD');
                
                // Text
                doc.setTextColor(60, 60, 70);
                doc.text(codeSplit, margin + 10, y + 15);
                doc.setTextColor(0, 0, 0); // Reset
                
                y += blockHeight + 15;
            }
            i++; // Skip closing tick
            continue;
        }

        // Table Detection
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        const isTableStart = trimmed.includes('|') && /^\|?[\s\-:|]+\|?$/.test(nextLine);

        if (isTableStart) {
            const headers = trimmed.split('|').map(t => cleanText(t)).filter(t => t !== '');
            const body: string[][] = [];
            i += 2; // Skip header and separator
            
            while (i < lines.length) {
                const rowLine = lines[i].trim();
                if (!rowLine || !rowLine.includes('|')) break;
                
                // Check for mid-table separators and ignore
                if (/^\|?[\s\-:|]+\|?$/.test(rowLine)) {
                    i++; continue;
                }

                const row = rowLine.split('|').map(t => cleanText(t));
                // Handle array edges if pipe starts/ends line
                if (rowLine.startsWith('|')) row.shift();
                if (rowLine.endsWith('|')) row.pop();
                
                body.push(row);
                i++;
            }

            checkPageBreak(60); // Heuristic for header

            if ((doc as any).autoTable) {
                (doc as any).autoTable({
                    head: [headers],
                    body: body,
                    startY: y,
                    margin: { left: margin, right: margin },
                    tableWidth: 'auto',
                    styles: { font: 'helvetica', fontSize: 10, cellPadding: 5 },
                    headStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold', lineColor: [200, 200, 200], lineWidth: 0.5 },
                    bodyStyles: { lineColor: [230, 230, 230], lineWidth: 0.5 },
                    theme: 'grid'
                });
                y = (doc as any).lastAutoTable.finalY + 20;
            } else {
                // Fallback
                doc.setFont("helvetica", "italic");
                doc.setFontSize(10);
                doc.text("[Table content - autoTable plugin missing]", margin, y);
                y += 20;
            }
            continue;
        }

        // Standard Text, Headers, Lists
        let fontSize = 11;
        let fontStyle = "normal";
        let spacingBefore = 0;
        let spacingAfter = 12;
        let text = cleanText(trimmed);
        let xOffset = margin;
        let isBlockQuote = false;

        if (trimmed.startsWith('# ')) {
            fontSize = 24; fontStyle = "bold"; spacingBefore = 24; spacingAfter = 12;
            text = cleanText(trimmed.substring(1));
        } else if (trimmed.startsWith('## ')) {
            fontSize = 18; fontStyle = "bold"; spacingBefore = 20; spacingAfter = 10;
            text = cleanText(trimmed.substring(2));
        } else if (trimmed.startsWith('### ')) {
            fontSize = 14; fontStyle = "bold"; spacingBefore = 16; spacingAfter = 8;
            text = cleanText(trimmed.substring(3));
        } else if (/^#{4,6}\s/.test(trimmed)) {
            fontSize = 12; fontStyle = "bold"; spacingBefore = 12; spacingAfter = 6;
            text = cleanText(trimmed.replace(/^#+\s+/, ''));
        } else if (trimmed.startsWith('> ')) {
            fontStyle = "italic";
            text = cleanText(trimmed.substring(1));
            xOffset += 15;
            isBlockQuote = true;
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            text = "•  " + cleanText(trimmed.substring(1));
            xOffset += 10;
            if (getNextLineType(i) === 'list') {
                spacingAfter = 4; // Tight spacing for list items
            }
        } else if (/^\d+\.\s/.test(trimmed)) {
            text = cleanText(trimmed); // Keep numbering
            xOffset += 10;
            if (getNextLineType(i) === 'list') {
                spacingAfter = 4; // Tight spacing for list items
            }
        }

        doc.setFont("helvetica", fontStyle);
        doc.setFontSize(fontSize);

        const splitText = doc.splitTextToSize(text, maxLineWidth - (xOffset - margin));
        const blockHeight = splitText.length * fontSize * 1.25; // 1.25 line height

        // Determine if we need a page break
        // We only add spacingBefore if we are NOT at the top of the page (y > margin)
        const effectiveSpacingBefore = (y > margin) ? spacingBefore : 0;

        if (y + effectiveSpacingBefore + blockHeight > pageHeight - margin) {
            doc.addPage();
            y = margin;
            // effectiveSpacingBefore is now 0 for the new page
        } else {
            y += effectiveSpacingBefore;
        }

        if (isBlockQuote) {
             doc.setDrawColor(200, 200, 200);
             doc.setLineWidth(2);
             doc.line(margin, y + 2, margin, y + blockHeight - 2);
        }

        // Draw text
        // Note: jsPDF text y-coordinate is the baseline (mostly). 
        // We add fontSize to y to position the baseline correctly relative to the top.
        doc.text(splitText, xOffset, y + fontSize); 
        
        y += blockHeight + spacingAfter;
        i++;
    }

    doc.save(`${filename}.pdf`);
};
