import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('starts with a BOM, quotes when needed and neutralises formulas', () => {
    const csv = toCsv(['a', 'b'], [
      ['=HYPERLINK("x")', 'สวัสดี, ครับ'],
      ['-1+1', null],
      ['line\nbreak', 5],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")","สวัสดี, ครับ"`);
    expect(csv).toContain(`'-1+1,`);
    expect(csv).toContain('"line\nbreak",5');
  });
});
