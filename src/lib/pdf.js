// PDF generation from a DOM element using html2canvas + jsPDF.
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Render a DOM element to a single-page (or multi-page) PDF and trigger a save.
 * @param {HTMLElement} element
 * @param {string} filename
 */
export async function elementToPdf(element, filename = 'document.pdf') {
  if (!element) throw new Error('No element to render')
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#0A0F1E', useCORS: true })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = 0
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position -= pageHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }
  pdf.save(filename)
}

/** Return the PDF as a Blob (e.g. to upload to Storage). */
export async function elementToPdfBlob(element) {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#0A0F1E', useCORS: true })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const imgHeight = (canvas.height * pageWidth) / canvas.width
  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
  return pdf.output('blob')
}
