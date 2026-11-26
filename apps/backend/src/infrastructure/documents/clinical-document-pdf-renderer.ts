import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFPage, rgb } from 'pdf-lib'
import { ApplicationError } from '../../application/errors/application-error'
import type {
  ClinicalDocument,
  DocumentEncounter,
} from '../../application/ports/clinical-documents'
import type { DocumentSigner } from '../../application/ports/signature-provider'
import { parseExamOrder } from '../../application/validation/exam-order'
import { parsePrescription } from '../../application/validation/prescription'
import {
  parseTextDocument,
  textDocumentCodes,
} from '../../application/validation/text-document'

export class ClinicalDocumentPdfRenderer {
  private fontBytes: Promise<Buffer> | undefined
  constructor(private readonly frontendOrigin: string) {}
  async render(
    document: ClinicalDocument,
    patient: { name: string; birthDate: string },
    recordNumber: string,
    input: {
      signer: DocumentSigner
      issuedAt: Date
      verificationCode: string
      developmentOnly: boolean
      encounter?: DocumentEncounter
    },
  ) {
    if (!input.developmentOnly)
      throw new ApplicationError('SERVICE_UNAVAILABLE')
    const prescription =
      document.type.code === 'prescription'
        ? parsePrescription(document.payload)
        : null
    const examOrder =
      document.type.code === 'exam_order'
        ? parseExamOrder(document.payload)
        : null
    const textDocument = textDocumentCodes.some((c) => c === document.type.code)
      ? parseTextDocument(document.payload)
      : null
    if (!prescription && !examOrder && !textDocument)
      throw new ApplicationError('SERVICE_UNAVAILABLE')
    const title = prescription
      ? 'Prescrição demonstrativa'
      : examOrder
        ? 'Pedido de exames demonstrativo'
        : `${document.type.label} demonstrativo`
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    this.fontBytes ??= readFile(
      resolve(__dirname, 'assets/NotoSans-Regular.ttf'),
    )
    const font = await pdf.embedFont(await this.fontBytes, { subset: true }),
      characters = new Set(font.getCharacterSet())
    const text = [
      patient.name,
      recordNumber,
      input.signer.name,
      input.signer.council.type,
      input.signer.council.region,
      input.signer.council.number,
      document.type.label,
      textDocument?.body ?? '',
      ...(prescription?.items ?? []).flatMap((i) => [
        i.name ?? '',
        i.activeSubstance ?? '',
        i.dose,
        i.route,
        i.frequency,
        i.quantity,
        i.instructions,
      ]),
      ...(examOrder?.exams ?? []).flatMap((e) => [
        e.description ?? '',
        e.indication,
        e.tussCode ?? '',
        e.procedureSnapshot?.version ?? '',
      ]),
    ]
    if (
      text.some((value) =>
        [...value].some(
          (c) =>
            !['\n', '\r', '\t'].includes(c) &&
            !characters.has(c.codePointAt(0) as number),
        ),
      )
    )
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: prescription ? 'items' : examOrder ? 'exams' : 'body',
          reason:
            'Há caracteres sem suporte no PDF. Revise o texto; o rascunho permanece preservado.',
        },
      ])
    pdf.setTitle(`${title} — sem validade jurídica`)
    pdf.setCreator('VidaPlena')
    pdf.setCreationDate(input.issuedAt)
    pdf.setModificationDate(input.issuedAt)
    const width = 595.28,
      height = 841.89,
      margin = 44,
      lineHeight = 16,
      contentWidth = width - margin * 2,
      cache = new Map<string, number>()
    let page: PDFPage,
      y = 0
    const measure = (text: string, size: number) => {
      const key = `${size}:${text}`
      let measured = cache.get(key)
      if (measured === undefined) {
        measured = font.widthOfTextAtSize(text, size)
        cache.set(key, measured)
      }
      return measured
    }
    const wrap = (value: string, size: number) => {
      const lines: string[] = []
      for (const paragraph of value
        .replace(/\r\n?/g, '\n')
        .replace(/\t/g, '    ')
        .split('\n')) {
        let line = ''
        for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
          if (measure(line + token, size) <= contentWidth) {
            line += token
            continue
          }
          if (line) {
            lines.push(line)
            line = ''
          }
          if (measure(token, size) <= contentWidth) {
            line = token
            continue
          }
          const segmenter = new Intl.Segmenter('pt-BR', {
            granularity: 'grapheme',
          })
          for (const { segment } of segmenter.segment(token)) {
            if (line && measure(line + segment, size) > contentWidth) {
              lines.push(line)
              line = ''
            }
            line += segment
          }
        }
        lines.push(line)
      }
      return lines
    }
    const draw = (value: string, size = 11, color = rgb(0.12, 0.16, 0.22)) => {
      page.drawText(value, { x: margin, y, font, size, color })
      y -= lineHeight
    }
    const newPage = () => {
      page = pdf.addPage([width, height])
      y = height - margin
      draw(`VidaPlena | ${title}`, 14)
      draw('sem validade jurídica', 11, rgb(0.65, 0.12, 0.12))
      y -= 6
      for (const line of wrap(`Paciente: ${patient.name}`, 11)) draw(line)
      draw(`Nascimento: ${patient.birthDate} | Prontuário: ${recordNumber}`, 9)
      draw(`Emissão: ${input.issuedAt.toISOString()}`, 9)
      if (textDocument && input.encounter) {
        draw(`Atendimento: ${input.encounter.id}`, 9)
        draw(`Início: ${input.encounter.startedAt.toISOString()}`, 9)
        draw(
          input.encounter.endedAt
            ? `Conclusão: ${input.encounter.endedAt.toISOString()}`
            : 'Atendimento em andamento',
          9,
        )
        draw(
          `Modelo: ${document.type.code} v${document.type.templateVersion}`,
          9,
        )
      }
      draw(`Verificação: ${input.verificationCode}`, 9)
      y -= 12
      page.drawText('sem validade jurídica — documento demonstrativo', {
        x: margin,
        y: 43,
        font,
        size: 10,
        color: rgb(0.65, 0.12, 0.12),
      })
    }
    const paragraph = (value: string, size = 11) => {
      for (const line of wrap(value, size)) {
        if (y < 88) newPage()
        draw(line, size)
      }
    }
    newPage()
    if (textDocument) {
      if (textDocument.period)
        paragraph(
          `Período informado (UTC): ${textDocument.period.startsAt} a ${textDocument.period.endsAt}`,
          10,
        )
      paragraph(textDocument.body)
      y -= 12
    }
    for (const [index, item] of (prescription?.items ?? []).entries()) {
      paragraph(`${index + 1}. ${item.name ?? 'Medicamento manual'}`)
      if (item.activeSubstance)
        paragraph(`Princípio ativo: ${item.activeSubstance}`, 10)
      if (!item.medicationSnapshot)
        paragraph('Classificação e mapeamento não verificados (simulação).', 10)
      paragraph(`Dose: ${item.dose}`)
      paragraph(`Via: ${item.route}`)
      paragraph(`Frequência: ${item.frequency}`)
      paragraph(`Quantidade: ${item.quantity}`)
      if (item.instructions) paragraph(`Orientações: ${item.instructions}`)
      y -= 12
    }
    if (examOrder) {
      paragraph(
        examOrder.privateVisit
          ? 'Pedido particular'
          : 'Pedido com classificação não particular',
        10,
      )
      for (let index = 0; index < examOrder.exams.length; index++) {
        const exam = examOrder.exams[index]
        paragraph(`${index + 1}. ${exam.description ?? 'Exame solicitado'}`)
        if (exam.procedureSnapshot)
          paragraph(
            `TUSS: ${exam.procedureSnapshot.code} | Versão: ${exam.procedureSnapshot.version}`,
            10,
          )
        paragraph(`Indicação clínica: ${exam.indication}`)
        y -= 12
      }
    }
    const council = input.signer.council
    paragraph(`Profissional: ${input.signer.name}`)
    paragraph(
      `Registro: ${council.type} ${council.region} ${council.number}`,
      10,
    )
    paragraph('Conferência demonstrativa; não substitui avaliação clínica.', 10)
    paragraph(
      `Verifique: ${this.frontendOrigin}/v1/documents/verify/${input.verificationCode}`,
      9,
    )
    const pages = pdf.getPages()
    pages.forEach((p, index) => {
      p.drawText(`Página ${index + 1}/${pages.length}`, {
        x: width - margin - 70,
        y: 25,
        font,
        size: 9,
        color: rgb(0.3, 0.3, 0.3),
      })
    })
    return pdf.save()
  }
}
