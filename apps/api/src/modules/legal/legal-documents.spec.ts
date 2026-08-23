import {
  LEGAL_DOCUMENTS,
  validateLegalDocumentsRegistry,
  type LegalDocumentVersion,
} from './legal-documents';

/**
 * El registro de versiones legales (`LEGAL_DOCUMENTS`) es código fuente, no
 * configuración de entorno: nadie lo puede dejar vacío con un `.env` a medio
 * llenar. El riesgo real es distinto — que alguien borre o deje a medias una
 * entrada al editar el archivo (un fix rápido que quita `version` para
 * "arreglar" un typo, por ejemplo) sin darse cuenta de que
 * `isKnownLegalVersion` empieza a rechazar TODAS las aceptaciones en
 * silencio. Este candado hace ese error imposible de fusionar.
 */
describe('registro de documentos legales', () => {
  it('el registro real del repo pasa sin problemas', () => {
    expect(validateLegalDocumentsRegistry(LEGAL_DOCUMENTS)).toEqual([]);
  });

  it('exige que "terms" exista y requiera aceptación explícita', () => {
    const withoutTerms: LegalDocumentVersion[] = LEGAL_DOCUMENTS.filter(
      (doc) => doc.documento !== 'terms',
    );
    const issues = validateLegalDocumentsRegistry(withoutTerms);
    expect(issues).toContain(
      'falta el documento "terms" (obligatorio y debe exigir aceptación)',
    );
  });

  it('exige que "privacy" exista', () => {
    const withoutPrivacy: LegalDocumentVersion[] = LEGAL_DOCUMENTS.filter(
      (doc) => doc.documento !== 'privacy',
    );
    const issues = validateLegalDocumentsRegistry(withoutPrivacy);
    expect(issues).toContain('falta el documento "privacy" (obligatorio)');
  });

  it('rechaza una versión en blanco: aceptar eso no acredita nada', () => {
    const blank: LegalDocumentVersion[] = LEGAL_DOCUMENTS.map((doc) =>
      doc.documento === 'terms' ? { ...doc, version: '  ' } : doc,
    );
    const issues = validateLegalDocumentsRegistry(blank);
    expect(
      issues.some(
        (issue) => issue.includes('terms') && issue.includes('versión'),
      ),
    ).toBe(true);
  });

  it('rechaza una fecha de publicación con formato inválido', () => {
    const badDate: LegalDocumentVersion[] = LEGAL_DOCUMENTS.map((doc) =>
      doc.documento === 'privacy'
        ? { ...doc, publicadoEn: '15 de agosto de 2026' }
        : doc,
    );
    const issues = validateLegalDocumentsRegistry(badDate);
    expect(
      issues.some(
        (issue) => issue.includes('privacy') && issue.includes('publicadoEn'),
      ),
    ).toBe(true);
  });

  it('rechaza "terms" marcado como NO exigible: los términos siempre se aceptan', () => {
    const notRequired: LegalDocumentVersion[] = LEGAL_DOCUMENTS.map((doc) =>
      doc.documento === 'terms' ? { ...doc, requiereAceptacion: false } : doc,
    );
    const issues = validateLegalDocumentsRegistry(notRequired);
    expect(
      issues.some(
        (issue) => issue.includes('terms') && issue.includes('aceptación'),
      ),
    ).toBe(true);
  });

  it('rechaza dos entradas duplicadas para el mismo documento', () => {
    const duplicated: LegalDocumentVersion[] = [
      ...LEGAL_DOCUMENTS,
      { ...LEGAL_DOCUMENTS[0] },
    ];
    const issues = validateLegalDocumentsRegistry(duplicated);
    expect(issues.some((issue) => issue.includes('duplicad'))).toBe(true);
  });
});
