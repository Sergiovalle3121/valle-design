import { NoopCadEventPublisher } from './noop-event-publisher.adapter';
import type { CadEventPublisher } from './ports/cad-event-publisher.port';

describe('NoopCadEventPublisher (puerto CadEventPublisher, WP2c)', () => {
  it('publica sin efectos y sin tronar (Fase 2 lo sustituye por el bus real)', () => {
    const publisher: CadEventPublisher = new NoopCadEventPublisher();
    expect(() =>
      publisher.publish({
        type: 'design.document.published',
        payload: { documentId: 'doc-1' },
      }),
    ).not.toThrow();
  });
});
