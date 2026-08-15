import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Coffee,
  ExternalLink,
  FileSearch,
  FolderOpen,
  History,
  Menu,
  MessageCircle,
  Music2,
  Puzzle,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { v3Api } from "./api";
import type { EvidenceRecord, RoundConfig, SearchResult, SourceSnapshot, Suspect, V3Case, V3Run } from "./types";
import "./styles.css";

const poseSearch = "/assets/kanshan/kanshan-pose-search.png";
const poseThink = "/assets/kanshan/kanshan-pose-think.png";
const poseRead = "/assets/kanshan/kanshan-pose-read.png";
const poseClose = "/assets/kanshan/kanshan-pose-close.png";
const themeMusic = "/assets/audio/kanshan-detective-theme.mp3";

interface AudioContextValue {
  enabled: boolean;
  playing: boolean;
  toggle: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

function readPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Preference persistence is optional. */ }
}

function useAudio() {
  const value = useContext(AudioContext);
  if (!value) throw new Error("AudioProvider missing");
  return value;
}

function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(() => readPreference("kanshan_audio_enabled") !== "off");
  const [playing, setPlaying] = useState(false);
  const [promptOpen, setPromptOpen] = useState(() => readPreference("kanshan_audio_prompt_seen") !== "true");

  async function start() {
    setEnabled(true);
    savePreference("kanshan_audio_enabled", "on");
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.24;
    try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
  }

  function stop() {
    setEnabled(false);
    savePreference("kanshan_audio_enabled", "off");
    audioRef.current?.pause();
    setPlaying(false);
  }

  function toggle() {
    if (enabled && playing) stop();
    else void start();
  }

  function finishPrompt(withSound: boolean) {
    savePreference("kanshan_audio_prompt_seen", "true");
    setPromptOpen(false);
    if (withSound) void start();
    else stop();
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.24;
    if (!enabled) { audio.pause(); return; }
    if (promptOpen) return;
    const unlock = () => { void audio.play().catch(() => setPlaying(false)); };
    void audio.play().catch(() => setPlaying(false));
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [enabled, promptOpen]);

  const value = useMemo(() => ({ enabled, playing, toggle }), [enabled, playing]);
  return <AudioContext.Provider value={value}>
    <audio ref={audioRef} src={themeMusic} loop preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    {children}
    {promptOpen && <div className="sound-prompt-backdrop"><section className="sound-prompt" role="dialog" aria-modal="true" aria-labelledby="sound-prompt-title"><div><Music2 /></div><small>沉浸调查模式</small><h2 id="sound-prompt-title">开启声音，体验更佳</h2><p>建议打开背景音乐，进入看山侦探事务所的调查氛围。</p><button className="v3-primary" onClick={() => finishPrompt(true)}><Volume2 />开启声音</button><button className="v3-text-button" onClick={() => finishPrompt(false)}>暂不开启</button></section></div>}
  </AudioContext.Provider>;
}

function SoundToggle() {
  const { enabled, playing, toggle } = useAudio();
  const status = enabled ? (playing ? "播放中" : "待播放") : "已关闭";
  return <button className={`sound-toggle ${enabled ? "enabled" : ""} ${enabled && !playing ? "waiting" : ""}`} onClick={toggle} aria-pressed={enabled} title={enabled ? "关闭背景音乐" : "开启背景音乐"}>{enabled ? <Volume2 /> : <VolumeX />}<span>声音</span><i>{status}</i></button>;
}

interface ContextValue {
  caseData: V3Case | null;
  run: V3Run | null;
  loading: boolean;
  error: string | null;
  toast: string | null;
  setRun: (run: V3Run) => void;
  setToast: (message: string | null) => void;
  createRun: () => Promise<V3Run>;
}

const V3Context = createContext<ContextValue | null>(null);

function useV3() {
  const value = useContext(V3Context);
  if (!value) throw new Error("V3Provider missing");
  return value;
}

function V3Provider({ children }: { children: ReactNode }) {
  const [caseData, setCaseData] = useState<V3Case | null>(null);
  const [run, setRun] = useState<V3Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const config = await v3Api.case();
        if (!active) return;
        setCaseData(config);
        const runId = localStorage.getItem("kanshan_v3_run");
        if (runId) {
          try {
            const saved = await v3Api.getRun(runId);
            if (active) setRun(saved);
          } catch {
            localStorage.removeItem("kanshan_v3_run");
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "V3案件加载失败");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function createRun() {
    const next = await v3Api.createRun();
    localStorage.setItem("kanshan_v3_run", next.runId);
    setRun(next);
    return next;
  }

  const value = useMemo(() => ({ caseData, run, loading, error, toast, setRun, setToast, createRun }), [caseData, run, loading, error, toast]);
  return <V3Context.Provider value={value}>{children}</V3Context.Provider>;
}

function SuspectIcon({ suspect, size = 28 }: { suspect: Suspect; size?: number }) {
  if (suspect.icon === "smartphone") return <Smartphone size={size} />;
  if (suspect.icon === "coffee") return <Coffee size={size} />;
  if (suspect.icon === "volume") return <Volume2 size={size} />;
  return <BriefcaseBusiness size={size} />;
}

function Toast() {
  const { toast } = useV3();
  return toast ? <div className="v3-toast"><CheckCircle2 />{toast}</div> : null;
}

function routeFor(run: V3Run) {
  if (run.status === "BRIEF") return "/brief";
  if (run.status === "INITIAL_VOTE") return "/initial-vote";
  if (run.status === "ROUND_ACTIVE") return `/round/R${run.currentRound}`;
  if (run.status === "ROUND_VOTE") return `/vote/R${run.currentRound}`;
  if (run.status === "RECAP") return `/recap/R${run.currentRound}`;
  if (run.status === "FINAL_READY" || run.status === "FINAL_VOTE") return "/board";
  return "/report";
}

function CaseHeader({ round, backTo = "/", board = true }: { round?: RoundConfig; backTo?: string; board?: boolean }) {
  const { caseData, run } = useV3();
  return <header className="v3-header">
    <Link to={backTo} className="v3-back" aria-label="返回"><ArrowLeft /></Link>
    <div className="v3-wordmark"><span>看山</span><strong>侦探事务所</strong></div>
    <div className="v3-case-name"><small>{caseData?.caseNumber}</small><b>{caseData?.title}</b></div>
    {round && <div className="v3-round-pill">第 <b>{round.index}</b> / 7 轮</div>}
    <div className="v3-header-stats">
      <span><FolderOpen />证据 <b>{run?.evidenceRecords.length || 0}</b></span>
      <span><History />投票 <b>{run?.votes.length || 0}</b></span>
      <i><Check />已保存</i>
      {board && run && <Link to="/board" title="查看案件板"><Puzzle /></Link>}
      <SoundToggle />
    </div>
  </header>;
}

function SuspectCard({ suspect, selected, onClick, compact = false }: { suspect: Suspect; selected?: boolean; onClick?: () => void; compact?: boolean }) {
  const content = <>
    <div className="suspect-portrait" style={{ "--suspect-color": suspect.color } as React.CSSProperties}><SuspectIcon suspect={suspect} size={compact ? 30 : 48} /></div>
    <strong>{suspect.name}</strong><small>{suspect.alias}</small>
    {!compact && <p>{suspect.summary}</p>}
    {selected ? <CheckCircle2 className="suspect-check" /> : <i />}
  </>;
  return onClick ? <button className={`suspect-card ${selected ? "selected" : ""} ${compact ? "compact" : ""}`} onClick={onClick}>{content}</button> : <article className={`suspect-card ${compact ? "compact" : ""}`}>{content}</article>;
}

function LoadingPage() {
  return <main className="v3-loading"><img src={poseSearch} alt="看山正在调取案件" /><strong>正在调取机密档案</strong><span>CASE 001 / VERSION 3.0</span></main>;
}

function HomePage() {
  const { caseData, run, loading, error, createRun } = useV3();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  if (loading) return <LoadingPage />;
  if (!caseData || error) return <div className="v3-fatal"><X /><h1>案件调取失败</h1><p>{error}</p></div>;

  async function begin() {
    setWorking(true);
    const next = await createRun();
    setWorking(false);
    navigate(routeFor(next));
  }

  return <main className="v3-home">
    <header><div className="v3-wordmark large"><span>看山</span><strong>侦探事务所</strong><small>KANSHAN DETECTIVE AGENCY</small></div><div className="home-header-actions"><div className="open-light"><i /> 今夜营业中</div><SoundToggle /></div></header>
    <section className="v3-home-stage">
      <div className="v3-home-copy"><small>全新案件 / 7轮调查</small><h1>有人偷走了<br /><em>45分钟。</em></h1><p>每轮证据都可能改变你的判断。先别急着猜，真正的侦探会把每个结论带回来源。</p><div><span><Clock3 />{caseData.duration}</span><span><Search />知乎真实搜索</span><span><Bot />知乎直答协查</span></div></div>
      <div className="v3-home-focus" />
      <article className="v3-case-card"><div><span>今日案件</span><b>NEW</b><small>{caseData.caseNumber}</small></div><h2>{caseData.title}</h2><p>{caseData.question}</p><dl><div><dt>难度</dt><dd>进阶</dd></div><div><dt>轮次</dt><dd>7轮</dd></div><div><dt>进度</dt><dd>{run ? `${Math.min(100, Math.round((run.currentRound / 7) * 100))}%` : "0%"}</dd></div></dl>{run ? <button className="v3-primary" onClick={() => navigate(routeFor(run))}>继续调查 <ArrowRight /></button> : <button className="v3-primary" disabled={working} onClick={begin}>{working ? "正在建档" : "接受委托"}<ArrowRight /></button>}<button className="v3-text-button" onClick={begin}><RotateCcw /> 新建调查</button></article>
    </section>
    <section className="v3-home-footer"><div><b>案件规则</b><span>初始判断</span><i /><span>7轮取证</span><i /><span>最终指认</span></div><p><ShieldCheck /> 本案用于知识讨论，不构成医学诊断。</p></section>
  </main>;
}

function BriefPage() {
  const { caseData, run, setRun, setToast } = useV3();
  const navigate = useNavigate();
  if (!caseData || !run) return <Navigate to="/" replace />;
  async function confirm() {
    try {
      const next = await v3Api.confirmBrief(run!.runId);
      setRun(next);
      navigate("/initial-vote");
    } catch (err) { setToast(err instanceof Error ? err.message : "无法开始"); }
  }
  return <div className="v3-page"><CaseHeader board={false} /><main className="brief-stage"><article className="brief-dossier"><div className="dossier-tab">CASE 001</div><div className="v3-stamp">机密档案</div><small>CONFIDENTIAL CASE FILE</small><h1>{caseData.question}</h1><div className="case-numbers"><span><Clock3 />在床 8小时</span><span><Clock3 />有效睡眠 7小时15分</span><span><History />缺口 45分钟</span></div><p className="brief-text">{caseData.brief}</p><div className="suspect-grid">{caseData.suspects.map((item) => <SuspectCard suspect={item} key={item.id} compact />)}</div><div className="brief-rule"><ShieldCheck /><p>每轮在知乎内容中取证并重新投票。投票没有即时对错，最终用两张关键证据和一张误导线索完成指认。</p></div><button className="v3-primary dossier-cta" onClick={confirm}>提交初始判断前先阅读规则 <ArrowRight /></button></article><aside className="brief-kanshan"><div>“先凭直觉投一票。<br />真正的侦探，允许自己改主意。”</div><img src={poseRead} alt="看山提醒案件规则" /></aside></main></div>;
}

function InitialVotePage() {
  const { caseData, run, setRun, setToast } = useV3();
  const navigate = useNavigate();
  const [suspectId, setSuspectId] = useState("");
  const [confidence, setConfidence] = useState("中");
  if (!caseData || !run) return <Navigate to="/" replace />;
  async function submit() {
    if (!suspectId) return;
    try {
      const next = await v3Api.initialVote(run!.runId, { voteId: crypto.randomUUID(), suspectId, confidence });
      setRun(next); navigate("/round/R1");
    } catch (err) { setToast(err instanceof Error ? err.message : "投票失败"); }
  }
  return <div className="v3-page"><CaseHeader board={false} backTo="/brief" /><main className="vote-stage initial"><article className="vote-paper"><small>INITIAL JUDGEMENT / R0</small><h1>是谁偷走了45分钟？</h1><p>先凭直觉判断。系统不会告诉你是否正确，后续每轮都可以形成新的判断。</p><div className="suspect-grid selectable">{caseData.suspects.map((item) => <SuspectCard key={item.id} suspect={item} selected={suspectId === item.id} onClick={() => setSuspectId(item.id)} compact />)}</div><div className="confidence-control"><span>信心</span>{["低", "中", "高"].map((item) => <button key={item} className={confidence === item ? "selected" : ""} onClick={() => setConfidence(item)}>{item}</button>)}</div><button className="v3-primary dossier-cta" disabled={!suspectId} onClick={submit}>提交初始判断 <ArrowRight /></button></article><aside className="vote-kanshan"><img src={poseThink} alt="看山等待你的判断" /><p>证据会变化，判断也可以变化。<br />我只记录你的推理轨迹。</p></aside></main></div>;
}

function RoundTimeline({ round }: { round: RoundConfig }) {
  const { caseData } = useV3();
  const [open, setOpen] = useState(false);
  return <aside className={`round-timeline ${open ? "open" : ""}`}><button className="timeline-toggle" onClick={() => setOpen(!open)}><Menu />案件时间线</button><div className="timeline-inner"><h2>案件线索时间轴</h2>{caseData?.timeline.filter((item) => item.round <= round.index).map((item) => <div key={`${item.time}-${item.title}`} className={item.round === round.index ? "current" : ""}><b>{item.time}</b><strong>{item.title}</strong><small>{item.detail}</small></div>)}<section><span>待解决问题</span><p>{round.objective}</p></section><Link to="/board"><Puzzle />查看案件总览</Link></div></aside>;
}

function SourceCard({ source, children, professional = false, hideHeaderLink = false, sectionLabel = "证据摘要" }: { source: SourceSnapshot; children?: ReactNode; professional?: boolean; hideHeaderLink?: boolean; sectionLabel?: string }) {
  return <article className={`source-snapshot ${professional ? "professional-source" : ""}`}><header><div><small>{source.authorType}</small><h3>{source.title}</h3><p>{source.author}</p></div>{!hideHeaderLink && <a href={source.url} target="_blank" rel="noreferrer" title="查看知乎原文">{professional && <span>查看原文</span>}<ExternalLink /></a>}</header>{professional && <div className="source-section-label"><b>{sectionLabel}</b><small>只读 · 不计分</small></div>}<p>{source.body}</p>{source.sample && <div className="study-sample"><BookOpen />研究对象：{source.sample}</div>}{children}{!professional && <footer><ShieldCheck />限制：{source.limitations}</footer>}</article>;
}

interface WorkbenchResult { ready: boolean; payload: Record<string, unknown> }

function SearchWorkbench({ round, onState }: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
  const { run, setRun, setToast } = useV3();
  const initialQuery = round.queries?.[0] || (round.queriesBySuspect ? round.queriesBySuspect[run?.votes.at(-1)?.suspectId || "BLUE"] : "");
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState<SearchResult[]>(run?.roundStates[round.id]?.searchResults || []);
  const [support, setSupport] = useState<SearchResult | null>(null);
  const [weaken, setWeaken] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const isTargeted = round.mode === "targeted_search";

  useEffect(() => {
    const ready = isTargeted ? Boolean(support && weaken && support.sourceId !== weaken.sourceId) : Boolean(support);
    const evidence = isTargeted ? {
      E12: support ? { excerpt: support.summary, relation: "支持", sourceId: support.sourceId, sourceTitle: support.title, sourceUrl: support.url, suspectIds: [run?.votes.at(-1)?.suspectId] } : {},
      E13: weaken ? { excerpt: weaken.summary, relation: "削弱", sourceId: weaken.sourceId, sourceTitle: weaken.title, sourceUrl: weaken.url, suspectIds: [run?.votes.at(-1)?.suspectId] } : {}
    } : {
      E02: support ? { excerpt: support.summary, relation: "补充", sourceId: support.sourceId, sourceTitle: support.title, sourceUrl: support.url, suspectIds: ["BLUE"] } : {}
    };
    onState({ ready, payload: { query, evidence } });
  }, [support, weaken, query, isTargeted]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!run || query.trim().length < 2) return;
    setSearching(true);
    try {
      const data = await v3Api.search(run.runId, round.id, query.trim());
      setResults(data.results);
      setSupport(null); setWeaken(null);
      const refreshed = await v3Api.getRun(run.runId);
      setRun(refreshed);
      if (data.fallbackUsed) setToast("CLI暂不可用，当前显示演示搜索结果");
    } catch (err) { setToast(err instanceof Error ? err.message : "搜索失败"); }
    finally { setSearching(false); }
  }

  function markSupport(result: SearchResult) {
    setSupport(result);
    setWeaken((current) => current?.sourceId === result.sourceId ? null : current);
  }

  function markWeaken(result: SearchResult) {
    setWeaken(result);
    setSupport((current) => current?.sourceId === result.sourceId ? null : current);
  }

  return <section className="search-workbench"><form onSubmit={submit}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={40} placeholder="输入知乎搜索关键词" /><button disabled={searching || query.trim().length < 2}>{searching ? "调查中" : "搜索"}</button></form><div className="query-chips">{(round.queries || Object.values(round.queriesBySuspect || {})).slice(0, 4).map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>{searching && <div className="searching-state"><img src={poseSearch} alt="看山搜索知乎" /><p>正在核对知乎标题、摘要和原文链接...</p></div>}<div className="search-results">{results.map((result) => <article key={result.sourceId} className={support?.sourceId === result.sourceId || weaken?.sourceId === result.sourceId ? "selected" : ""}><small>{result.type} · {result.author}{result.fallback ? " · 演示数据" : ""}</small><h3>{result.title}</h3><p>{result.summary}</p><footer><a href={result.url} target="_blank" rel="noreferrer">查看原文 <ExternalLink /></a>{isTargeted ? <div><button className={support?.sourceId === result.sourceId ? "active" : ""} onClick={() => markSupport(result)}>设为支持</button><button className={weaken?.sourceId === result.sourceId ? "active weaken" : ""} onClick={() => markWeaken(result)}>设为反证</button></div> : <button className={support?.sourceId === result.sourceId ? "active" : ""} onClick={() => setSupport(result)}>{support?.sourceId === result.sourceId ? <><Check />已摘录</> : "摘录为证据"}</button>}</footer></article>)}</div>{!searching && !results.length && <div className="search-empty"><FileSearch /><p>提交关键词后，真实知乎搜索结果会出现在这里。</p></div>}</section>;
}

function SnapshotWorkbench({ round, onState }: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
  const { caseData } = useV3();
  const sources = caseData?.sources.filter((item) => item.roundId === round.id) || [];
  const [boundaryAnswer, setBoundaryAnswer] = useState("");
  const [viewpoint, setViewpoint] = useState("");
  const [variable, setVariable] = useState("");

  useEffect(() => {
    let ready = false;
    let evidence: Record<string, unknown> = {};
    if (round.mode === "professional") {
      ready = boundaryAnswer === "cannot";
      const source = sources[0]; evidence = { E04: { excerpt: source?.body, sourceId: source?.id, sourceTitle: source?.title, sourceUrl: source?.url, limitations: source?.limitations } };
    } else if (round.mode === "comments") {
      ready = boundaryAnswer === "cannot";
      const source = sources[0]; evidence = { E06: { excerpt: "设备记录与评论区经验只能提供时间相关线索，不能直接证明声音导致觉醒。", sourceId: source?.id, sourceTitle: source?.title, sourceUrl: source?.url, limitations: source?.limitations } };
    } else if (round.mode === "research") {
      ready = boundaryAnswer === "strengthens";
      const source = sources[0]; evidence = { E08: { excerpt: source?.body, relation: "支持", sourceId: source?.id, sourceTitle: source?.title, sourceUrl: source?.url, limitations: source?.limitations } };
    } else if (round.mode === "comparison") {
      ready = Boolean(viewpoint && variable);
      const source = sources.find((item) => item.id === viewpoint); evidence = { E11: { excerpt: source?.body, sourceId: source?.id, sourceTitle: source?.title, sourceUrl: source?.url, limitations: source?.limitations } };
    }
    onState({ ready, payload: { boundaryAnswer, viewpoint, variable, evidence } });
  }, [boundaryAnswer, viewpoint, variable]);

  const workbenchClass = round.mode === "professional" ? "professional-workbench" : round.mode === "comments" ? "comments-workbench" : round.mode === "research" ? "research-workbench" : "";
  return <section className={`snapshot-workbench ${workbenchClass}`}>
    {sources.map((source) => <SourceCard key={source.id} source={source} professional={round.mode === "professional" || round.mode === "research"} hideHeaderLink={round.mode === "comments"} sectionLabel={round.mode === "research" ? "研究摘要" : "证据摘要"}>
      {round.mode === "professional" && <><div className="professional-takeaways">{source.excerpts?.map((excerpt) => <span key={excerpt}><CheckCircle2 />{excerpt}</span>)}</div><div className="professional-proof-limit"><b>这篇内容不能证明</b><p>{source.limitations}</p></div></>}
      {round.mode === "comments" && <><div className="device-events">{["00:17", "02:48", "05:12"].map((time) => <span key={time}><b>{time}</b><small><Volume2 />异常声音 · 疑似觉醒</small></span>)}<strong>累计约<br /><b>26 分钟</b></strong></div><div className="comment-reading-heading"><MessageCircle /><b>评论区阅读</b><small>只读 · 不计分</small></div><div className="comment-link-list">{source.commentLinks?.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" data-tone={link.tone}><span>{link.label}</span><p>{link.focus}</p><strong>阅读评论区 <ExternalLink /></strong></a>)}</div></>}
      {round.mode === "research" && <><div className="research-findings">{source.excerpts?.map((excerpt) => <span key={excerpt}><CheckCircle2 />{excerpt}</span>)}</div><div className="research-mechanism"><BookOpen /><p><b>研究机制</b>持续威胁可通过 mSTN-CRH-LGP 神经环路改变 REM 睡眠及觉醒反应。</p></div><div className="research-limit"><ShieldCheck />{source.limitations}</div></>}
      {round.mode === "comparison" && <button className={`viewpoint-select ${viewpoint === source.id ? "selected" : ""}`} onClick={() => setViewpoint(source.id)}>{viewpoint === source.id ? <CheckCircle2 /> : <i />} 这篇观点更能解释两晚差异</button>}
    </SourceCard>)}
    {round.mode === "research" && <section className="case-alignment"><header><div><small>与本案对照</small><h3>研究机制和本案表现是否一致？</h3></div><span>线索方向 · 一致</span></header><div>{sources[0]?.caseAlignment?.map((item, index) => <article key={item.label}><i>{index + 1}</i><b>{item.label}</b><p>{item.value}</p></article>)}</div><footer><CheckCircle2 /><p><b>研究机制与本案表现相呼应</b>{sources[0]?.caseConclusion}</p></footer></section>}
    {round.mode === "professional" && <div className="boundary-question"><header><small>因果边界判断</small><b>仅凭这篇内容，能否认定刘看山当晚的睡眠问题由咖啡导致？</b><p>请选择一个答案。</p></header><div className="boundary-options"><button className={boundaryAnswer === "can" ? "selected incorrect" : ""} onClick={() => setBoundaryAnswer("can")}><span />能直接证明</button><button className={boundaryAnswer === "cannot" ? "selected correct" : ""} onClick={() => setBoundaryAnswer("cannot")}><span />不能直接证明</button></div>{boundaryAnswer && <div className={`boundary-feedback ${boundaryAnswer === "cannot" ? "correct" : "incorrect"}`}>{boundaryAnswer === "cannot" ? <CheckCircle2 /> : <X />}<p><b>{boundaryAnswer === "cannot" ? "判断正确" : "还不能这样下结论"}</b>{boundaryAnswer === "cannot" ? "文章能够支持一般规律，但缺少刘看山当晚的个体数据，不能确认个体因果。" : "文章未提供刘看山当晚的摄入量、摄入时间、代谢特征和客观睡眠监测。"}</p></div>}</div>}
    {round.mode === "comments" && <div className="boundary-question"><header><small>因果边界判断</small><b>仅凭设备记录和这些评论，能否认定声音导致刘看山醒来？</b><p>请选择一个答案。</p></header><div className="boundary-options"><button className={boundaryAnswer === "can" ? "selected incorrect" : ""} onClick={() => setBoundaryAnswer("can")}><span />能直接证明</button><button className={boundaryAnswer === "cannot" ? "selected correct" : ""} onClick={() => setBoundaryAnswer("cannot")}><span />不能直接证明</button></div>{boundaryAnswer && <div className={`boundary-feedback ${boundaryAnswer === "cannot" ? "correct" : "incorrect"}`}>{boundaryAnswer === "cannot" ? <CheckCircle2 /> : <X />}<p><b>{boundaryAnswer === "cannot" ? "判断正确" : "还不能这样下结论"}</b>{boundaryAnswer === "cannot" ? "现有材料只能说明声音与疑似觉醒在时间上接近；缺少明确先后关系，不能确认个体因果。" : "评论经验和设备同一时段记录，都不能排除醒来后发声或其他环境原因。"}</p></div>}</div>}
    {round.mode === "research" && <div className="boundary-question research-judgement"><header><small>证据作用判断</small><b>这篇动物机制研究在本案中意味着什么？</b><p>请选择一个答案。</p></header><div className="boundary-options"><button className={boundaryAnswer === "sole" ? "selected incorrect" : ""} onClick={() => setBoundaryAnswer("sole")}><span />可以单独定案：工作压力是唯一原因</button><button className={boundaryAnswer === "strengthens" ? "selected correct" : ""} onClick={() => setBoundaryAnswer("strengthens")}><span />不能单独定案，但显著增强压力假设</button></div>{boundaryAnswer && <div className={`boundary-feedback ${boundaryAnswer === "strengthens" ? "correct" : "incorrect"}`}>{boundaryAnswer === "strengthens" ? <CheckCircle2 /> : <X />}<p><b>{boundaryAnswer === "strengthens" ? "判断正确" : "可信研究也不能越过个体边界"}</b>{boundaryAnswer === "strengthens" ? "研究揭示持续威胁影响 REM 睡眠与觉醒的神经机制；本案的压力事件、担忧记录、心率升高和睡眠片段化方向一致，因此压力假设被显著增强。" : "这项研究以小鼠为模式动物，不能排除咖啡因、环境声音等其他变量，也不能单独完成个体定因。"}</p></div>}</div>}
    {round.mode === "comparison" && <div className="hypothesis"><label>指出一个仍未控制的变量</label>{["当天情绪", "实际入睡时间", "环境温度"].map((item) => <button key={item} className={variable === item ? "selected" : ""} onClick={() => setVariable(item)}>{item}</button>)}</div>}
  </section>;
}

function AssistantWorkbench({ onState }: { onState: (value: WorkbenchResult) => void }) {
  const { caseData, run, setRun, setToast } = useV3();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const turns = run?.assistantTurns || [];
  useEffect(() => { onState({ ready: turns.length >= 2, payload: { evidence: { E09: { excerpt: "AI协查区分了直接占用时间与睡眠稳定性，并指出仍需对照夜验证。", relation: "补充", limitations: "AI综合不能作为最终唯一关键证据。" } } } }); }, [turns.length]);
  async function send(text = question) {
    if (!run || text.trim().length < 2 || turns.length >= 2) return;
    setSending(true);
    try {
      await v3Api.assistant(run.runId, text.trim());
      setRun(await v3Api.getRun(run.runId)); setQuestion("");
    } catch (err) { setToast(err instanceof Error ? err.message : "协查失败"); }
    finally { setSending(false); }
  }
  const sourceCards = caseData?.sources.filter((item) => ["S_DOCTOR", "S_RESEARCH"].includes(item.id)) || [];
  return <section className="assistant-workbench"><div className="assistant-boundary"><Bot />AI协查不等同于案件事实；最终指认必须由你完成。</div><div className="chat-list"><div className="chat-kanshan"><img src={poseThink} alt="AI看山助手" /><p>现有证据出现了重叠解释。你想先比较四名嫌疑人的作用，还是先找最大的证据缺口？</p></div>{turns.map((turn) => <div key={turn.turnId} className="chat-turn"><div className="chat-user">你：{turn.question}</div><div className="chat-answer"><Sparkles /><p>{turn.answer}</p>{turn.fallbackUsed && <small>模板协查 · 直答服务已降级</small>}</div></div>)}</div>{turns.length < 2 && <><div className="assistant-prompts">{["四名嫌疑人分别影响哪个阶段？", "哪些信息只能说明相关，不能证明因果？", "为什么手机25分钟不能解释全部45分钟？"].map((item) => <button key={item} onClick={() => send(item)}>{item}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={120} placeholder="向看山助手追问证据缺口..." /><button disabled={sending || question.trim().length < 2}>{sending ? "整理证据中" : "发送"}</button></form></>}<div className="assistant-citations"><h3>允许引用的审核来源</h3>{sourceCards.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><BookOpen /><span><b>{source.title}</b><small>{source.authorType}</small></span><ExternalLink /></a>)}</div></section>;
}

function RoundFocus({ round }: { round: RoundConfig }) {
  return <section className="round-focus" aria-label="本轮关键判断">{round.focusFacts.map((fact) => <div key={fact.label} data-tone={fact.tone}><small>{fact.label}</small><b>{fact.value}</b></div>)}</section>;
}

function RoundPage() {
  const { roundId = "R1" } = useParams();
  const { caseData, run, setRun, setToast } = useV3();
  const navigate = useNavigate();
  const [workbench, setWorkbench] = useState<WorkbenchResult>({ ready: false, payload: {} });
  const [submitting, setSubmitting] = useState(false);
  if (!caseData || !run) return <Navigate to="/" replace />;
  const round = caseData.rounds.find((item) => item.id === roundId);
  if (!round) return <Navigate to={routeFor(run)} replace />;
  if (run.currentRound !== round.index && run.status !== "CLOSED") return <Navigate to={routeFor(run)} replace />;
  const isBoundaryRound = ["professional", "comments", "research"].includes(round.mode);
  const sideHint = round.mode === "professional"
    ? "读懂来源，也要看清它不能证明什么。"
    : round.mode === "comments"
      ? "评论提供经验与线索，不替代因果证据。"
      : round.mode === "research"
        ? "高可信研究增强假设，但不能替个体定案。"
        : "打开来源，标记一条真正能解释时间的证词。";

  async function complete() {
    if (!workbench.ready) return;
    setSubmitting(true);
    try {
      const next = await v3Api.completeRound(run!.runId, round!.id, workbench.payload);
      setRun(next); navigate(`/vote/${round!.id}`);
    } catch (err) { setToast(err instanceof Error ? err.message : "本轮尚未完成"); }
    finally { setSubmitting(false); }
  }

  return <div className="v3-page round-page"><CaseHeader round={round} /><main className="round-layout"><RoundTimeline round={round} /><section className="investigation-paper"><header><div><small>ROUND {round.index} / INVESTIGATION</small><h1>{round.title}</h1><p>{round.clue}</p></div><span>{round.shortTitle}</span></header><RoundFocus round={round} /><div className="round-objective"><CheckCircle2 /><div><b>本轮任务</b><p>{round.objective}</p></div></div>{round.mode === "search" || round.mode === "targeted_search" ? <SearchWorkbench round={round} onState={setWorkbench} /> : round.mode === "assistant" ? <AssistantWorkbench onState={setWorkbench} /> : <SnapshotWorkbench round={round} onState={setWorkbench} />}<footer className="round-submit"><p>{workbench.ready ? <><CheckCircle2 />取证条件已满足，可以进入本轮投票。</> : <><ShieldCheck />{isBoundaryRound ? "完成本轮因果边界判断后才能投票。" : "完成页面中的标记和边界确认后才能投票。"}</>}</p><button className="v3-primary" disabled={!workbench.ready || submitting} onClick={complete}>{submitting ? "正在归档" : "收录证据并投票"}<ArrowRight /></button></footer></section><aside className="round-side"><div className="evidence-notes"><h2>线索摘录</h2><span>本轮将获得</span>{round.evidenceRewards.map((id) => <div key={id}><FolderOpen /><b>{id}</b><small>{caseData.evidenceBlueprints.find((item) => item.id === id)?.title as string}</small></div>)}</div><img src={round.mode === "assistant" ? poseThink : poseRead} alt="看山陪同调查" /><p>“{sideHint}”</p></aside></main></div>;
}

function VotePage() {
  const { roundId = "R1" } = useParams();
  const { caseData, run, setRun, setToast } = useV3();
  const navigate = useNavigate();
  const [suspectId, setSuspectId] = useState(run?.votes.at(-1)?.suspectId || "");
  const [evidenceId, setEvidenceId] = useState("");
  const [role, setRole] = useState("主要原因");
  const [confidence, setConfidence] = useState("中");
  if (!caseData || !run) return <Navigate to="/" replace />;
  const round = caseData.rounds.find((item) => item.id === roundId)!;
  async function submit() {
    try {
      const next = await v3Api.vote(run!.runId, roundId, { voteId: crypto.randomUUID(), suspectId, role, confidence, reasonEvidenceId: evidenceId });
      setRun(next); navigate(`/recap/${roundId}`);
    } catch (err) { setToast(err instanceof Error ? err.message : "投票失败"); }
  }
  return <div className="v3-page"><CaseHeader round={round} backTo={`/round/${roundId}`} /><main className="vote-stage"><article className="vote-paper"><small>ROUND VOTE / 本轮投票</small><h1>新证据出现后，你现在最怀疑谁？</h1><div className="suspect-grid selectable">{caseData.suspects.map((item) => <SuspectCard key={item.id} suspect={item} selected={suspectId === item.id} onClick={() => setSuspectId(item.id)} compact />)}</div><h2>选择一条证据作为理由</h2><div className="vote-evidence">{run.evidenceRecords.map((item) => <button key={item.id} className={evidenceId === item.id ? "selected" : ""} onClick={() => setEvidenceId(item.id)}><span>{item.id}</span><b>{item.title}</b><small>{item.relation} · {item.reliability}</small><CheckCircle2 /></button>)}</div><div className="vote-options"><label>角色<select value={role} onChange={(event) => setRole(event.target.value)}><option>单独作案</option><option>主要原因</option><option>共同作用</option><option>表面线索</option></select></label><label>信心<div>{["低", "中", "高"].map((item) => <button key={item} className={confidence === item ? "selected" : ""} onClick={() => setConfidence(item)}>{item}</button>)}</div></label></div><button className="v3-primary dossier-cta" disabled={!suspectId || !evidenceId} onClick={submit}>提交本轮判断 <ArrowRight /></button></article><aside className="vote-kanshan recap-hint"><img src={poseThink} alt="看山复核证据" /><p>投票提交后不可修改本轮，<br />下一轮仍然可以改变判断。</p></aside></main></div>;
}

function RecapPage() {
  const { roundId = "R1" } = useParams();
  const { caseData, run, setRun, setToast } = useV3();
  const navigate = useNavigate();
  const [recap, setRecap] = useState(run?.recaps[roundId] || null);
  const requested = useRef(false);
  useEffect(() => {
    if (!run || recap || requested.current) return;
    requested.current = true;
    void v3Api.recap(run.runId, roundId).then(setRecap).catch((err) => setToast(err instanceof Error ? err.message : "前情提示生成失败"));
  }, [run, recap, roundId]);
  if (!caseData || !run) return <Navigate to="/" replace />;
  const round = caseData.rounds.find((item) => item.id === roundId)!;
  async function next() {
    const updated = await v3Api.continueRound(run!.runId, roundId);
    setRun(updated); navigate(routeFor(updated));
  }
  return <div className="v3-page"><CaseHeader round={round} /><main className="recap-stage"><section className="recap-card"><div className="recap-label"><Sparkles />看山前情提示</div>{recap ? <><blockquote>{recap.text}</blockquote>{recap.fallbackUsed && <small>模板提示 · 直答服务本轮已降级</small>}<button className="v3-primary" onClick={next}>{recap.cta}<ArrowRight /></button></> : <div className="recap-loading"><span /><span /><span /><p>看山正在整理本轮证据...</p></div>}</section><img src={poseThink} alt="看山生成前情提示" /></main></div>;
}

function BoardPage() {
  const { caseData, run } = useV3();
  const navigate = useNavigate();
  const [tab, setTab] = useState("suspects");
  if (!caseData || !run) return <Navigate to="/" replace />;
  const unlockedRound = run.currentRound;
  return <div className="v3-page board-page"><CaseHeader backTo={run.status === "FINAL_READY" ? `/recap/R7` : routeFor(run)} /><div className="board-mobile-tabs"><button className={tab === "timeline" ? "selected" : ""} onClick={() => setTab("timeline")}>时间线</button><button className={tab === "suspects" ? "selected" : ""} onClick={() => setTab("suspects")}>嫌疑人</button><button className={tab === "votes" ? "selected" : ""} onClick={() => setTab("votes")}>投票轨迹</button></div><main className="case-board"><section className={`board-timeline ${tab === "timeline" ? "mobile-active" : ""}`}><h2>时间线</h2>{caseData.timeline.filter((item) => item.round <= unlockedRound).map((item) => <div key={`${item.time}-${item.title}`}><b>{item.time}</b><span>{item.title}</span><small>{item.detail}</small></div>)}</section><section className={`suspect-board ${tab === "suspects" ? "mobile-active" : ""}`}><header><span>嫌疑人关系图</span><b>证据关联图</b></header><div>{caseData.suspects.map((suspect) => <article key={suspect.id} style={{ "--suspect-color": suspect.color } as React.CSSProperties}><div className="board-suspect"><SuspectIcon suspect={suspect} /><b>{suspect.name}</b></div>{run.evidenceRecords.filter((evidence) => evidence.suspectIds.includes(suspect.id)).map((evidence) => <div className="board-evidence" key={`${suspect.id}-${evidence.id}`}><span>{evidence.id}</span><strong>{evidence.title}</strong><small className={`relation ${evidence.relation}`}>{evidence.relation}</small></div>)}{!run.evidenceRecords.some((evidence) => evidence.suspectIds.includes(suspect.id)) && <p>尚无关联证据</p>}</article>)}</div></section><section className={`vote-trail ${tab === "votes" ? "mobile-active" : ""}`}><h2>投票轨迹 R0-R7</h2><div>{run.votes.map((vote, index) => { const suspect = caseData.suspects.find((item) => item.id === vote.suspectId)!; return <article key={vote.voteId}><b>{vote.roundId}</b><span style={{ background: suspect.color }} /><strong>{suspect.name}</strong><small>{index ? vote.role : "初始判断"}</small>{index < run.votes.length - 1 && <ArrowRight />}</article>; })}</div></section><aside className="board-action"><img src={poseClose} alt="看山查看案件板" /><div><h2>{run.status === "FINAL_READY" ? "七轮调查已完成" : `第 ${run.currentRound} / 7 轮`}</h2><p>{run.status === "FINAL_READY" ? "选择主犯、帮凶、两张关键证据和一张误导线索。" : "案件板会持续记录新证据和你的判断变化。"}</p>{run.status === "FINAL_READY" ? <button className="v3-primary" onClick={() => navigate("/final")}>开始最终指认 <ArrowRight /></button> : <button className="v3-primary" onClick={() => navigate(routeFor(run))}>返回当前调查 <ArrowRight /></button>}</div></aside></main></div>;
}

function FinalPage() {
  const { caseData, run, setRun, setToast } = useV3();
  const navigate = useNavigate();
  const [culpritId, setCulpritId] = useState("");
  const [accompliceId, setAccompliceId] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [redHerringId, setRedHerringId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (!caseData || !run) return <Navigate to="/" replace />;
  function toggleEvidence(id: string) { setEvidenceIds((items) => items.includes(id) ? items.filter((item) => item !== id) : items.length < 2 ? [...items, id] : [items[1], id]); }
  async function submit() {
    setSubmitting(true);
    try {
      const next = await v3Api.finalDecision(run!.runId, { culpritId, accompliceId: accompliceId || null, evidenceIds, redHerringId, reason });
      setRun(next); navigate("/report");
    } catch (err) { setToast(err instanceof Error ? err.message : "指认未通过校验"); }
    finally { setSubmitting(false); }
  }
  const valid = culpritId && evidenceIds.length === 2 && redHerringId && reason.trim().length >= 20;
  return <div className="v3-page final-page"><CaseHeader backTo="/board" /><main><section className="final-board"><small>FINAL ACCUSATION / 最终指认</small><h1>别选最响的线索，选最能解释全部案情的证据。</h1><div className="final-suspects"><div><h2>主犯 <em>必选</em></h2><div>{caseData.suspects.map((item) => <button key={item.id} className={culpritId === item.id ? "selected" : ""} onClick={() => { setCulpritId(item.id); if (accompliceId === item.id) setAccompliceId(""); }}><span style={{ background: item.color }} /><b>{item.name}</b><Check /></button>)}</div></div><div><h2>帮凶 <em>可选</em></h2><div>{caseData.suspects.filter((item) => item.id !== culpritId).map((item) => <button key={item.id} className={accompliceId === item.id ? "selected" : ""} onClick={() => setAccompliceId(accompliceId === item.id ? "" : item.id)}><span style={{ background: item.color }} /><b>{item.name}</b><Check /></button>)}</div></div></div><h2>关键证据 <em>选择2条</em></h2><div className="final-evidence">{run.evidenceRecords.filter((item) => item.eligibleForFinal).map((item) => <button key={item.id} className={evidenceIds.includes(item.id) ? "selected" : ""} onClick={() => toggleEvidence(item.id)}><span>{item.id}</span><b>{item.title}</b><small>{item.sourceType} · {item.reliability}</small><CheckCircle2 /></button>)}</div><label className="final-red"><span>误导线索</span><select value={redHerringId} onChange={(event) => setRedHerringId(event.target.value)}><option value="">选择一条被削弱或不充分的线索</option>{run.evidenceRecords.map((item) => <option key={item.id} value={item.id}>{item.id} {item.title}</option>)}</select></label><label className="final-reason"><span>指认理由 <small>{reason.length}/180</small></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={180} placeholder="说明主因如何解释45分钟，以及误导线索为什么不充分（20-180字）" /></label></section><aside className="final-submit-card"><div className="v3-stamp">最终指认</div><img src={poseClose} alt="看山等待最终指认" /><p>提交后将揭晓官方重建，但不会因为你的答案不同而阻断结案。</p><button className="v3-primary" disabled={!valid || submitting} onClick={submit}>{submitting ? "正在封存档案" : "提交最终指认"}<ArrowRight /></button></aside></main></div>;
}

function ReportPage() {
  const { caseData, run, setToast, createRun } = useV3();
  const navigate = useNavigate();
  if (!caseData || !run?.report) return <Navigate to="/" replace />;
  const report = run.report;
  async function copy() { await navigator.clipboard.writeText(report.shareDraft); setToast("分享草稿已复制"); }
  async function restart() { const next = await createRun(); navigate(routeFor(next)); }
  return <div className="v3-page report-page"><CaseHeader backTo="/" /><main><article className="report-paper"><div className="v3-stamp">案件已结</div><header><div><small>{caseData.caseNumber} / FINAL REPORT</small><h1>{caseData.title}</h1><p>你的最终指认：{report.culprit.name}{report.accomplice.name !== "无" ? ` ＋ ${report.accomplice.name}` : ""}</p></div><strong>{report.grade}</strong></header><section className="report-rebuild"><small>官方案件重建</small><h2>{report.official.culprit} · 主因候选</h2><p>{report.truthReconstruction}</p><div><span>帮凶：{report.official.accomplice}</span><span>触发：{report.official.trigger}</span><span>显眼但不充分：{report.official.redHerring}</span></div></section><section className="report-path"><h2>你的判断轨迹</h2><div>{report.votePath.map((vote) => { const suspect = caseData.suspects.find((item) => item.id === vote.suspectId)!; return <div key={vote.voteId}><b>{vote.roundId}</b><span style={{ background: suspect.color }} /><strong>{suspect.name}</strong></div>; })}</div><p>七轮中共改变判断 {report.voteChanges} 次。</p></section><section className="report-evidence"><h2>关键证据</h2>{report.evidence.map((item) => <article key={item.id}><b>{item.id}</b><div><strong>{item.title}</strong><p>{item.excerpt}</p><small>{item.reliability} · {item.relation}</small></div></article>)}</section>{report.fallbackUsed && <div className="report-fallback"><Bot />本次调查部分搜索或直答使用了演示降级内容。</div>}<blockquote>“{report.comment}”</blockquote><footer><button className="v3-primary" onClick={copy}><Clipboard />复制分享草稿</button><button className="v3-secondary" onClick={() => navigate("/")}>返回事务所</button><button className="v3-text-button" onClick={restart}><RotateCcw />重新调查</button></footer></article><aside><img src={poseClose} alt="看山完成结案" /><p>所有正式结论都应回到来源，也要带着它的限制。</p></aside></main></div>;
}

function V3Routes() {
  const { loading, error } = useV3();
  if (loading) return <LoadingPage />;
  if (error) return <div className="v3-fatal"><X /><h1>案件调取失败</h1><p>{error}</p></div>;
  return <><Routes><Route path="/" element={<HomePage />} /><Route path="/brief" element={<BriefPage />} /><Route path="/initial-vote" element={<InitialVotePage />} /><Route path="/round/:roundId" element={<RoundPage />} /><Route path="/vote/:roundId" element={<VotePage />} /><Route path="/recap/:roundId" element={<RecapPage />} /><Route path="/board" element={<BoardPage />} /><Route path="/final" element={<FinalPage />} /><Route path="/report" element={<ReportPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes><Toast /></>;
}

export function V3App() {
  return <AudioProvider><V3Provider><V3Routes /></V3Provider></AudioProvider>;
}
