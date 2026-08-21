import {
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { CfdiReceipt } from '../entities/cfdi-receipt.entity';
import {
  CFDI_PROVIDER,
  type CfdiProvider,
} from '../ports/cfdi-provider.port';
import {
  requireDecider,
  type AuthenticatedRequest,
} from './commercial-request-context';

/**
 * El rastro fiscal para el cliente: qué CFDI cubre cada cobro y sus archivos.
 *
 * Mismas reglas de acceso que las facturas del proveedor (owner/admin vía
 * requireDecider): los importes y folios fiscales son material de decisión,
 * no de todo el equipo. La descarga sirve el XML/PDF que custodia el PAC a
 * través del producto — el PAC exige autenticación de la cuenta emisora y
 * esa credencial jamás viaja al navegador.
 */
@Controller('v1/commercial')
export class CfdiController {
  constructor(
    @InjectRepository(CfdiReceipt)
    private readonly receipts: Repository<CfdiReceipt>,
    @Inject(CFDI_PROVIDER)
    private readonly cfdi: CfdiProvider,
  ) {}

  @Get('cfdi')
  async listReceipts(@Req() request: AuthenticatedRequest) {
    const { organizationId } = requireDecider(request);
    const items = await this.receipts.find({
      where: { organizationId, tenantId: organizationId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return {
      organizationId,
      issuance: this.cfdi.descriptor(),
      items: items.map(receiptView),
    };
  }

  @Get('cfdi/:receiptId/files/:format')
  async downloadFile(
    @Req() request: AuthenticatedRequest,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Param('format') format: string,
    @Res() response: Response,
  ) {
    const { organizationId } = requireDecider(request);
    if (format !== 'pdf' && format !== 'xml') {
      throw new NotFoundException({
        code: 'cfdi_format_unknown',
        message: 'Formato de comprobante desconocido: usa pdf o xml.',
      });
    }
    const receipt = await this.receipts.findOneBy({
      id: receiptId,
      organizationId,
      tenantId: organizationId,
    });
    if (!receipt) {
      throw new NotFoundException({
        code: 'cfdi_receipt_not_found',
        message: 'Ese comprobante no existe en esta organización.',
      });
    }
    if (receipt.status !== 'issued' || !receipt.providerRef) {
      throw new ConflictException({
        code: 'cfdi_files_unavailable',
        message:
          'Este comprobante aún no está timbrado: no hay archivos que descargar.',
      });
    }
    if (!this.cfdi.download) {
      throw new ConflictException({
        code: 'cfdi_files_unavailable',
        message:
          'El proveedor de CFDI configurado no ofrece descarga de archivos.',
      });
    }
    const file = await this.cfdi.download(receipt.providerRef, format);
    response
      .status(200)
      .setHeader('Content-Type', file.contentType)
      .setHeader(
        'Content-Disposition',
        `attachment; filename="cfdi-${receipt.uuid ?? receipt.id}.${format}"`,
      )
      .setHeader('Cache-Control', 'no-store')
      .send(Buffer.from(file.contentBase64, 'base64'));
  }
}

function receiptView(row: CfdiReceipt) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    kind: row.kind,
    status: row.status,
    uuid: row.uuid,
    amountCents: Number(row.amountCents),
    currency: row.currency,
    // Descargables sólo cuando está timbrado y el PAC custodia archivos.
    filesAvailable: row.status === 'issued' && row.providerRef !== null,
    detail: row.status === 'manual' || row.status === 'failed' ? row.detail : null,
    createdAt: row.createdAt,
  };
}
