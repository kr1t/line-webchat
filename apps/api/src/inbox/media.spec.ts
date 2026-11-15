import { safeFileName, servingType } from './media.service.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const html = Buffer.from('<html><script>alert(1)</script></html>');

describe('serving chat media', () => {
  it('shows only real images and known audio/video inline', () => {
    expect(servingType('image', 'image/jpeg', jpeg)).toEqual({ contentType: 'image/jpeg', inline: true });
    expect(servingType('video', 'video/mp4', jpeg)).toEqual({ contentType: 'video/mp4', inline: true });
    expect(servingType('audio', 'audio/x-m4a', jpeg)).toEqual({ contentType: 'audio/x-m4a', inline: true });
  });

  it('never serves customer files as something a browser would run', () => {
    expect(servingType('image', 'image/svg+xml', html)).toEqual({ contentType: 'application/octet-stream', inline: false });
    expect(servingType('file', 'text/html', html)).toEqual({ contentType: 'application/octet-stream', inline: false });
    expect(servingType('video', 'text/html', html)).toEqual({ contentType: 'application/octet-stream', inline: false });
  });

  it('cleans download names', () => {
    expect(safeFileName('ใบเสร็จ มีนา.pdf', 'x')).toBe('ใบเสร็จ มีนา.pdf');
    expect(safeFileName('../../etc/passwd"\r\n', 'x')).toBe('.._.._etc_passwd___');
    expect(safeFileName(undefined, 'file-1')).toBe('file-1');
  });
});
