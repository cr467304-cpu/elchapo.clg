import { jsPDF } from 'jspdf';
import type { Order } from '../types.ts';
import { buildExcelSpreadsheetXml, formatIDR } from './commerce.ts';

export function exportOrdersToPdf(orders: Order[], storeName = 'elchapo.clg'): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`${storeName} — Riwayat Transaksi`, 40, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 110);
  doc.text(
    `Dicetak pada ${new Date().toLocaleString('id-ID')} · Total ${orders.length} transaksi`,
    40,
    y
  );
  y += 22;

  doc.setDrawColor(220, 220, 226);
  doc.line(40, y, pageWidth - 40, y);
  y += 18;

  for (const order of orders) {
    if (y > 740) {
      doc.addPage();
      y = 48;
    }

    doc.setTextColor(17, 17, 19);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${order.orderNumber}  ·  ${order.orderStatus}`, 40, y);
    doc.text(formatIDR(order.totalAmount), pageWidth - 40, y, { align: 'right' });
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(82, 82, 91);
    doc.text(
      `Tanggal: ${new Date(order.createdAt).toLocaleString('id-ID')} | Penerima: ${order.recipientName} (${order.recipientPhone})`,
      40,
      y
    );
    y += 13;
    doc.text(
      `Pembayaran: ${order.paymentMethodName} (${order.paymentStatus}) | Kurir: ${order.shippingService}${order.trackingNumber ? ` · Resi ${order.trackingNumber}` : ''}`,
      40,
      y
    );
    y += 13;

    for (const item of order.items) {
      if (y > 760) {
        doc.addPage();
        y = 48;
      }
      doc.text(
        `  - ${item.productName} (${item.size}, ${item.color}) x${item.quantity} = ${formatIDR(item.lineTotal)}`,
        48,
        y
      );
      y += 12;
    }

    y += 8;
    doc.setDrawColor(238, 238, 240);
    doc.line(40, y, pageWidth - 40, y);
    y += 16;
  }

  doc.save(`${storeName.replace(/\W+/g, '_')}_transaksi_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportOrdersToExcel(orders: Order[], storeName = 'elchapo.clg'): void {
  const xml = buildExcelSpreadsheetXml(orders);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${storeName.replace(/\W+/g, '_')}_transaksi_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
