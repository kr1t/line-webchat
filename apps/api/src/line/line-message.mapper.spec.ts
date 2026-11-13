import type { webhook } from '@line/bot-sdk';
import { toStoredContent } from './line-message.mapper.js';

const msg = (m: Record<string, unknown>) => m as unknown as webhook.MessageContent;

describe('toStoredContent', () => {
  it('keeps text and drops LINE tokens', () => {
    const result = toStoredContent(msg({ type: 'text', id: '1', text: 'สวัสดี', quoteToken: 'q' }));
    expect(result).toEqual({ type: 'text', text: 'สวัสดี', payload: null });
  });

  it('stores sticker ids in payload', () => {
    const result = toStoredContent(
      msg({ type: 'sticker', id: '1', packageId: '446', stickerId: '1988', stickerResourceType: 'STATIC', quoteToken: 'q' }),
    );
    expect(result).toEqual({
      type: 'sticker',
      text: null,
      payload: { packageId: '446', stickerId: '1988', stickerResourceType: 'STATIC' },
    });
  });

  it('uses file name as text for files', () => {
    const result = toStoredContent(msg({ type: 'file', id: '1', fileName: 'a.pdf', fileSize: 10 }));
    expect(result.text).toBe('a.pdf');
  });

  it('handles unknown types without throwing', () => {
    expect(toStoredContent(msg({ type: 'something-new', id: '1' })).type).toBe('something-new');
  });
});
