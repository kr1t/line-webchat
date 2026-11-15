import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Info, Lightbulb, Pin, Search, Settings, Zap } from "lucide-react";

export const metadata: Metadata = { title: "คู่มือ" };

const SECTIONS = [
  ["start", "เริ่มต้น"],
  ["chat", "แชท"],
  ["customers", "สิทธิ์ลูกค้าและลิงก์เชิญ"],
  ["tickets", "Tickets"],
  ["sla", "ระดับและ SLA"],
  ["reopen", "ลูกค้าตีกลับ"],
  ["notify", "การแจ้งเตือน"],
  ["dashboard", "Dashboard และ CSV"],
  ["share", "แชร์ QR"],
  ["settings", "Settings"],
  ["faq", "คำถามที่พบบ่อย"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-b border-border pb-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-white">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
      <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Small inline icon, the same set as the sidebar. */
const I = ({ icon: Icon }: { icon: typeof Bell }) => <Icon className="mx-0.5 inline size-3.5 -translate-y-px text-foreground" aria-hidden />;

const Dot = ({ color }: { color: string }) => <span className={`mr-1 inline-block size-2 rounded-full align-middle ${color}`} aria-hidden />;

const Level = ({ code, color }: { code: string; color: string }) => (
  <span className={`mr-1.5 inline-block rounded px-1.5 text-xs font-semibold ring-1 ${color}`}>{code}</span>
);

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-border bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px]">{children}</kbd>
);

/** How to use the CMS, for the team. */
export default function GuidePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl gap-10 px-4 py-6 md:px-8 md:py-8">
      <nav className="sticky top-6 hidden h-fit w-48 shrink-0 lg:block">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">สารบัญ</p>
        <ul className="space-y-1 text-sm">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-lg px-2 py-1 text-muted hover:bg-zinc-100 hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/help" target="_blank" className="mt-4 block rounded-lg px-2 py-1 text-sm text-muted underline underline-offset-2">
          คู่มือฝั่งลูกค้า ↗
        </Link>
      </nav>

      <article className="min-w-0 flex-1 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold">คู่มือการใช้งาน tickget admin</h1>
          <p className="mt-1 text-sm text-muted">ตอบแชท LINE จัดการเรื่องที่ลูกค้าแจ้ง และดูภาพรวมของทีม ในที่เดียว</p>
        </header>

        <Section id="start" title="เริ่มต้น">
          <Steps
            items={[
              "เข้าครั้งแรกด้วยรหัสชั่วคราวที่ได้รับ ระบบจะให้ตั้งรหัสผ่านใหม่",
              "ตั้ง 2FA ด้วยแอป Authenticator และเก็บ recovery codes ไว้ให้ดี",
              "ครั้งต่อไป login ด้วยรหัสผ่าน + รหัส 6 หลักจากแอป",
            ]}
          />
          <p>
            เมนูด้านซ้าย: <I icon={Bell} /> แจ้งเตือน · <I icon={Search} /> ค้นหา (<Kbd>⌘K</Kbd>) · กล่องข้อความ · Tickets · Dashboard · แชร์ QR ·
            Settings · คู่มือ
          </p>
          <Tip>งานที่กระทบภายนอก เช่น ให้สิทธิ์ลูกค้า สร้างลิงก์เชิญ จัดการแอดมิน จะขอรหัส 2FA ซ้ำ (มีผล 5 นาที)</Tip>
        </Section>

        <Section id="chat" title="แชท">
          <p>
            แต่ละห้องมีสถานะ <Dot color="bg-sky-500" />
            <b>เปิด</b> (ยังไม่มีคนรับ) · <Dot color="bg-amber-500" />
            <b>กำลังตอบ</b> (มีชื่อคนรับ) · <Dot color="bg-zinc-400" />
            <b>ปิด</b> ลูกค้าทักมาใหม่ ห้องที่ปิดจะเปิดเอง
          </p>
          <Steps
            items={[
              <>กด <b>รับแชท</b> ที่หัวแชท (หรือแค่ตอบ ระบบรับให้อัตโนมัติ)</>,
              <><b>โอน</b> ให้เพื่อนในทีม หรือ <b>ปิดแชท</b> เมื่อคุยจบ</>,
              <>พิมพ์ <Kbd>/</Kbd> หรือกด <I icon={Zap} /> เพื่อใช้ข้อความสำเร็จรูป ใส่ {"{name}"} {"{agent}"} ได้</>,
              <>รูป วิดีโอ เสียง ไฟล์ และตำแหน่งที่ลูกค้าส่ง เปิดดูได้ในแชท</>,
            ]}
          />
          <p>
            <b>ปักหมุด</b> (<I icon={Pin} /> บนหัวแชท): <b>ของฉัน</b> เห็นคนเดียว · <b>ทั้งทีม</b> ทุกคนเห็น แชทที่ปักอยู่บนสุด และมีแท็บ
            &quot;ปักหมุด&quot;
          </p>
          <p>
            <b>ชื่อที่ทีมใช้ / remark</b> แก้ที่แผงขวา (<I icon={Info} />) ทั้งทีมเห็นเหมือนกัน ชื่อ LINE จริงยังแสดงกำกับเสมอ และค้นหาจากชื่อที่ตั้งได้
          </p>
          <Tip>ถ้ามีคนอื่นกำลังตอบแชทนั้นอยู่ จะมีแถบสีเหลืองเตือนก่อนตอบแทรก</Tip>
        </Section>

        <Section id="customers" title="สิทธิ์ลูกค้าและลิงก์เชิญ">
          <p>ลูกค้าที่มีสิทธิ์จะเห็นเมนูน้องติ๊กในแชท และแจ้งปัญหา / ติดตามสถานะ ได้ ให้สิทธิ์ได้ 2 ทาง</p>
          <Steps
            items={[
              <><b>คนที่ทักมาแล้ว:</b> แผงขวาของแชท → สิทธิ์ลูกค้า → <b>ให้สิทธิ์</b></>,
              <><b>ลิงก์เชิญ:</b> แผงขวา &quot;ส่งลิงก์เชิญ&quot; (ล็อกให้คนนั้น และส่งการ์ดเข้าแชทให้ได้) หรือ Settings → ลิงก์เชิญ (ใครเปิดก็ได้ แต่ต้องกดอนุมัติ)</>,
            ]}
          />
          <p>ลิงก์ใช้ได้ครั้งเดียว มีวันหมดอายุ ยกเลิกได้ และแสดงให้คัดลอกแค่ตอนสร้าง มีข้อความเชิญสำเร็จรูปให้คัดลอกไปส่งช่องทางอื่น</p>
        </Section>

        <Section id="tickets" title="Tickets">
          <p>
            หน้า Tickets เรียงตาม <b>เวลาที่ใกล้ครบกำหนดก่อน</b> ป้ายเวลาบอกว่าต้องตอบ/แก้ภายในเท่าไหร่ (สีแดง = เกินแล้ว) กรองได้ตามแท็บ ระดับ และค้นหาเลข TK
          </p>
          <Steps
            items={[
              <>เปิด ticket → <b>รับเอง</b> หรือเลือกผู้รับผิดชอบ</>,
              <>ตอบลูกค้า (ส่งเข้า LINE พร้อมเลข TK) หรือเขียน <b>โน้ตภายใน</b> (ลูกค้าไม่เห็น)</>,
              <>เปลี่ยนสถานะ → popup นับถอยหลัง 5 วินาที กด <b>เปลี่ยนเลย</b> หรือ <b>ยกเลิก</b></>,
              <>แก้เสร็จ ตั้งเป็น <b>แก้แล้ว รอยืนยัน</b> ลูกค้าจะได้การ์ดให้กด &quot;หายแล้ว&quot; / &quot;ยังไม่หาย&quot;</>,
            ]}
          />
          <p>
            สถานะที่ลูกค้าได้รับแจ้งทาง LINE: กำลังแก้ไข · รอข้อมูลจากลูกค้า (หยุดนับเวลา) · แก้แล้ว รอยืนยัน · ปิดแล้ว (ขอคะแนน) รูปที่ลูกค้าแนบอยู่ในส่วน
            &quot;รูปจากลูกค้า&quot;
          </p>
          <Tip>เปลี่ยนระดับต้องใส่เหตุผล และเวลาที่ต้องตอบ/แก้จะคำนวณใหม่นับจากตอนที่ลูกค้าแจ้ง</Tip>
        </Section>

        <Section id="sla" title="ระดับและ SLA">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5">ระดับ</th>
                  <th>ใช้เมื่อ</th>
                  <th>ตอบครั้งแรก</th>
                  <th>แก้เสร็จ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["P1", "วิกฤต", "bg-red-50 text-red-700 ring-red-200", "ใช้ไม่ได้ทั้งระบบ / กระทบเงินหรือข้อมูล", "15 นาที", "4 ชม."],
                  ["P2", "สูง", "bg-orange-50 text-orange-700 ring-orange-200", "ฟีเจอร์หลักใช้ไม่ได้ ไม่มีทางเลี่ยง", "1 ชม.", "8 ชม."],
                  ["P3", "ปานกลาง", "bg-yellow-50 text-yellow-800 ring-yellow-200", "ผิดปกติ แต่มีทางเลี่ยง", "4 ชม.", "3 วัน"],
                  ["P4", "ต่ำ", "bg-emerald-50 text-emerald-700 ring-emerald-200", "ไม่กระทบการใช้งาน", "1 วัน", "7 วัน"],
                  ["P5", "คำถาม", "bg-blue-50 text-blue-700 ring-blue-200", "ถาม / ขอฟีเจอร์", "2 วัน", "วางแผนให้"],
                ].map(([code, name, color, when, reply, fix]) => (
                  <tr key={code}>
                    <td className="py-2 pr-3">
                      <Level code={code} color={color} />
                      {name}
                    </td>
                    <td className="py-2 pr-3">{when}</td>
                    <td className="py-2 pr-3">{reply}</td>
                    <td className="py-2 pr-3">{fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>&quot;ตอบครั้งแรก&quot; นับเมื่อตอบลูกค้าหรือกดรับเรื่อง ช่วงรอข้อมูลจากลูกค้าไม่นับเวลา</p>
        </Section>

        <Section id="reopen" title="ลูกค้าตีกลับ (ยังไม่หาย)">
          <p>
            เมื่อลูกค้ากด &quot;ยังไม่หาย&quot; ticket กลับเป็น <b>กำลังแก้ไข</b> มีป้าย <b>ตีกลับ</b> และแถบแดงบนหน้า ticket น้องติ๊กจะถามลูกค้าว่ายังเจออะไร
            คำตอบจะเข้า ticket ทันที ดูรวมได้ที่แท็บ &quot;ตีกลับ&quot;
          </p>
        </Section>

        <Section id="notify" title="การแจ้งเตือน">
          <p>
            <I icon={Bell} /> ที่ sidebar มีตัวเลขเรื่องใหม่ ป๊อปอัปมุมขวาล่างพร้อมเสียง และเลขบน title แท็บ เปิด &quot;แจ้งเตือนของเครื่อง&quot; ได้ที่{" "}
            <I icon={Settings} /> ในกล่องแจ้งเตือน
            (เด้งตอนอยู่แท็บอื่น)
          </p>
          <p>แจ้งเรื่อง: ticket ใหม่ · ลูกค้าตีกลับ · ข้อความใหม่ในแชทที่ยังไม่มีคนรับ/ของฉัน · โอนแชทให้ · มอบหมาย ticket ให้ · ลูกค้าตอบ ticket ของฉัน</p>
          <Tip>ต้องเปิดหน้า CMS ทิ้งไว้ (แท็บไหนก็ได้) และคลิกในหน้าเว็บสักครั้งเพื่อให้เบราว์เซอร์ยอมเล่นเสียง</Tip>
        </Section>

        <Section id="dashboard" title="Dashboard และ CSV">
          <p>
            ดู ticket ใหม่ ค้างตามระดับ เกินกำหนด % ทัน SLA ความพอใจ โควตา push ของ LINE และกราฟรายวัน เลือกช่วง วันนี้ / 7 วัน / 30 วัน
          </p>
          <p>ดาวน์โหลด CSV ได้ที่ Dashboard และหน้า Tickets (ตามตัวกรอง) เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน ทุกการ export ถูกบันทึกไว้</p>
        </Section>

        <Section id="share" title="แชร์ QR">
          <p>รูปโปสเตอร์ QR แอดเพื่อน LINE OA พร้อมน้องติ๊ก กด &quot;ดาวน์โหลด PNG&quot; ไปโพสต์ แปะหน้าร้าน หรือส่งให้ลูกค้า</p>
        </Section>

        <Section id="settings" title="Settings">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>เวลาทำการ</b>: นอกเวลา น้องติ๊กตอบอัตโนมัติชั่วโมงละครั้งต่อคน
            </li>
            <li>
              <b>ลิงก์เชิญ</b>: สร้าง · ยกเลิก · อนุมัติ
            </li>
            <li>
              <b>Rich menu ลูกค้า</b>: ดูสถานะ และ &quot;สร้างใหม่และผูกให้ทุกคน&quot; หลังเปลี่ยนรูปเมนู
            </li>
            <li>
              <b>ข้อความสำเร็จรูป</b>: เพิ่ม แก้ ลบ ใช้ {"{name}"} {"{ticket}"} {"{agent}"}
            </li>
          </ul>
        </Section>

        <Section id="faq" title="คำถามที่พบบ่อย">
          <dl className="space-y-3">
            {[
              ["ส่งข้อความไม่ได้ ขึ้นว่าโควตาหมด", "แพ็ก LINE OA ส่ง push ได้จำกัดต่อเดือน การตอบภายในเวลาสั้นหลังลูกค้าทักยังส่งได้ (ใช้ reply) ดูโควตาที่ Dashboard"],
              ["ลูกค้าไม่เห็นเมนูแจ้งปัญหา", "เช็กว่าให้สิทธิ์แล้ว แล้วกด \"สร้างใหม่และผูกให้ทุกคน\" ใน Settings ให้ลูกค้าปิด-เปิดห้องแชทใหม่"],
              ["ลูกค้าบล็อก OA", "ส่งข้อความหาไม่ได้ จะมีป้าย \"บล็อกแล้ว\" ในแชทและหน้า ticket"],
              ["ลืม 2FA / ทำมือถือหาย", "ใช้ recovery code ที่เก็บไว้ หรือติดต่อผู้ดูแลระบบให้รีเซ็ต 2FA"],
            ].map(([q, a]) => (
              <div key={q}>
                <dt className="font-medium text-foreground">{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </article>
    </div>
  );
}
