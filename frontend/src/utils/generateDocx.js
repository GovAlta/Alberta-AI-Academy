import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
  UnderlineType
} from 'docx'
import { absoluteAssetUrl } from '@/utils/assetUrl.js'

const TYPE_LABELS = {
  video: '▶ Video',
  article: '📄 Article',
  tool: '🛠 Tool',
  download: '⬇ Download',
  social: '💬 Social',
  link: '🔗 Link'
}

/** Returns the primary navigable URL for a content item. */
function getItemUrl(item) {
  if (!item) return null
  return item.url || absoluteAssetUrl(item.downloadUrl) || null
}

/**
 * Generate a DOCX Blob from a validated curriculum and its resolved content items.
 *
 * @param {Object} curriculum - Parsed/fallback curriculum { title, learnerProfile, sections, ... }
 * @param {Array}  resolvedSections - Sections with `resolvedItems` array (each item has `.content`)
 * @returns {Promise<Blob>}
 */
export async function generateDocx(curriculum, resolvedSections) {
  const today = new Date().toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const children = []

  // ── Cover page ──────────────────────────────────────────────────────────────

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Government of Alberta', size: 20, color: '0081A2' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 1440, after: 200 }
    })
  )

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Alberta AI Academy', size: 28, bold: true, color: '004a8f' })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 720 }
    })
  )

  children.push(
    new Paragraph({
      children: [new TextRun({ text: curriculum.title, size: 40, bold: true, color: '333333' })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  )

  if (curriculum.learnerProfile) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: curriculum.learnerProfile,
            size: 24,
            italics: true,
            color: '666666'
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    )
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Generated: ${today}`, size: 20, color: '888888' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    })
  )

  // Page break after cover
  children.push(new Paragraph({ children: [new PageBreak()] }))

  // ── Sections ────────────────────────────────────────────────────────────────

  // Use resolvedSections when available (normal path); fall back to raw sections (fallback path)
  const sectionsToRender = resolvedSections.length > 0 ? resolvedSections : curriculum.sections

  for (const section of sectionsToRender) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.title, bold: true })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 120 }
      })
    )

    if (section.rationale) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: section.rationale, italics: true, color: '555555' })
          ],
          spacing: { after: 240 }
        })
      )
    }

    // Fallback path: render transcript prose instead of item list
    if (section._fallbackTranscript) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Note: A fully structured curriculum could not be generated automatically. The following is a summary of your AI assistant recommendations — use them as a guide to explore the Academy.',
              color: '666666',
              italics: true
            })
          ],
          spacing: { after: 240 }
        })
      )
      for (const line of section._fallbackTranscript.split('\n\n')) {
        if (line.trim()) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: line.trim() })],
              spacing: { after: 120 }
            })
          )
        }
      }
      continue
    }

    // Normal path: render resolved content items
    const items = section.resolvedItems ?? section.items ?? []

    for (const item of items) {
      const content = item.content ?? null
      const url = content ? getItemUrl(content) : null

      if (content) {
        // Item title — hyperlinked when a URL is available
        if (url) {
          children.push(
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  link: url,
                  children: [
                    new TextRun({
                      text: content.title,
                      bold: true,
                      color: '0070c0',
                      underline: { type: UnderlineType.SINGLE }
                    })
                  ]
                })
              ],
              spacing: { before: 200, after: 60 }
            })
          )
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: content.title, bold: true })],
              spacing: { before: 200, after: 60 }
            })
          )
        }

        // Meta line: type · source · duration
        const metaParts = [
          TYPE_LABELS[content.type] ?? content.type,
          content.source,
          content.duration
        ].filter(Boolean)

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: metaParts.join('  ·  '), size: 18, color: '888888' })
            ],
            spacing: { after: 60 }
          })
        )

        // Short description
        if (content.description) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: content.description, size: 20, color: '444444' })
              ],
              spacing: { after: 80 }
            })
          )
        }
      } else {
        // Unresolved ID — log already warned, show placeholder in doc
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[Content item not found: ${item.id}]`,
                bold: true,
                color: 'CC0000'
              })
            ],
            spacing: { before: 200, after: 60 }
          })
        )
      }

      // Personalised note (shown for all items, resolved or not)
      if (item.note) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '💡  ', size: 18 }),
              new TextRun({ text: item.note, size: 18, italics: true, color: '1a6631' })
            ],
            spacing: { after: 160 }
          })
        )
      }
    }
  }

  // ── Document assembly ───────────────────────────────────────────────────────

  const doc = new Document({
    creator: 'Alberta AI Academy',
    title: curriculum.title,
    description: 'Personalised AI learning curriculum — Alberta AI Academy',
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Alberta AI Academy  ·  Government of Alberta  ·  ${today}`,
                    size: 16,
                    color: '888888'
                  })
                ],
                alignment: AlignmentType.CENTER,
                border: {
                  top: {
                    style: BorderStyle.SINGLE,
                    size: 6,
                    color: 'CCCCCC',
                    space: 4
                  }
                }
              })
            ]
          })
        },
        children
      }
    ]
  })

  return Packer.toBlob(doc)
}
