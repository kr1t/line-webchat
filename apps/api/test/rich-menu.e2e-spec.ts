import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Database } from '../src/db/database.module.js';
import type { Admin } from '../src/db/schema.js';
import { lineUsers } from '../src/db/schema.js';
import type * as Utils from './utils.js';

const SOMCHAI = 'U' + '9'.repeat(32);
const MANEE = 'U' + 'f'.repeat(32);
const AUTO_MENU = `richmenu-${'a'.repeat(32)}`;
const LIFF = '1234567890-guideTest';

// No CUSTOMER_RICH_MENU_ID here: the app must create the menu itself.
// Config is read when the app module loads, so the variable is removed before importing it.
describe('Customer rich menu without configuration (e2e)', () => {
  let utils: typeof Utils;
  let app: NestFastifyApplication;
  let db: Database;
  let line: Utils.LineClientMock;
  let boss: Admin;
  let saved: string | undefined;
  let savedLiff: string | undefined;

  const setRole = async (userId: string, role: 'CUSTOMER' | null) =>
    utils.authedInject(app, await utils.sessionCookie(app, boss, { stepUp: true }))({
      method: 'PUT',
      url: `/conversations/${userId}/role`,
      payload: { role },
    });

  beforeAll(async () => {
    saved = process.env.CUSTOMER_RICH_MENU_ID;
    // Empty (not deleted) so a value in a local .env file cannot fill it back in
    process.env.CUSTOMER_RICH_MENU_ID = '';
    savedLiff = process.env.LIFF_ID;
    process.env.LIFF_ID = LIFF;
    utils = await import('./utils.js');
    line = utils.createLineClientMock();
    ({ app, db } = await utils.createTestApp(line));
    ({ admin: boss } = await utils.createAdmin(db, { role: 'SUPER_ADMIN' }));
  });

  beforeEach(async () => {
    await utils.resetDatabase(db);
    vi.clearAllMocks();
    await db.insert(lineUsers).values([
      { userId: SOMCHAI, displayName: 'Somchai', role: 'CUSTOMER' },
      { userId: MANEE, displayName: 'Manee' },
    ]);
  });

  afterAll(async () => {
    await app.close();
    process.env.CUSTOMER_RICH_MENU_ID = saved;
    process.env.LIFF_ID = savedLiff;
  });

  it('creates the menu on first use, uploads the image, and links earlier customers too', async () => {
    const res = await setRole(MANEE, 'CUSTOMER');
    expect(res.json()).toEqual({ role: 'CUSTOMER', richMenu: 'linked' });

    expect(line.createRichMenu).toHaveBeenCalledTimes(1);
    expect(line.createRichMenu.mock.calls[0][0]).toMatchObject({ size: { width: 2500, height: 843 }, chatBarText: 'เมนู' });
    // น้องติ๊ก greets; the last button opens the guide inside LINE
    const areas = line.createRichMenu.mock.calls[0][0].areas;
    expect(areas.map((a: { action: { data?: string; uri?: string } }) => a.action.data ?? a.action.uri)).toEqual([
      'a=hello',
      'a=report',
      'a=status',
      'a=talk',
      `https://liff.line.me/${LIFF}/help`,
    ]);
    expect(line.setRichMenuImage).toHaveBeenCalledWith(AUTO_MENU, expect.any(Blob));
    expect(line.linkRichMenuIdToUsers).toHaveBeenCalledWith({ richMenuId: AUTO_MENU, userIds: expect.arrayContaining([SOMCHAI, MANEE]) });
    expect(line.linkRichMenuIdToUser).toHaveBeenCalledWith(MANEE, AUTO_MENU);

    const status = await utils.authedInject(app, await utils.sessionCookie(app, boss))({ method: 'GET', url: '/settings/rich-menu' });
    expect(status.json()).toEqual({ id: AUTO_MENU, source: 'auto' });
  });

  it('reuses the stored menu next time', async () => {
    await setRole(MANEE, 'CUSTOMER');
    line.createRichMenu.mockClear();
    await setRole(MANEE, null);
    await setRole(MANEE, 'CUSTOMER');
    expect(line.createRichMenu).not.toHaveBeenCalled();
  });

  it('makes a new menu when the stored one was deleted on LINE', async () => {
    await setRole(MANEE, 'CUSTOMER');
    const { HTTPFetchError } = await import('@line/bot-sdk');
    line.linkRichMenuIdToUser.mockRejectedValueOnce(
      new HTTPFetchError('gone', { status: 404, statusText: '', headers: new Headers(), body: '{}' }),
    );
    line.createRichMenu.mockClear();
    await setRole(MANEE, null);
    expect((await setRole(MANEE, 'CUSTOMER')).json()).toMatchObject({ richMenu: 'linked' });
    expect(line.createRichMenu).toHaveBeenCalledTimes(1);
  });

  it('lets a super admin rebuild the menu and move every customer to it', async () => {
    await setRole(MANEE, 'CUSTOMER');
    line.createRichMenu.mockResolvedValueOnce({ richMenuId: `richmenu-${'b'.repeat(32)}` });
    const res = await utils.authedInject(app, await utils.sessionCookie(app, boss, { stepUp: true }))({
      method: 'POST',
      url: '/settings/rich-menu/rebuild',
    });
    expect(res.json()).toEqual({ id: `richmenu-${'b'.repeat(32)}`, source: 'auto', linked: 2 });
    expect(line.deleteRichMenu).toHaveBeenCalledWith(AUTO_MENU);
  });
});
