import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const Icon = ({ children }) => <span className="icon" aria-hidden="true">{children}</span>;
const api = async (url, options) => {
  const r = await fetch(url, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "حدث خطأ");
  return data;
};

function App() {
  const [page, setPage] = useState("home");
  const [books, setBooks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [reader, setReader] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "أهلاً بك في مساعد مكتبة البيان. اسأل عن مسألة، وسأبحث في النصوص المفهرسة وأعرض لك مواضع الاستشهاد المتاحة." }
  ]);

  const refresh = async () => {
    try { const d = await api("/api/books"); setBooks(d.books || []); }
    catch { setBooks([]); }
  };
  useEffect(() => { refresh(); }, []);

  const runSearch = async (q = query) => {
    if (!q.trim()) return;
    setBusy(true);
    try { const d = await api(`/api/search?q=${encodeURIComponent(q)}&limit=30`); setResults(d.results || []); setPage("search"); }
    catch (e) { setNotice(e.message); }
    finally { setBusy(false); }
  };
  const openBook = async (book) => {
    try {
      const d = await api(`/api/books/${book.id}`);
      setSelected(d.book); setReader(d.passages || []); setPage("reader");
    } catch (e) { setNotice(e.message); }
  };
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); setNotice("تم نسخ النص"); }
    catch { setNotice("تعذر النسخ؛ حدّد النص وانسخه يدوياً"); }
    setTimeout(() => setNotice(""), 2400);
  };
  const uploadBook = async (e) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await api("/api/books", { method: "POST", body: form });
      setNotice("تمت إضافة الكتاب وفهرسته بنجاح");
      formElement.reset(); await refresh(); setPage("catalog");
    } catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  };
  const ask = async (e) => {
    e.preventDefault();
    const q = chatInput.trim(); if (!q) return;
    setMessages(m => [...m, { role: "user", text: q }]); setChatInput("");
    setBusy(true);
    try {
      const d = await api(`/api/search?q=${encodeURIComponent(q)}&limit=6`);
      const found = d.results || [];
      const answer = found.length
        ? `وجدت ${found.length} مواضع ذات صلة في المكتبة. هذه المقاطع تصلح نقطة بداية للمراجعة، وليست حكماً نهائياً على المسألة:\n\n` + found.slice(0,4).map((r,i) => `${i+1}) ${r.title} — ${r.author || "المؤلف غير مسجل"}، ${r.chapter || "بلا فصل"}${r.page_label ? "، صفحة " + r.page_label : ""}\n${r.excerpt || r.body.slice(0,260)}`).join("\n\n")
        : "لم أعثر على مقاطع مطابقة في الكتب المفهرسة حالياً. جرّب لفظاً آخر أو أضف كتباً إلى المكتبة.";
      setMessages(m => [...m, { role: "assistant", text: answer, sources: found.slice(0,4) }]);
    } catch (err) { setMessages(m => [...m, { role: "assistant", text: err.message }]); }
    finally { setBusy(false); }
  };

  const nav = [
    ["home","الرئيسية","⌂"],["catalog","فهرس الكتب","▤"],["search","البحث","⌕"],
    ["assistant","مساعد المكتبة","✧"],["add","إضافة كتاب","＋"]
  ];
  const totalPassages = books.reduce((n,b) => n + (b.passage_count || 0), 0);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">ب</div><div><strong>مكتبة البيان</strong><small>المعرفة بين يديك</small></div></div>
      <div className="side-label">القائمة الرئيسية</div>
      <nav>{nav.map(([id,label,ico]) => <button key={id} className={`nav-item ${page===id ? "active":""}`} onClick={()=>setPage(id)}><span>{ico}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="mcp-status"><span className="status-dot"></span><div><b>محرك المكتبة</b><small>الفهرسة المحلية جاهزة</small></div></div>
        <div className="sidebar-note">نسخة أولية قابلة للتطوير<br/>MCP · بحث نصي · قارئ كتب</div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="crumb">مكتبة البيان <span>/</span> {nav.find(n=>n[0]===page)?.[1] || "قارئ الكتاب"}</div>
        <div className="top-actions"><span className="date-chip">نسخة تجريبية</span><div className="avatar">م</div></div>
      </header>

      {page==="home" && <section className="content">
        <div className="hero">
          <div className="hero-copy"><div className="eyebrow">مكتبتك العلمية الخاصة</div><h1>اقرأ، ابحث،<br/><em>واكتشف المعرفة.</em></h1><p>اجمع كتبك في مكان واحد، وابحث في نصوصها، واستعن بمساعد ذكي يصل إلى مواضع النصوص.</p>
            <div className="hero-search"><Icon>⌕</Icon><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runSearch()} placeholder="ابحث عن كتاب أو مسألة أو عبارة..." /><button onClick={()=>runSearch()}>ابحث الآن</button></div>
            <div className="hero-links"><button onClick={()=>setPage("catalog")}>تصفح الفهرس <span>←</span></button><button onClick={()=>setPage("add")}>أضف كتاباً جديداً <span>＋</span></button></div>
          </div>
          <div className="hero-art"><div className="arch"></div><div className="book-stack"><div className="book b1"></div><div className="book b2"></div><div className="book b3"></div><div className="book b4"></div></div><div className="art-caption">خزانة علمية<br/><b>تتسع لكتبك</b></div></div>
        </div>
        <div className="stats">
          <div className="stat"><span>إجمالي الكتب</span><b>{books.length}</b><small>كتاب في المكتبة</small></div>
          <div className="stat"><span>المقاطع المفهرسة</span><b>{totalPassages}</b><small>مقطع قابل للبحث</small></div>
          <div className="stat"><span>أدوات البحث</span><b>03</b><small>بحث · استرجاع · MCP</small></div>
          <div className="stat stat-dark"><span>مساعد المكتبة</span><b>AI</b><small>جاهز للربط بنموذج ذكي</small></div>
        </div>
        <div className="section-head"><div><div className="eyebrow">ابدأ الاستكشاف</div><h2>مساحتك المعرفية</h2></div><button className="text-link" onClick={()=>setPage("catalog")}>عرض جميع الكتب ←</button></div>
        <div className="quick-grid">
          <button className="quick-card" onClick={()=>setPage("catalog")}><span className="quick-icon">▤</span><b>فهرس الكتب</b><small>تصفح مؤلفاتك ومصادرك</small></button>
          <button className="quick-card" onClick={()=>setPage("search")}><span className="quick-icon">⌕</span><b>البحث النصي</b><small>اعثر على العبارة داخل الكتب</small></button>
          <button className="quick-card" onClick={()=>setPage("assistant")}><span className="quick-icon">✧</span><b>مساعد المكتبة</b><small>اسأل واستخرج مواضع الاستشهاد</small></button>
          <button className="quick-card" onClick={()=>setPage("add")}><span className="quick-icon">＋</span><b>أضف مؤلفاتك</b><small>استورد ملفاتك النصية بسهولة</small></button>
        </div>
        <div className="section-head"><div><div className="eyebrow">أضيفت مؤخراً</div><h2>أحدث الكتب</h2></div></div>
        <BookGrid books={books.slice(0,4)} onOpen={openBook}/>
      </section>}

      {page==="catalog" && <section className="content">
        <div className="page-title"><div><div className="eyebrow">الخزانة العلمية</div><h1>فهرس الكتب</h1><p>جميع الكتب التي أضفتها إلى مكتبتك في مكان واحد.</p></div><button className="primary" onClick={()=>setPage("add")}>＋ إضافة كتاب</button></div>
        <div className="filter-row"><span className="filter-active">جميع الكتب <b>{books.length}</b></span><span>مرتبة حسب الأحدث</span></div>
        <BookGrid books={books} onOpen={openBook}/>
        {!books.length && <Empty title="مكتبتك لا تزال فارغة" desc="أضف أول كتاب نصي لتبدأ الفهرسة والبحث." action="إضافة كتاب" onClick={()=>setPage("add")}/>}
      </section>}

      {page==="search" && <section className="content">
        <div className="page-title"><div><div className="eyebrow">استكشاف النصوص</div><h1>البحث في المكتبة</h1><p>ابحث عن كلمة أو عبارة في جميع الكتب المفهرسة.</p></div></div>
        <div className="search-panel"><div className="large-search"><Icon>⌕</Icon><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runSearch()} placeholder="اكتب عبارة البحث هنا..." /><button onClick={()=>runSearch()} disabled={busy}>{busy?"جارٍ البحث":"بحث"}</button></div><div className="search-hint">تظهر النتائج مع اسم الكتاب والمؤلف والفصل ورقم الصفحة إذا كان متوفراً في النص.</div></div>
        <div className="results-head"><b>نتائج البحث</b><span>{results.length} نتيجة</span></div>
        {results.map(r=><article className="result-card" key={r.passage_id}><div className="result-meta"><b>{r.title}</b><span>{r.author || "مؤلف غير مسجل"}</span><span>{r.chapter}</span>{r.page_label&&<span>صفحة {r.page_label}</span>}</div><p>{r.excerpt || r.body.slice(0,350)}</p><div className="result-actions"><button onClick={()=>copyText(r.body)}>نسخ النص <Icon>▢</Icon></button><button onClick={async()=>{const b=books.find(x=>x.id===r.book_id)||{id:r.book_id};await openBook(b)}}>فتح الكتاب ←</button></div></article>)}
        {!results.length && <Empty title="لا توجد نتائج بعد" desc="اكتب كلمة أو عبارة ثم اضغط بحث، أو أضف كتباً إلى المكتبة."/>}
      </section>}

      {page==="reader" && <section className="content reader-page">
        <button className="back-link" onClick={()=>setPage("catalog")}>← العودة إلى الفهرس</button>
        {selected && <><div className="reader-heading"><div><div className="eyebrow">{selected.category}</div><h1>{selected.title}</h1><p>{selected.author || "المؤلف غير مسجل"}</p></div><button className="outline" onClick={()=>copyText(reader.map(p=>p.body).join("\n\n"))}>نسخ محتوى المعروض</button></div>
        <div className="reader-layout"><aside className="reader-toc"><b>محتويات النص</b>{reader.map((p,i)=><a key={p.id} href={`#passage-${p.id}`}>{p.chapter || `مقطع ${i+1}`}</a>)}</aside><div className="book-paper">{reader.map((p,i)=><article className="passage" id={`passage-${p.id}`} key={p.id}><div className="passage-top"><span>{p.chapter || "النص"}</span><button onClick={()=>copyText(p.body)}>نسخ المقطع</button></div><div className="book-text">{p.body}</div>{p.page_label&&<div className="page-number">— {p.page_label} —</div>}</article>)}{!reader.length&&<p>لا توجد مقاطع في هذا الكتاب.</p>}</div></div></>}
      </section>}

      {page==="add" && <section className="content">
        <div className="page-title"><div><div className="eyebrow">توسيع الخزانة</div><h1>إضافة كتاب جديد</h1><p>ارفع نسخة نصية ليتم تقسيمها وفهرستها تلقائياً.</p></div></div>
        <div className="upload-layout"><div className="upload-main"><form className="upload-form" onSubmit={uploadBook}>
          <label>عنوان الكتاب<input name="title" placeholder="مثال: شرح ..." required/></label>
          <div className="form-two"><label>اسم المؤلف<input name="author" placeholder="اسم المؤلف"/></label><label>التصنيف<input name="category" placeholder="العقيدة، المنطق، الفلسفة..."/></label></div>
          <label>وصف مختصر<textarea name="description" rows="3" placeholder="نبذة عن الكتاب (اختياري)"/></label>
          <label className="file-drop"><span className="file-icon">⇧</span><b>اختر الملف النصي</b><small>الصيغ المدعومة: TXT وMD — الحد الأقصى 20MB</small><input type="file" name="file" accept=".txt,.md,text/plain,text/markdown" required/></label>
          <button className="primary submit" disabled={busy}>{busy?"جارٍ الاستيراد...":"إضافة الكتاب وفهرسته ←"}</button>
        </form></div><aside className="upload-help"><div className="help-icon">✦</div><h3>كيف تجهز كتابك؟</h3><p>أفضل نتيجة تحصل عليها من ملف نصي منسق بعناوين واضحة.</p><ul><li>اجعل عنوان كل باب مسبوقاً بـ ##</li><li>استخدم [PAGE: 15] لتحديد رقم الصفحة</li><li>احفظ الملف بترميز UTF-8</li><li>راجع حقوق نشر الكتاب قبل رفعه</li></ul><div className="code-sample">## الباب الأول<br/>### الفصل الأول<br/>نص الكتاب هنا...<br/>[PAGE: 15]</div></aside></div>
      </section>}

      {page==="assistant" && <section className="content assistant-page">
        <div className="page-title"><div><div className="eyebrow">باحثك داخل المكتبة</div><h1>مساعد مكتبة البيان</h1><p>ابحث في النصوص وأظهر مواضعها قبل صياغة أي استنتاج.</p></div><span className="beta-pill">نسخة أولية</span></div>
        <div className="assistant-shell"><div className="assistant-top"><div className="assistant-avatar">✧</div><div><b>مساعد المكتبة</b><small><span className="status-dot"></span> متصل بمحرك البحث المحلي</small></div><span className="model-tag">Library Search</span></div>
          <div className="chat-messages">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}><div className="message-avatar">{m.role==="assistant"?"ب":"أ"}</div><div className="bubble"><div className="message-label">{m.role==="assistant"?"مساعد المكتبة":"أنت"}</div><p>{m.text}</p>{m.sources?.map(s=><div className="source-chip" key={s.passage_id}>📖 {s.title} · {s.chapter}{s.page_label?` · ص ${s.page_label}`:""}</div>)}</div></div>)}</div>
          <form className="chat-compose" onSubmit={ask}><input value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="اسأل عن مسألة أو مصطلح في كتبك..." /><button disabled={busy||!chatInput.trim()}>{busy?"…":"إرسال ↑"}</button></form>
          <div className="assistant-disclaimer">حالياً هذه الواجهة تنفذ بحثاً نصياً وتعرض المقاطع. تفعيل توليد الإجابات يحتاج ربط نموذج ذكاء اصطناعي بالخادم.</div>
        </div>
      </section>}
      {notice && <div className="toast">{notice}</div>}
      <footer className="footer">مكتبة البيان <span>·</span> منصة خاصة لإدارة الكتب والبحث في النصوص</footer>
    </main>
  </div>;
}

function BookGrid({books,onOpen}) {
  if (!books.length) return null;
  return <div className="book-grid">{books.map((b,i)=><button className="book-card" key={b.id} onClick={()=>onOpen(b)}><div className={`cover cover-${i%4}`}><span>مكتبة البيان</span><b>{b.title}</b><small>{b.author || "مؤلف غير مسجل"}</small><i>❧</i></div><div className="book-card-info"><b>{b.title}</b><small>{b.author || "مؤلف غير مسجل"}</small><span>{b.category} · {b.passage_count || 0} مقطع</span></div></button>)}</div>;
}
function Empty({title,desc,action,onClick}) { return <div className="empty"><div>▤</div><b>{title}</b><p>{desc}</p>{action&&<button className="primary" onClick={onClick}>{action}</button>}</div>; }

createRoot(document.getElementById("root")).render(<App/>);
