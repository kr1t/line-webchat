import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "วิธีใช้ tickget · น้องติ๊ก" },
  description: "แจ้งปัญหาและติดตามงานผ่าน LINE กับน้องติ๊ก",
  robots: { index: false, follow: false },
};

const OA_URL = process.env.NEXT_PUBLIC_LINE_OA_URL || "https://line.me/R/ti/p/@609bjmyl";

const LEVELS = [
  { mood: "p1", code: "P1", name: "วิกฤต", when: "ใช้งานไม่ได้เลย และกระทบเงินหรือข้อมูล", eg: "เว็บล่ม · จ่ายเงินไม่ได้ · ข้อมูลหาย", reply: "15 นาที", color: "#E5352B", bg: "#FDD5D0" },
  { mood: "p2", code: "P2", name: "สูง", when: "ฟีเจอร์หลักใช้ไม่ได้ และไม่มีวิธีอื่น", eg: "login ไม่ได้ · สั่งซื้อไม่ได้", reply: "1 ชม.", color: "#EA7A1A", bg: "#FDE2C6" },
  { mood: "p3", code: "P3", name: "ปานกลาง", when: "ผิดปกติ แต่ยังใช้วิธีอื่นแทนได้", eg: "ค้นหาไม่เจอบางคำ · ตัวเลขผิด", reply: "4 ชม.", color: "#C99A00", bg: "#FBEFB7" },
  { mood: "p4", code: "P4", name: "ต่ำ", when: "ไม่กระทบการใช้งาน แค่ดูไม่ถูก", eg: "สะกดผิด · หน้าตาเพี้ยน", reply: "1 วัน", color: "#2E9E4F", bg: "#D3EFDC" },
  { mood: "p5", code: "P5", name: "คำถาม / ขอฟีเจอร์", when: "อยากถาม หรืออยากได้อะไรเพิ่ม", eg: "ถามวิธีใช้ · ขอฟีเจอร์ใหม่", reply: "2 วัน", color: "#3B7BE0", bg: "#D3E3FB" },
];

const STATUSES = [
  ["รอทีมรับเรื่อง", "ส่งเรื่องถึงทีมแล้ว รอคนรับ"],
  ["ทีมรับเรื่องแล้ว", "มีคนดูแลเรื่องของคุณแล้ว"],
  ["กำลังแก้ไข", "ทีมกำลังแก้ไขอยู่"],
  ["รอข้อมูลเพิ่มจากคุณ", "ทีมต้องการข้อมูลเพิ่ม ตอบในแชทหรือกด \"เพิ่มข้อมูล\""],
  ["แก้แล้ว รอยืนยัน", "ลองใช้ดู แล้วกด \"หายแล้ว\" หรือ \"ยังไม่หาย\""],
  ["ปิดแล้ว", "เรื่องนี้เสร็จแล้ว ฝากให้คะแนนด้วยนะครับ"],
];

function Mascot({ mood, size = 64 }: { mood: string; size?: number }) {
  return (
    <Image src={`/brand/mascot/${mood}.png`} alt="น้องติ๊ก" width={size} height={size} className="shrink-0 rounded-2xl border-2 border-[#1A1A1A]" />
  );
}

function Step({ n, title, children, mood }: { n: number; title: string; children: React.ReactNode; mood?: string }) {
  return (
    <li className="flex gap-3 rounded-3xl border-2 border-[#1A1A1A] bg-white p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F2483A] text-sm font-extrabold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        <div className="mt-1 text-sm text-zinc-600">{children}</div>
      </div>
      {mood && <Mascot mood={mood} size={52} />}
    </li>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="mb-3 text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

/** Customer guide, opened from the rich menu (no sign-in needed). */
export default function HelpPage() {
  return (
    <div className="min-h-dvh bg-[#FBF8F1] text-[#1A1A1A]">
      <main className="mx-auto w-full max-w-md space-y-8 px-4 pb-16 pt-6">
        <header className="flex items-center gap-4">
          <Mascot mood="greet" size={88} />
          <div>
            <p className="text-2xl font-extrabold tracking-tight">
              t<span className="text-[#F2483A]">i</span>ckget
            </p>
            <h1 className="text-lg font-bold">สวัสดีครับ น้องติ๊กเองครับ</h1>
            <p className="text-sm text-zinc-600">แจ้งปัญหาและติดตามงานได้ในแชท LINE นี้เลย</p>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm font-semibold">
          {[
            ["#report", "แจ้งปัญหา"],
            ["#levels", "ระดับปัญหา"],
            ["#follow", "ติดตามสถานะ"],
            ["#done", "ตอนแก้เสร็จ"],
            ["#faq", "คำถามที่พบบ่อย"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border-2 border-[#1A1A1A] bg-white px-3 py-1">
              {label}
            </a>
          ))}
        </nav>

        <Section id="menu" title="เมนูด้านล่างแชท">
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["🙋 น้องติ๊ก", "เปิดคู่มือนี้"],
              ["❗ แจ้งปัญหา", "เริ่มแจ้งเรื่องใหม่"],
              ["🔍 ติดตามสถานะ", "ดูเรื่องที่ยังไม่ปิด"],
              ["💬 คุยกับทีม", "พิมพ์คุยกับทีมได้เลย"],
            ].map(([title, body]) => (
              <li key={title} className="rounded-2xl border-2 border-[#1A1A1A] bg-white p-3">
                <p className="font-bold">{title}</p>
                <p className="text-zinc-600">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">ถ้ายังไม่เห็นเมนู แปลว่ายังไม่ได้รับสิทธิ์ ขอลิงก์เชิญจากทีมงานได้ครับ</p>
        </Section>

        <Section id="report" title="แจ้งปัญหาใน 4 ขั้น">
          <ol className="space-y-2">
            <Step n={1} title="กด &quot;แจ้งปัญหา&quot;">ที่เมนูด้านล่างแชท</Step>
            <Step n={2} title="เลือกระดับความรุนแรง" mood="p3">
              เลื่อนการ์ดซ้าย–ขวา แล้วกด &quot;เลือก&quot; ถ้าเลือก P1 น้องติ๊กจะถามยืนยันอีกครั้ง
            </Step>
            <Step n={3} title="พิมพ์อธิบายปัญหา">
              บอกว่าเกิดที่หน้าไหน ทำอะไรแล้วเป็นอะไร ส่งรูปหน้าจอก่อนหรือหลังพิมพ์ก็ได้ (สูงสุด 10 รูป รูปละไม่เกิน 5 MB)
            </Step>
            <Step n={4} title="ได้เลขเรื่อง เช่น TK-000123" mood="greet">
              ส่งรูปหรือข้อมูลเพิ่มต่อได้เลย ครบแล้วกด &quot;เสร็จแล้ว&quot;
            </Step>
          </ol>
        </Section>

        <Section id="levels" title="เลือกระดับยังไงดี">
          <ul className="space-y-2">
            {LEVELS.map((l) => (
              <li key={l.code} className="flex items-center gap-3 rounded-3xl border-2 border-[#1A1A1A] p-3" style={{ background: l.bg }}>
                <Mascot mood={l.mood} size={56} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-extrabold">
                    <span style={{ color: l.color }}>{l.code}</span> {l.name}
                  </p>
                  <p>{l.when}</p>
                  <p className="text-xs text-zinc-600">{l.eg}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-bold">ตอบใน {l.reply}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">ทีมอาจปรับระดับให้เหมาะกับปัญหาจริง เพื่อให้เรื่องที่ร้ายแรงที่สุดได้รับการดูแลก่อน</p>
        </Section>

        <Section id="follow" title="ติดตามสถานะ">
          <p className="mb-3 text-sm text-zinc-600">
            กด &quot;ติดตามสถานะ&quot; หรือพิมพ์เลขเรื่อง เช่น <b>TK-000123</b> ในแชท น้องติ๊กจะส่งการ์ดสถานะให้ ทีมตอบอะไรมาจะเด้งในแชทนี้เลย
          </p>
          <ul className="space-y-1.5 text-sm">
            {STATUSES.map(([label, body]) => (
              <li key={label} className="flex gap-2 rounded-2xl bg-white px-3 py-2">
                <span className="shrink-0 font-bold">{label}</span>
                <span className="text-zinc-600">{body}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-zinc-600">อยากเพิ่มข้อมูลหรือรูป กด &quot;เพิ่มข้อมูล&quot; บนการ์ดของเรื่องนั้น</p>
        </Section>

        <Section id="done" title="ตอนทีมแก้เสร็จ">
          <div className="space-y-2 rounded-3xl border-2 border-[#1A1A1A] bg-white p-4 text-sm">
            <div className="flex items-center gap-3">
              <Mascot mood="p4" size={52} />
              <p>
                กด <b>&quot;หายแล้ว ปิดได้เลย&quot;</b> ถ้าปัญหาหายแล้ว แล้วให้คะแนน 1–5 ช่วยให้ทีมปรับปรุงได้
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Mascot mood="p2" size={52} />
              <p>
                กด <b>&quot;ยังไม่หาย&quot;</b> ถ้ายังเจออยู่ เรื่องจะกลับไปที่ทีม และน้องติ๊กจะถามว่ายังเจออะไร
              </p>
            </div>
          </div>
        </Section>

        <Section id="faq" title="คำถามที่พบบ่อย">
          <dl className="space-y-2 text-sm">
            {[
              ["ส่งนอกเวลาทำการได้ไหม", "ได้ครับ น้องติ๊กรับเรื่องตลอด และจะบอกว่าทีมจะเริ่มดูเมื่อไหร่"],
              ["อยากคุยกับคนจริง", "กด \"คุยกับทีม\" แล้วพิมพ์ได้เลย ทีมงานตอบในแชทนี้"],
              ["กดปุ่มแล้วบอกว่าใช้ไม่ได้แล้ว", "ปุ่มบนการ์ดเก่าอาจหมดอายุ กด \"ติดตามสถานะ\" เพื่อดูการ์ดล่าสุด"],
              ["ไม่เห็นเมนูด้านล่าง", "ปิดห้องแชทแล้วเปิดใหม่ ถ้ายังไม่เห็น ขอลิงก์เชิญจากทีมงาน"],
            ].map(([q, a]) => (
              <div key={q} className="rounded-2xl bg-white px-4 py-3">
                <dt className="font-bold">{q}</dt>
                <dd className="text-zinc-600">{a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Link href={OA_URL} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] px-4 py-3 font-bold text-white">
          กลับไปคุยกับน้องติ๊กใน LINE
        </Link>
      </main>
    </div>
  );
}
