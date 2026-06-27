import { VISION_SYSTEM_PROMPT, isDataImageUrl, buildVisionMessages } from './cad-vision-prompt';

describe('cad-vision-prompt (Fase 71)', () => {
  it('describes the expected JSON output', () => {
    expect(VISION_SYSTEM_PROMPT).toContain('walls');
    expect(VISION_SYSTEM_PROMPT).toContain('[0,1]');
  });

  it('accepts only inline data image URLs (anti-SSRF)', () => {
    expect(isDataImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')).toBe(true);
    expect(isDataImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD=')).toBe(true);
    // remote URLs and non-image data must be rejected
    expect(isDataImageUrl('https://internal.local/secret.png')).toBe(false);
    expect(isDataImageUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isDataImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isDataImageUrl('file:///etc/passwd')).toBe(false);
    expect(isDataImageUrl(123 as unknown)).toBe(false);
  });

  it('builds a multimodal message with system + image content', () => {
    const msgs = buildVisionMessages('data:image/png;base64,iVBORw0KGgo=');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    const user = msgs[1];
    expect(user.role).toBe('user');
    expect(Array.isArray(user.content)).toBe(true);
    const parts = user.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'text')).toBe(true);
    expect(parts.some((p) => p.type === 'image_url')).toBe(true);
  });
});
