import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Clock3,
  ExternalLink,
  FileSearch,
  FolderOpen,
  Lightbulb,
  LockKeyhole,
  Map,
  NotebookPen,
  Puzzle,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Stamp,
  Terminal,
  X
} from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import { useApp } from "./state";
import type { Evidence, SearchResult, TaskConfig } from "./types";

const caseEvidencePhoto = "/assets/kanshan/case001-evidence-photo.png";
const poseSearch = "/assets/kanshan/kanshan-pose-search.png";
const poseRead = "/assets/kanshan/kanshan-pose-read.png";
const poseThink = "/assets/kanshan/kanshan-pose-think.png";
const poseClose = "/assets/kanshan/kanshan-pose-close.png";

function pagePath(page: string) {
  return { P01: "/", P02: "/brief", P03: "/desk", P05: "/evidence", P06: "/reasoning", P07: "/report" }[page] || "/desk";
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="scan-mark"><FileSearch size={30} /></div>
      <p>正在调取案件档案</p>
      <span>CASE FILE / 001</span>
    </main>
  );
}

function Toast() {
  const { toast } = useApp();
  return toast ? <div className="toast"><CheckCircle2 size={18} />{toast}</div> : null;
}

function CaseShell({ children, pageLabel, backTo = "/desk" }: { children: ReactNode; pageLabel: string; backTo?: string }) {
  const { caseConfig, run } = useApp();
  return (
    <div className="case-shell">
      <header className="case-nav">
        <Link className="icon-button" to={backTo} aria-label="返回" title="返回"><ArrowLeft size={20} /></Link>
        <div className="nav-case">
          <span>{caseConfig?.caseNumber}</span>
          <strong>{caseConfig?.title}</strong>
          <i>{pageLabel}</i>
        </div>
        <div className="nav-progress">
          <Link to="/evidence" title="查看证据"><FolderOpen size={17} /><b>{run?.evidenceIds.length || 0}</b> 份证据</Link>
          <Link to="/evidence" title="查看拼图"><Puzzle size={17} /><b>{run?.pieceIds.length || 0}</b> / 9</Link>
          <span className="save-state"><Check size={15} /> 已保存</span>
        </div>
      </header>
      {children}
      <Toast />
    </div>
  );
}

function HomePage() {
  const { caseConfig, run, createRun, loading, error } = useApp();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!caseConfig || error) return <div className="fatal-state"><X size={34} /><h1>档案调取失败</h1><p>{error}</p></div>;

  async function acceptCase() {
    setWorking(true);
    try {
      await createRun();
      navigate("/brief");
    } finally {
      setWorking(false);
    }
  }

  const hasProgress = run && !["BRIEF", "CLOSED"].includes(run.status);
  const isClosed = run?.status === "CLOSED";

  return (
    <main className="agency-home">
      <div className="agency-noise" />
      <header className="agency-header">
        <div className="wordmark"><span>看山</span><strong>侦探事务所</strong><i>KANSHAN DETECTIVE AGENCY</i></div>
        <div className="open-status"><span /> 今夜营业中 <b>19:42</b></div>
      </header>

      <section className="home-stage">
        <div className="home-copy">
          <p className="eyebrow">每一个知乎问题，都值得调查。</p>
          <h1>真相不会<br />自己浮上来。</h1>
          <p className="kanshan-line">“{caseConfig.copy.home}”</p>
          <div className="home-meta"><span><Clock3 /> {caseConfig.duration}</span><span><ShieldCheck /> 无需登录</span><span><Terminal /> 真实知乎搜索</span></div>
        </div>
        <div className="hero-image-focus" aria-label="看山侦探事务所场景" />
        <article className="today-case">
          <div className="case-paper-head"><span>今日案件</span><b>NEW</b><i>{caseConfig.caseNumber}</i></div>
          <h2>{caseConfig.title}</h2>
          <p>{caseConfig.question}</p>
          <div className="case-stats">
            <div><small>难度</small><strong>{caseConfig.difficulty}</strong></div>
            <div><small>预计用时</small><strong>{caseConfig.duration}</strong></div>
            <div><small>调查进度</small><strong>{isClosed ? "100%" : run ? `${Math.round((run.evidenceIds.length / 5) * 100)}%` : "0%"}</strong></div>
          </div>
          {isClosed ? (
            <div className="case-actions"><button className="primary-button" onClick={() => navigate("/report")}><Stamp /> 查看结案报告</button><button className="text-button" onClick={acceptCase}><RotateCcw /> 重新调查</button></div>
          ) : hasProgress ? (
            <div className="case-actions"><button className="primary-button" onClick={() => navigate(pagePath(run.lastPage))}>继续调查 <ArrowRight /></button><button className="text-button" onClick={acceptCase}><RotateCcw /> 重新开始</button></div>
          ) : run?.status === "BRIEF" ? (
            <button className="primary-button wide" onClick={() => navigate("/brief")}>查看委托 <ArrowRight /></button>
          ) : (
            <button className="primary-button wide" disabled={working} onClick={acceptCase}>{working ? "正在建档..." : "接受委托"} <ArrowRight /></button>
          )}
          <div className="paperclip" />
        </article>
      </section>

      <section className="case-shelf">
        <div className="shelf-title"><span>案件档案</span><small>ARCHIVE / 2026</small></div>
        {["消失的行动力", "凌晨三点的食欲", "记忆失窃案"].map((title, index) => (
          <div className="locked-case" key={title}><LockKeyhole size={16} /><span>CASE 00{index + 2}</span><strong>{title}</strong><small>尚未解锁</small></div>
        ))}
        <div className="method-note"><b>调查方法</b><span>搜索 → 阅读 → 比较 → 推理</span><small>所有正式结论必须回到来源</small></div>
      </section>
    </main>
  );
}

function BriefPage() {
  const { caseConfig, run, startRun } = useApp();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  if (!caseConfig || !run) return <Navigate to="/" replace />;
  if (run.status === "CLOSED") return <Navigate to="/report" replace />;

  async function begin() {
    setStarting(true);
    await startRun();
    navigate("/desk");
  }

  return (
    <CaseShell pageLabel="委托档案" backTo="/">
      <main className="brief-room">
        <article className="brief-file">
          <div className="file-tab">机密 / CONFIDENTIAL</div>
          <div className="brief-heading"><div><span>{caseConfig.caseNumber}</span><h1>{caseConfig.title}</h1></div><div className="red-stamp">机密档案</div></div>
          <p className="case-question">{caseConfig.question}</p>
          <div className="brief-grid">
            <section><small>委托背景</small><p>{caseConfig.brief}</p></section>
            <section><small>调查目标</small><ul><li>收集至少 3 条证据</li><li>找到关键来源并确认限制</li><li>组织一次证据链推理</li></ul></section>
            <section className="brief-resource"><small>初始资源</small><div><Search /> 搜索令 × 1</div><div><Lightbulb /> 看山提示 × 1</div></section>
            <section className="brief-meta"><span><Clock3 /> {caseConfig.duration}</span><span><ShieldCheck /> 难度：{caseConfig.difficulty}</span></section>
          </div>
          <div className="disclaimer"><ShieldCheck size={18} /><p><strong>调查边界</strong>{caseConfig.disclaimer}</p></div>
          <button className="primary-button brief-start" disabled={starting} onClick={begin}>{starting ? "正在开启档案..." : "开始调查"}<ArrowRight /></button>
        </article>
        <aside className="brief-kanshan">
          <div className="polaroid"><img src={caseEvidencePhoto} alt="CASE 001 现场记录" /><span>现场记录 / 07:42</span></div>
          <img className="brief-reader" src={poseRead} alt="看山正在阅读卷宗" />
          <blockquote>“{caseConfig.copy.brief}”</blockquote>
        </aside>
      </main>
    </CaseShell>
  );
}

const taskIcons: Record<string, ReactNode> = {
  search: <Search />,
  dossier: <BookOpen />,
  compare: <BrainCircuit />,
  note: <NotebookPen />,
  source: <ShieldCheck />
};

function DeskPage() {
  const { caseConfig, run, setToast } = useApp();
  const navigate = useNavigate();
  if (!caseConfig || !run) return <Navigate to="/" replace />;
  if (run.status === "BRIEF") return <Navigate to="/brief" replace />;
  if (run.status === "CLOSED") return <Navigate to="/report" replace />;
  const currentRun = run;

  const nextTask = caseConfig.tasks.find((task) => currentRun.taskStates[task.id] === "AVAILABLE" && !task.optional)
    || caseConfig.tasks.find((task) => currentRun.taskStates[task.id] === "AVAILABLE");
  const ready = currentRun.status === "READY" || currentRun.status === "REASONING";

  function openTask(task: TaskConfig) {
    if (currentRun.taskStates[task.id] === "LOCKED") {
      setToast(task.id === "T05" ? "再收集一份证据，关键来源就会解锁" : "先完成前置调查，档案会自动解锁");
      return;
    }
    navigate(`/task/${task.id}`);
  }

  return (
    <CaseShell pageLabel="调查桌面" backTo="/">
      <main className="desk-page">
        <section className="desk-overview">
          <div><span>当前目标</span><h1>{ready ? "组织证据，提交推理" : nextTask?.subtitle || "继续补全证据链"}</h1></div>
          <div className="desk-counters"><button onClick={() => navigate("/evidence")}><FolderOpen /><b>{run.evidenceIds.length}</b><span>已收证据</span></button><button onClick={() => navigate("/evidence")}><Puzzle /><b>{run.pieceIds.length}/9</b><span>真相拼图</span></button></div>
          <div className="save-time"><CheckCircle2 /> 最近保存：刚刚</div>
        </section>

        <section className="investigation-desk">
          <div className="desk-grid">
            {caseConfig.tasks.map((task, index) => {
              const status = run.taskStates[task.id];
              return (
                <button key={task.id} className={`task-file task-${index + 1} status-${status.toLowerCase()}`} onClick={() => openTask(task)}>
                  <span className="task-pin" />
                  <div className="task-icon">{status === "LOCKED" ? <LockKeyhole /> : taskIcons[task.kind]}</div>
                  <small>{task.id}{task.optional ? " / 可选" : ""}</small>
                  <h2>{task.title}</h2>
                  <p>{status === "LOCKED" ? "等待前置线索" : task.subtitle}</p>
                  <div className="task-foot"><span>{status === "COMPLETED" ? "调查完成" : status === "LOCKED" ? "未解锁" : "进入调查"}</span>{status === "COMPLETED" ? <Stamp /> : <ArrowRight />}</div>
                </button>
              );
            })}
            <button className="puzzle-entry" onClick={() => navigate("/evidence")}><Puzzle /><div><small>TRUTH BOARD</small><strong>真相拼图</strong><span>已收集 {run.pieceIds.length} / 9</span></div><ArrowRight /></button>
          </div>
        </section>

        <aside className={`kanshan-advice ${ready ? "is-ready" : ""}`}>
          <img src={poseThink} alt="看山正在思考" />
          <div><small>看山建议 / PRESET AI</small><p>{ready ? caseConfig.copy.ready : `下一步去“${nextTask?.title || "证据板"}”。先把能回溯的线索收进来。`}</p></div>
          <button className="primary-button" onClick={() => ready ? navigate("/reasoning") : nextTask && openTask(nextTask)}>{ready ? "开始推理" : "继续调查"}<ArrowRight /></button>
        </aside>
      </main>
    </CaseShell>
  );
}

function TaskPage() {
  const { taskId = "" } = useParams();
  const { caseConfig, run, completeTask, updateRun, setToast } = useApp();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const task = caseConfig?.tasks.find((item) => item.id === taskId.toUpperCase());
  if (!caseConfig || !run || !task) return <Navigate to="/desk" replace />;
  if (run.taskStates[task.id] === "LOCKED") return <Navigate to="/desk" replace />;

  async function finish(payload: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const updated = await completeTask(task!.id, payload);
      updateRun(updated);
      setToast(`已获得 ${task!.reward}`);
      navigate("/desk");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CaseShell pageLabel={task.title}>
      <main className="task-page">
        <header className="task-header"><div className="task-seal">{task.id}</div><div><small>调查任务 / {task.kind.toUpperCase()}</small><h1>{task.title}</h1><p>{task.subtitle}</p></div><div className="task-reward"><Puzzle /> 完成奖励<b>{task.reward}</b></div></header>
        {run.taskStates[task.id] === "COMPLETED" ? (
          <section className="task-complete-state"><Stamp /><h2>本项调查已归档</h2><p>证据与拼图已经存入案件，不会重复发放。</p><button className="primary-button" onClick={() => navigate("/desk")}>返回调查桌面 <ArrowRight /></button></section>
        ) : task.id === "T01" ? <SearchTask runId={run.runId} recommended={caseConfig.recommendedQueries} finish={finish} submitting={submitting} />
        : task.id === "T02" ? <DossierTask dossiers={caseConfig.dossiers} finish={finish} submitting={submitting} />
        : task.id === "T03" ? <CompareTask config={caseConfig.comparison} finish={finish} submitting={submitting} />
        : task.id === "T04" ? <NoteTask initial={run.noteDraft} finish={finish} submitting={submitting} />
        : <SourceTask source={caseConfig.keySource} finish={finish} submitting={submitting} />}
      </main>
    </CaseShell>
  );
}

function SearchTask({ runId, recommended, finish, submitting }: { runId: string; recommended: string[]; finish: (p: Record<string, unknown>) => void; submitting: boolean }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"auto" | "demo">("auto");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const { setToast } = useApp();

  async function search(event: FormEvent) {
    event.preventDefault();
    const normalized = query.trim().replace(/\s+/g, " ");
    if (normalized.length < 2) return;
    setSearching(true);
    setSelected(null);
    try {
      const data = await api.search(runId, normalized, mode);
      setResults(data.results);
      setSourceLabel(data.source === "zhihu-cli" ? "知乎 CLI 实时结果" : "演示数据");
      if (!data.results.length) setToast("没有找到结果，换一个推荐词试试");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="search-workbench">
      <div className="search-terminal">
        <div className="terminal-title"><Terminal /> ZHIHU SEARCH TERMINAL <span>CLI CONNECTED</span></div>
        <form onSubmit={search}><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入 2-40 字调查关键词" maxLength={40} /><button disabled={searching || query.trim().length < 2}>{searching ? "调查中..." : "搜索"}</button></form>
        <div className="terminal-options"><div>{recommended.map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div><label>数据源<select value={mode} onChange={(e) => setMode(e.target.value as "auto" | "demo")}><option value="auto">真实 CLI 优先</option><option value="demo">演示数据</option></select></label></div>
      </div>
      {searching ? <div className="search-skeleton"><img className="search-agent" src={poseSearch} alt="看山正在搜索" /><p>看山正在翻查知乎内容库</p><span>正在核对标题、摘要与原文链接...</span></div> : null}
      {results.length > 0 ? <div className="result-list"><div className="result-list-head"><span>{sourceLabel}</span><small>{results.length} 条结果 · 摘要不等于完整原文</small></div>{results.map((result) => <article key={result.sourceId} className={selected?.sourceId === result.sourceId ? "selected" : ""}><div className="result-meta"><span>{result.type}</span>{result.fallback && <b>演示数据</b>}<small>{result.author}</small></div><h3>{result.title}</h3><p>{result.summary}</p><div className="result-actions"><a href={result.url} target="_blank" rel="noreferrer">查看原文 <ExternalLink /></a><button onClick={() => setSelected(result)}>{selected?.sourceId === result.sourceId ? <><Check /> 已选为线索</> : "标记为线索"}</button></div></article>)}</div> : null}
      {selected ? <div className="claim-bar"><div><CheckCircle2 /><span>已选择</span><strong>{selected.title}</strong></div><button className="primary-button" disabled={submitting} onClick={() => finish({ source: selected })}>{submitting ? "正在归档..." : "领取线索碎片"}<Puzzle /></button></div> : null}
    </section>
  );
}

function DossierTask({ dossiers, finish, submitting }: { dossiers: Array<{ id: string; title: string; author: string; body: string; excerpts: Array<{ id: string; text: string }> }>; finish: (p: Record<string, unknown>) => void; submitting: boolean }) {
  const [activeId, setActiveId] = useState(dossiers[0].id);
  const [excerptId, setExcerptId] = useState("");
  const active = dossiers.find((item) => item.id === activeId)!;
  return <section className="dossier-workbench"><aside>{dossiers.map((item) => <button key={item.id} className={item.id === activeId ? "active" : ""} onClick={() => { setActiveId(item.id); setExcerptId(""); }}><FolderOpen /><span>{item.title}</span><small>{item.author}</small></button>)}</aside><article className="reading-file"><div className="file-label">审核摘录 / 演示内容</div><h2>{active.title}</h2><p className="file-author">整理：{active.author} · 预计阅读 1 分钟</p><div className="file-body">{active.body}</div><h3>你认为哪一段最值得收入证据板？</h3><div className="excerpt-list">{active.excerpts.map((item) => <label key={item.id} className={excerptId === item.id ? "selected" : ""}><input type="radio" name="excerpt" checked={excerptId === item.id} onChange={() => setExcerptId(item.id)} /><span>{item.text}</span><CheckCircle2 /></label>)}</div><button className="primary-button" disabled={!excerptId || submitting} onClick={() => finish({ dossierId: active.id, excerptId })}>收录重点摘录 <ArrowRight /></button></article></section>;
}

function CompareTask({ config, finish, submitting }: { config: { viewpoints: Array<{ id: string; label: string; text: string; source: string }>; reasonTags: string[] }; finish: (p: Record<string, unknown>) => void; submitting: boolean }) {
  const [viewpoint, setViewpoint] = useState("");
  const [reasonTag, setReasonTag] = useState("");
  return <section className="compare-workbench"><div className="comparison-board">{config.viewpoints.map((item) => <button key={item.id} className={`viewpoint-card ${viewpoint === item.id ? "selected" : ""}`} onClick={() => setViewpoint(item.id)}><span>{item.label}</span><blockquote>“{item.text}”</blockquote><small>来源：{item.source}</small><div>{viewpoint === item.id ? <><CheckCircle2 /> 我的判断</> : "选择此观点"}</div></button>)}<div className="versus">VS</div></div><div className="reason-strip"><h3>你判断的依据是什么？</h3>{config.reasonTags.map((tag) => <button key={tag} className={reasonTag === tag ? "selected" : ""} onClick={() => setReasonTag(tag)}>{reasonTag === tag && <Check />}{tag}</button>)}</div><div className="task-submit-row"><p><BrainCircuit /> 看山只会解释证据相关性，不会替你裁定事实。</p><button className="primary-button" disabled={!viewpoint || !reasonTag || submitting} onClick={() => finish({ viewpoint, reasonTag })}>提交对照分析 <ArrowRight /></button></div></section>;
}

function NoteTask({ initial, finish, submitting }: { initial: string; finish: (p: Record<string, unknown>) => void; submitting: boolean }) {
  const [note, setNote] = useState(initial || "");
  return <section className="note-workbench"><div className="notebook"><div className="notebook-binding" /><small>PERSONAL FIELD NOTE / 个人证词</small><h2>你有没有睡够却仍然疲惫的经历？</h2><p>你怀疑是什么影响了恢复感？只记录线索，不必给自己下结论。</p><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="写下 10-120 字调查笔记..." /><div className="note-count"><span>请勿填写手机号、地址、病历号等隐私信息</span><b className={note.length < 10 ? "invalid" : ""}>{note.length} / 120</b></div></div><aside className="note-boundary"><ShieldCheck /><h3>证据边界</h3><p>这份记录会作为“个人证词”进入报告，但不能单独用来证明普遍结论。</p><button className="primary-button" disabled={note.trim().length < 10 || submitting} onClick={() => finish({ note: note.trim() })}>完成调查笔记 <ArrowRight /></button></aside></section>;
}

function SourceTask({ source, finish, submitting }: { source: { title: string; source: string; publishedAt: string; excerpt: string; supports: string; limitation: string }; finish: (p: Record<string, unknown>) => void; submitting: boolean }) {
  const [support, setSupport] = useState(false);
  const [limitation, setLimitation] = useState(false);
  return <section className="source-workbench"><article className="decisive-source"><div className="source-ribbon">DECISIVE EVIDENCE / 关键来源</div><h2>{source.title}</h2><p className="source-byline">{source.source} · {source.publishedAt}</p><blockquote>{source.excerpt}</blockquote><div className="source-meaning"><section><CheckCircle2 /><div><small>它支持什么</small><p>{source.supports}</p></div></section><section><ShieldCheck /><div><small>它不能证明什么</small><p>{source.limitation}</p></div></section></div></article><aside className="source-confirm"><Stamp /><h3>收录前确认</h3><p>侦探要把结论和限制一起带走。</p><label className={support ? "checked" : ""}><input type="checkbox" checked={support} onChange={(e) => setSupport(e.target.checked)} /><span>我确认这份证据支持的调查方向</span><Check /></label><label className={limitation ? "checked" : ""}><input type="checkbox" checked={limitation} onChange={(e) => setLimitation(e.target.checked)} /><span>我会在结论中保留它的限制</span><Check /></label><button className="primary-button" disabled={!support || !limitation || submitting} onClick={() => finish({ supportChecked: support, limitationChecked: limitation })}>收录决定性证据 <Puzzle /></button></aside></section>;
}

function EvidencePage() {
  const { caseConfig, run } = useApp();
  const navigate = useNavigate();
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null);
  if (!caseConfig || !run) return <Navigate to="/" replace />;
  const evidence = run.evidenceIds.map((id) => ({ ...caseConfig.evidence.find((item) => item.id === id)!, ...(run.evidenceDetails[id] || {}) }));
  const ready = run.status === "READY" || run.status === "REASONING";

  return <CaseShell pageLabel="证据板与真相拼图"><main className="evidence-page"><section className="evidence-ledger"><header><div><small>EVIDENCE LEDGER</small><h1>线索记录</h1></div><span>{evidence.length} / 6</span></header>{evidence.length ? <div className="evidence-list">{evidence.map((item) => <button key={item.id} className={activeEvidence === item.id ? "active" : ""} onClick={() => setActiveEvidence(activeEvidence === item.id ? null : item.id)}><div className="evidence-id">{item.id}</div><div><span>{item.type}</span><h3>{item.title}</h3><p>{item.excerpt}</p>{activeEvidence === item.id && <footer><small>来源：{item.source}</small>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看上下文 <ExternalLink /></a>}</footer>}</div><i>{item.required ? "关键" : item.relation}</i></button>)}</div> : <div className="empty-evidence"><FileSearch /><p>还没有证据入档</p></div>}</section><section className="truth-board"><header><div><small>TRUTH PUZZLE</small><h1>真相拼图</h1></div><span>已解锁 {run.pieceIds.length} / 9</span></header><div className="puzzle-grid">{caseConfig.puzzle.map((label, index) => { const unlocked = run.pieceIds.includes(`P${index + 1}`); return <div key={label} className={unlocked ? "unlocked" : "locked"} style={{ "--piece-x": `${(index % 3) * 50}%`, "--piece-y": `${Math.floor(index / 3) * 50}%` } as React.CSSProperties}>{unlocked ? <><span>{label}</span><CheckCircle2 /></> : <><LockKeyhole /><span>P{index + 1}</span></>}</div>; })}</div><div className="truth-gap"><Lightbulb /><p>{ready ? "关键证据已经补齐。你可以提出一个带边界的真相版本。" : `还有 ${Math.max(0, 4 - evidence.length)} 份关键调查需要完成。拼图不是答案，只是在提醒你哪里仍是空白。`}</p></div><button className="primary-button wide" disabled={!ready} onClick={() => navigate("/reasoning")}>{ready ? "开始组织推理" : "证据尚未闭合"}<ArrowRight /></button></section></main></CaseShell>;
}

function ReasoningPage() {
  const { caseConfig, run, updateRun } = useApp();
  const navigate = useNavigate();
  const [optionId, setOptionId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  if (!caseConfig || !run) return <Navigate to="/" replace />;
  if (run.status === "CLOSED") return <Navigate to="/report" replace />;
  if (!['READY', 'REASONING'].includes(run.status)) return <Navigate to="/evidence" replace />;
  const currentRun = run;
  const eligible = run.evidenceIds.map((id) => ({ ...caseConfig.evidence.find((item) => item.id === id)!, ...(run.evidenceDetails[id] || {}) })).filter((item) => item.eligible);

  function toggleEvidence(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...selected];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSelected(next);
  }
  async function submit() {
    setSubmitting(true);
    setFeedback("");
    const result = await api.reason(currentRun.runId, { attemptId: crypto.randomUUID(), selectedOptionId: optionId, evidenceIds: selected, reason });
    updateRun(result.state);
    setFeedback(result.feedback);
    setSubmitting(false);
    if (result.success) window.setTimeout(() => navigate("/report"), 900);
  }
  async function assist() {
    const result = await api.assist(currentRun.runId);
    updateRun(result.state);
    navigate("/report");
  }

  return <CaseShell pageLabel="推理提交" backTo="/evidence"><main className="reasoning-page"><header className="reasoning-heading"><div><small>FINAL REASONING / 最终推理</small><h1>{caseConfig.reasoning.question}</h1></div><div className="attempt-badge">第 {run.attemptCount + 1} 次推理</div></header><div className="reasoning-grid"><section className="option-panel"><h2><span>01</span>核心因素</h2>{caseConfig.reasoning.options.map((option) => <button key={option.id} className={optionId === option.id ? "selected" : ""} onClick={() => setOptionId(option.id)}><b>{option.id}</b><span>{option.label}</span>{optionId === option.id ? <CheckCircle2 /> : <i />}</button>)}</section><section className="chain-panel"><h2><span>02</span>关键证据链 <small>选择 2-3 份</small></h2><div className="evidence-pool">{eligible.map((item) => <button key={item.id} className={selected.includes(item.id) ? "selected" : ""} onClick={() => toggleEvidence(item.id)}><small>{item.type}</small><strong>{item.title}</strong><span>{item.relation}</span>{selected.includes(item.id) && <Check />}</button>)}</div><div className="chain-order"><small>影响排序 / 越靠上越关键</small>{selected.map((id, index) => { const item = eligible.find((e) => e.id === id)!; return <div key={id}><b>{index + 1}</b><span>{item.title}</span><button onClick={() => move(index, -1)} disabled={index === 0} aria-label="上移"><ChevronUp /></button><button onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label="下移"><ChevronDown /></button></div>; })}{selected.length === 0 && <p>从上方证据中选择 2-3 份</p>}</div></section><section className="reason-panel"><h2><span>03</span>我的理由 <small>可选</small></h2><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="用自己的话解释这条证据链..." /><small>{reason.length} / 120</small><div className="reasoning-boundary"><ShieldCheck /><p>硬规则只检查核心因素和已收集证据。你的理由只用于预制点评，不会被 AI 当作医学事实。</p></div></section></div>{submitting && <div className="ai-review"><BrainCircuit /><div><strong>看山正在核对证据链</strong><span>检查关键来源 · 查找相互印证 · 保留结论边界</span></div></div>}{feedback && <div className={`reason-feedback ${run.status === "CLOSED" ? "success" : "fail"}`}><img src={poseThink} alt="看山正在复核推理" /><div><small>看山点评 / PRESET REVIEW</small><p>{feedback}</p></div></div>}<footer className="reasoning-submit"><button className="text-button" onClick={() => navigate("/evidence")}><ArrowLeft /> 返回证据板</button>{run.attemptCount >= 3 && run.status !== "CLOSED" ? <button className="assist-button" onClick={assist}><Lightbulb /> 协助结案（评级最高 B）</button> : null}<button className="primary-button" disabled={!optionId || selected.length < 2 || submitting} onClick={submit}>{submitting ? "正在核对..." : "提交推理"}<ArrowRight /></button></footer></main></CaseShell>;
}

function ReportPage() {
  const { caseConfig, run, createRun, setToast } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(run?.report?.shareDraft || "");
  const [showShare, setShowShare] = useState(false);
  if (!caseConfig || !run) return <Navigate to="/" replace />;
  if (run.status !== "CLOSED" || !run.report) return <Navigate to={pagePath(run.lastPage)} replace />;
  const report = run.report;
  const minutes = Math.max(1, Math.round(report.durationSeconds / 60));
  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setToast("分享草稿已复制");
  }
  async function restart() {
    await createRun();
    navigate("/brief");
  }
  return <CaseShell pageLabel="结案报告" backTo="/"><main className="report-page"><article className="report-file"><div className="closed-stamp">案件已解决</div><header><div><small>{caseConfig.caseNumber} / FINAL REPORT</small><h1>{caseConfig.title}</h1><p>{caseConfig.question}</p></div><div className="grade"><span>案件评级</span><strong>{report.grade}</strong><small>{report.assisted ? "协助结案" : "独立结案"}</small></div></header><div className="report-metrics"><span><Clock3 /> 用时 <b>{minutes} 分钟</b></span><span><BrainCircuit /> 推理 <b>{report.attemptCount} 次</b></span><span><FolderOpen /> 证据 <b>{run.evidenceIds.length} 份</b></span><span><Puzzle /> 拼图 <b>{run.pieceIds.length} / 9</b></span></div><section className="final-conclusion"><small>本案结论 / REVIEWED CONCLUSION</small><h2>{report.selectedOption.label}</h2><p>{report.conclusion}</p><div><ShieldCheck />{report.limitation}</div></section><section className="report-chain"><h2>我的证据链</h2><div>{report.evidenceChain.map((item, index) => <article key={item.id}><b>{index + 1}</b><small>{item.type}</small><h3>{item.title}</h3><p>{item.excerpt}</p></article>)}</div></section><section className="source-list"><h2>事实来源</h2>{report.sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer"><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{source.title}</strong><small>{source.source}</small></div><ExternalLink /></a>)}{report.fallbackUsed && <div className="fallback-note"><Terminal /> 本次调查使用过演示搜索数据，正式演示前请检查 CLI 状态。</div>}</section><section className="kanshan-report"><div className="report-photo"><img src={poseClose} alt="看山完成结案" /><span>刘看山 / 主持调查</span></div><blockquote>“{report.comment}”</blockquote></section><footer><button className="primary-button" onClick={() => setShowShare(true)}><Clipboard /> 分享报告</button><button className="secondary-button" onClick={() => navigate("/")}><Map /> 返回事务所</button><button className="text-button" onClick={restart}><RotateCcw /> 重新调查</button></footer></article>{showShare && <div className="modal-backdrop" onClick={() => setShowShare(false)}><div className="share-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowShare(false)}><X /></button><small>SHARE DRAFT / 本地草稿</small><h2>把证据和限制一起分享</h2><textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} /><div className="share-count">{draft.length} / 300</div><p><ShieldCheck /> 本 Demo 不接 OAuth，也不会代表你发布内容。</p><div><button className="primary-button" onClick={copyDraft}><Clipboard /> 复制草稿</button><a className="secondary-button" href="https://www.zhihu.com/" target="_blank" rel="noreferrer">打开知乎 <ExternalLink /></a></div></div></div>}</main></CaseShell>;
}

export function App() {
  const { loading } = useApp();
  if (loading) return <LoadingScreen />;
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/brief" element={<BriefPage />} /><Route path="/desk" element={<DeskPage />} /><Route path="/task/:taskId" element={<TaskPage />} /><Route path="/evidence" element={<EvidencePage />} /><Route path="/reasoning" element={<ReasoningPage />} /><Route path="/report" element={<ReportPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
