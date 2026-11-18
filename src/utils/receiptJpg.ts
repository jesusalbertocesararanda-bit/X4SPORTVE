import type { BrandIdentityConfig, SaleRecord } from '../types/erp';
import { DEFAULT_GENERAL_CONFIG, formatUSD, formatVES, round2 } from './finance';
import { convertGoogleDriveUrlToDirect } from './publicCatalog';

export const X4SPORT_LOGO_SRC = '/assets/aistudio/image_992adf2a.jpg';

function loadLogoImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => {
      resolve(null);
    }, 2500);

    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export async function renderSaleReceiptJpgDataUrl(
  sale: SaleRecord,
  bcvRate: number,
  brandConfig?: BrandIdentityConfig,
): Promise<string> {
  const brand = brandConfig ?? DEFAULT_GENERAL_CONFIG.brandIdentity;
  const resolvedLogoSrc = brand.logoUrl?.trim()
    ? convertGoogleDriveUrlToDirect(brand.logoUrl.trim())
    : X4SPORT_LOGO_SRC;
  const storeName = brand.storeName?.trim() || 'X4SPORT';
  const storeSubtitle = brand.storeSubtitle?.trim() || 'INDUMENTARIA DEPORTIVA';
  const storeLocation =
    brand.storeLocation?.trim() || 'Guacara, Edo. Carabobo · Venezuela';
  const footerMessage =
    brand.invoiceFooterMessage?.trim() || 'Gracias por comprar en X4SPORT';

  const lineItems =
    sale.items && sale.items.length > 0
      ? sale.items
      : [
          {
            skuId: sale.skuId,
            modelLabel: sale.modelLabel,
            team: sale.team,
            version: sale.version,
            size: sale.size,
            quantity: sale.quantity,
            unitCogs: sale.unitCogs,
            totalLineCogs: round2(sale.unitCogs * sale.quantity),
            unitPrice: round2(sale.finalPrice / Math.max(1, sale.quantity)),
            subtotal: sale.finalPrice,
          },
        ];

  const width = 920;
  const rowHeight = 76;
  const rowsHeight = lineItems.length * rowHeight;
  const splitExtraHeight =
    sale.paymentMethod === 'Pago Mixto' && sale.paymentSplits
      ? sale.paymentSplits.length * 24 + 20
      : 0;
  const height = Math.max(1060, 740 + rowsHeight + splitExtraHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el lienzo para generar el comprobante JPG.');
  }

  // Background
  ctx.fillStyle = '#060B16';
  ctx.fillRect(0, 0, width, height);

  // Outer Receipt Card
  const pad = 36;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;
  drawRoundedRect(ctx, pad, pad, cardW, cardH, 24);
  ctx.fillStyle = '#0D1526';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1E293B';
  ctx.stroke();

  // Top Header Band
  const headerH = 190;
  drawRoundedRect(ctx, pad, pad, cardW, headerH, 24);
  ctx.fillStyle = '#080F1E';
  ctx.fill();

  // Accent Line under Header
  ctx.fillStyle = '#2563EB';
  ctx.fillRect(pad, pad + headerH - 4, cardW, 4);

  // Logo Image / Fallback Emblem
  const logoImg = await loadLogoImage(resolvedLogoSrc);
  const logoSize = 112;
  const logoX = pad + 32;
  const logoY = pad + 36;

  ctx.save();
  drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 18);
  ctx.clip();
  if (logoImg) {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
  } else {
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      storeName.slice(0, 2).toUpperCase() || 'X4',
      logoX + logoSize / 2,
      logoY + logoSize / 2,
    );
  }
  ctx.restore();

  drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 18);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#334155';
  ctx.stroke();

  // Brand Title & Location
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 34px system-ui, -apple-system, sans-serif';
  ctx.fillText(storeName, logoX + logoSize + 24, pad + 78);

  ctx.fillStyle = '#60A5FA';
  ctx.font = '600 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(storeSubtitle, logoX + logoSize + 24, pad + 108);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(storeLocation, logoX + logoSize + 24, pad + 136);

  // Invoice Number Badge on Right
  const invoiceCode = sale.invoiceNumber || 'FAC-0001';
  const badgeW = 240;
  const badgeH = 96;
  const badgeX = pad + cardW - badgeW - 32;
  const badgeY = pad + 44;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.fillStyle = '#0D182E';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#3B82F6';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#93C5FD';
  ctx.font = '700 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('COMPROBANTE DIGITAL', badgeX + badgeW / 2, badgeY + 26);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 28px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(invoiceCode, badgeX + badgeW / 2, badgeY + 60);

  const formattedDate = new Date(sale.createdAt).toLocaleString('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(formattedDate, badgeX + badgeW / 2, badgeY + 83);

  // Customer & Seller Grid
  let cursorY = pad + headerH + 30;
  const infoBoxH = 148;
  const innerPad = 32;
  const innerW = cardW - innerPad * 2;
  drawRoundedRect(ctx, pad + innerPad, cursorY, innerW, infoBoxH, 14);
  ctx.fillStyle = '#080E1C';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#1E293B';
  ctx.stroke();

  const colLeftX = pad + innerPad + 22;
  const colRightX = pad + innerPad + innerW / 2 + 12;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('DATOS DEL CLIENTE', colLeftX, cursorY + 28);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 21px system-ui, -apple-system, sans-serif';
  ctx.fillText(sale.customerName || 'Cliente Mostrador', colLeftX, cursorY + 58);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 15px system-ui, -apple-system, sans-serif';
  const cityLabel = sale.customerCity ? `Ciudad: ${sale.customerCity}` : 'Ciudad: No especificada';
  const phoneLabel = sale.customerPhone ? `Teléfono: ${sale.customerPhone}` : 'Teléfono: No especificado';
  ctx.fillText(cityLabel, colLeftX, cursorY + 88);
  ctx.fillText(phoneLabel, colLeftX, cursorY + 114);

  // Right column: Seller + Payment Condition
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('DETALLE DE OPERACIÓN', colRightX, cursorY + 28);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 18px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Vendedor: ${sale.seller}`, colRightX, cursorY + 58);

  ctx.fillStyle = sale.paymentStatus === 'Cobrado' ? '#34D399' : '#FBBF24';
  ctx.font = '700 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    sale.paymentStatus === 'Cobrado'
      ? 'Condición: CONTADO (Cobrado)'
      : 'Condición: CRÉDITO (Pendiente)',
    colRightX,
    cursorY + 88,
  );

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Método: ${sale.paymentMethod ?? 'Efectivo ($)'}`, colRightX, cursorY + 114);

  // Table Header
  cursorY += infoBoxH + 28;
  drawRoundedRect(ctx, pad + innerPad, cursorY, innerW, 42, 10);
  ctx.fillStyle = '#0F1B33';
  ctx.fill();

  const colItemX = pad + innerPad + 16;
  const colQtyX = pad + innerPad + innerW * 0.6;
  const colUnitX = pad + innerPad + innerW * 0.78;
  const colSubX = pad + innerPad + innerW - 16;

  ctx.fillStyle = '#94A3B8';
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FRANELA / MODELO', colItemX, cursorY + 26);
  ctx.textAlign = 'right';
  ctx.fillText('CANT.', colQtyX, cursorY + 26);
  ctx.fillText('PRECIO / COSTO', colUnitX, cursorY + 26);
  ctx.fillText('SUBTOTAL', colSubX, cursorY + 26);

  cursorY += 50;

  // Item Rows
  lineItems.forEach((item, index) => {
    if (index > 0) {
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + innerPad, cursorY);
      ctx.lineTo(pad + innerPad + innerW, cursorY);
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 17px system-ui, -apple-system, sans-serif';
    const wrappedTitle = wrapLines(ctx, item.modelLabel, innerW * 0.5);
    ctx.fillText(wrappedTitle[0], colItemX, cursorY + 30);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 14px system-ui, -apple-system, sans-serif';
    const subMeta = `${item.version} · Talla ${item.size}${
      item.discountLabel ? ` · ${item.discountLabel}` : ''
    }`;
    ctx.fillText(subMeta, colItemX, cursorY + 54);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(String(item.quantity), colQtyX, cursorY + 38);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(formatUSD(item.unitPrice), colUnitX, cursorY + 38);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(formatUSD(item.subtotal), colSubX, cursorY + 38);

    cursorY += rowHeight;
  });

  // Payment Splits if Pago Mixto
  if (sale.paymentMethod === 'Pago Mixto' && sale.paymentSplits?.length) {
    cursorY += 10;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('DESGLOSE PAGO MIXTO:', colItemX, cursorY + 14);
    cursorY += 22;
    for (const sp of sale.paymentSplits) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(
        `• ${sp.method}: ${formatUSD(sp.amountUsd)}${
          sp.bcvEquivalent ? ` (${formatVES(sp.bcvEquivalent)})` : ''
        }`,
        colItemX,
        cursorY + 14,
      );
      cursorY += 22;
    }
  }

  // Totals Summary Box
  cursorY += 18;
  const totalBoxH = 114;
  drawRoundedRect(ctx, pad + innerPad, cursorY, innerW, totalBoxH, 16);
  ctx.fillStyle = '#0B1D3A';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#2563EB';
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#93C5FD';
  ctx.font = '700 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('TOTAL DE LA COMPRA', pad + innerPad + 24, cursorY + 38);

  const effectiveBcv = bcvRate > 0 ? bcvRate : 46.5;
  const bsTotal = round2(sale.finalPrice * effectiveBcv);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Referencia BCV (${effectiveBcv.toFixed(2)} Bs/$): ${formatVES(bsTotal)}`,
    pad + innerPad + 24,
    cursorY + 74,
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 36px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`${formatUSD(sale.finalPrice)} USDT`, pad + innerPad + innerW - 24, cursorY + 66);

  // Thank-You Footer
  const footerY = pad + cardH - 52;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(footerMessage, width / 2, footerY - 12);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Factura ${invoiceCode} · ${storeLocation} · Comprobante válido para cambios y devoluciones`,
    width / 2,
    footerY + 16,
  );

  return canvas.toDataURL('image/jpeg', 0.94);
}

export function downloadJpgDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.jpg') ? filename : `${filename}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
