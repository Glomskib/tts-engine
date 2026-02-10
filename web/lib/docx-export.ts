/**
 * Script .docx Export Utility
 *
 * Generates a formatted Word document from skit data + AI score.
 * Uses dynamic import so the `docx` library isn't in the main bundle.
 */

interface Beat {
  t: string;
  action: string;
  dialogue?: string;
  on_screen_text?: string;
}

interface SkitData {
  hook_line: string;
  beats: Beat[];
  cta_line: string;
  cta_overlay?: string;
  b_roll?: string[];
  overlays?: string[];
}

interface AIScore {
  overall_score: number;
  hook_strength: number;
  humor_level: number;
  virality_potential: number;
  strengths?: string[];
  improvements?: string[];
}

interface DocxExportOptions {
  skit: SkitData;
  aiScore?: AIScore | null;
  title?: string;
  productName?: string;
  brandName?: string;
}

export async function generateDocx(options: DocxExportOptions): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } =
    await import('docx');

  const { skit, aiScore, title, productName, brandName } = options;

  const children: InstanceType<typeof Paragraph>[] = [];

  // Title
  children.push(
    new Paragraph({
      text: title || 'Script Export',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Metadata line
  const metaParts: string[] = [];
  if (productName) metaParts.push(`Product: ${productName}`);
  if (brandName) metaParts.push(`Brand: ${brandName}`);
  metaParts.push(`Exported: ${new Date().toLocaleDateString()}`);
  children.push(
    new Paragraph({
      children: [new TextRun({ text: metaParts.join('  |  '), color: '888888', size: 20 })],
      spacing: { after: 300 },
      alignment: AlignmentType.CENTER,
    })
  );

  // Separator
  children.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
      spacing: { after: 200 },
    })
  );

  // Hook
  children.push(
    new Paragraph({
      text: 'HOOK',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: skit.hook_line, bold: true, size: 28 })],
      spacing: { after: 300 },
    })
  );

  // Beats / Scenes
  children.push(
    new Paragraph({
      text: 'SCENES',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200 },
    })
  );

  skit.beats.forEach((beat, idx) => {
    // Beat header
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Beat ${idx + 1}`, bold: true, size: 24 }),
          new TextRun({ text: `  [${beat.t}]`, color: '666666', size: 22 }),
        ],
        spacing: { before: 200 },
      })
    );

    // Action
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Action: ', bold: true, size: 22 }),
          new TextRun({ text: beat.action, size: 22 }),
        ],
        spacing: { before: 60 },
      })
    );

    // Dialogue
    if (beat.dialogue) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Dialogue: ', bold: true, size: 22 }),
            new TextRun({ text: `"${beat.dialogue}"`, italics: true, size: 22 }),
          ],
          spacing: { before: 40 },
        })
      );
    }

    // On-screen text
    if (beat.on_screen_text) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'On-Screen Text: ', bold: true, size: 22 }),
            new TextRun({ text: beat.on_screen_text, size: 22, color: '2563EB' }),
          ],
          spacing: { before: 40 },
        })
      );
    }
  });

  // CTA
  children.push(
    new Paragraph({
      text: 'CALL TO ACTION',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: skit.cta_line, bold: true, size: 24 })],
      spacing: { after: 100 },
    })
  );
  if (skit.cta_overlay) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Overlay: ', bold: true, size: 22 }),
          new TextRun({ text: skit.cta_overlay, size: 22 }),
        ],
      })
    );
  }

  // B-Roll
  if (skit.b_roll?.length) {
    children.push(
      new Paragraph({
        text: 'B-ROLL SUGGESTIONS',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 },
      })
    );
    skit.b_roll.forEach((br, idx) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${idx + 1}. ${br}`, size: 22 })],
          spacing: { before: 40 },
        })
      );
    });
  }

  // AI Score Summary
  if (aiScore) {
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        spacing: { before: 300, after: 200 },
      })
    );
    children.push(
      new Paragraph({
        text: 'AI SCORE SUMMARY',
        heading: HeadingLevel.HEADING_2,
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Overall: ${aiScore.overall_score}/10`, bold: true, size: 28 }),
          new TextRun({ text: `   Hook: ${aiScore.hook_strength}/10  |  Humor: ${aiScore.humor_level}/10  |  Viral: ${aiScore.virality_potential}/10`, size: 22, color: '666666' }),
        ],
        spacing: { after: 100 },
      })
    );

    if (aiScore.strengths?.length) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Strengths:', bold: true, size: 22, color: '16a34a' })],
          spacing: { before: 100 },
        })
      );
      aiScore.strengths.forEach((s) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `  • ${s}`, size: 22 })],
          })
        );
      });
    }

    if (aiScore.improvements?.length) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Could Improve:', bold: true, size: 22, color: 'f97316' })],
          spacing: { before: 100 },
        })
      );
      aiScore.improvements.forEach((s) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `  • ${s}`, size: 22 })],
          })
        );
      });
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
}
