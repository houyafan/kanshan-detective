import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
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
  Lightbulb,
  LockKeyhole,
  Menu,
  MessageCircle,
  Music2,
  Play,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  ShieldCheck,
  SkipForward,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { v3Api } from "./api";
import type { AssistantPrompt, AwardEvent, EvidenceRecord, RoundConfig, SearchResult, SourceSnapshot, Suspect, V3Case, V3Run } from "./types";
import "./styles.css";

const poseSearch = "/assets/kanshan/kanshan-pose-search.png";
const poseThink = "/assets/kanshan/kanshan-pose-think.png";
const poseRead = "/assets/kanshan/kanshan-pose-read.png";
const poseClose = "/assets/kanshan/kanshan-pose-close.png";
const themeMusic = "/assets/audio/kanshan-detective-theme.mp3";
const briefNarration = "/assets/audio/kanshan-dm-case-brief.mp3";

interface AudioContextValue {
  enabled: boolean;
  playing: boolean;
  narrating: boolean;
  toggle: () => void;
  enable: () => Promise<void>;
  suspendBackground: () => () => void;
  beginNarration: () => () => void;
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
  const [narrating, setNarrating] = useState(false);
  const [promptOpen, setPromptOpen] = useState(() => readPreference("kanshan_audio_prompt_seen") !== "true");
  const enabledRef = useRef(enabled);
  const promptOpenRef = useRef(promptOpen);
  const narrationCountRef = useRef(0);

  const playBackground = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !enabledRef.current || promptOpenRef.current || narrationCountRef.current > 0) return;
    audio.volume = 0.24;
    try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
  }, []);

  const start = useCallback(async () => {
    enabledRef.current = true;
    setEnabled(true);
    savePreference("kanshan_audio_enabled", "on");
    await playBackground();
  }, [playBackground]);

  const stop = useCallback(() => {
    enabledRef.current = false;
    setEnabled(false);
    savePreference("kanshan_audio_enabled", "off");
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (!enabledRef.current) { void start(); return; }
    if (narrationCountRef.current > 0 || !audioRef.current?.paused) stop();
    else void start();
  }, [start, stop]);

  const suspendBackground = useCallback(() => {
    narrationCountRef.current += 1;
    setNarrating(true);
    audioRef.current?.pause();
    setPlaying(false);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      narrationCountRef.current = Math.max(0, narrationCountRef.current - 1);
      if (narrationCountRef.current === 0) {
        setNarrating(false);
        void playBackground();
      }
    };
  }, [playBackground]);

  const beginNarration = suspendBackground;

  function finishPrompt(withSound: boolean) {
    savePreference("kanshan_audio_prompt_seen", "true");
    promptOpenRef.current = false;
    setPromptOpen(false);
    if (withSound) void start();
    else stop();
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.24;
    enabledRef.current = enabled;
    promptOpenRef.current = promptOpen;
    if (!enabled) { audio.pause(); return; }
    if (promptOpen) return;
    const unlock = () => { void playBackground(); };
    void playBackground();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [enabled, promptOpen, playBackground]);

  const value = useMemo(() => ({ enabled, playing, narrating, toggle, enable: start, suspendBackground, beginNarration }), [enabled, playing, narrating, toggle, start, suspendBackground, beginNarration]);
  return <AudioContext.Provider value={value}>
    <audio ref={audioRef} src={themeMusic} loop preload="auto" onPlay={() => { if (narrationCountRef.current > 0) audioRef.current?.pause(); else setPlaying(true); }} onPause={() => setPlaying(false)} />
    {children}
    {promptOpen && <div className="sound-prompt-backdrop"><section className="sound-prompt" role="dialog" aria-modal="true" aria-labelledby="sound-prompt-title"><div><Music2 /></div><small>沉浸调查模式</small><h2 id="sound-prompt-title">开启声音，体验更佳</h2><p>建议打开背景音乐，进入看山侦探事务所的调查氛围。</p><button className="v3-primary" onClick={() => finishPrompt(true)}><Volume2 />开启声音</button><button className="v3-text-button" onClick={() => finishPrompt(false)}>暂不开启</button></section></div>}
  </AudioContext.Provider>;
}

function SoundToggle() {
  const { enabled, playing, narrating, toggle } = useAudio();
  const status = enabled ? (narrating ? "看山配音中" : playing ? "播放中" : "待播放") : "已关闭";
  const title = !enabled ? "开启声音" : narrating || playing ? "关闭声音" : "播放背景音乐";
  return <button className={`sound-toggle ${enabled ? "enabled" : ""} ${enabled && !playing && !narrating ? "waiting" : ""}`} onClick={toggle} aria-pressed={enabled} title={title}>{enabled ? <Volume2 /> : <VolumeX />}<span>声音</span><i>{status}</i></button>;
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

function AwardTicker() {
  const [events, setEvents] = useState<AwardEvent[]>([]);

  useEffect(() => {
    const stream = new EventSource("/api/v3/awards/stream");
    stream.addEventListener("award", (message) => {
      try {
        const event = JSON.parse(message.data) as AwardEvent;
        const seenKey = `kanshan_award_seen_${event.eventId}`;
        if (sessionStorage.getItem(seenKey)) return;
        sessionStorage.setItem(seenKey, "true");
        setEvents((items) => [...items, event].slice(-3));
      } catch {
        /* Ignore malformed stream frames. */
      }
    });
    return () => stream.close();
  }, []);

  useEffect(() => {
    if (!events.length) return;
    const timer = window.setTimeout(() => setEvents((items) => items.slice(1)), 4800);
    return () => window.clearTimeout(timer);
  }, [events]);

  const event = events[0];
  return event ? <div className="award-ticker" role="status" aria-live="polite"><Sparkles /><div><small>全事务所捷报</small><strong>{event.message}</strong></div><b>{event.grade}</b></div> : null;
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

const archivedCases = [
  { number: "CASE 002", title: "消失的行动力" },
  { number: "CASE 003", title: "凌晨三点的食欲" },
  { number: "CASE 004", title: "记忆失窃案" }
];

function HomePage() {
  const { caseData, run, loading, error, createRun } = useV3();
  const { suspendBackground } = useAudio();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const releaseAudioRef = useRef<(() => void) | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const [working, setWorking] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [homeVideoState, setHomeVideoState] = useState<"background" | "playing" | "restoring">("background");

  function releaseVideoAudio() {
    releaseAudioRef.current?.();
    releaseAudioRef.current = null;
  }

  function finishVideoPlayback() {
    if (homeVideoState === "background" || restoreTimerRef.current !== null) return;
    setHomeVideoState("restoring");
    restoreTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.currentTime = 0;
        video.loop = true;
        video.muted = true;
        void video.play().catch(() => undefined);
      }
      releaseVideoAudio();
      restoreTimerRef.current = null;
      setHomeVideoState("background");
    }, 820);
  }

  function playIntro() {
    const video = videoRef.current;
    if (!video || videoFailed || !videoReady || homeVideoState !== "background") return;
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    releaseAudioRef.current = suspendBackground();
    video.loop = false;
    video.muted = false;
    video.currentTime = 0;
    setHomeVideoState("playing");
    void video.play().catch(() => {
      releaseVideoAudio();
      video.loop = true;
      video.muted = true;
      setHomeVideoState("background");
    });
  }

  function handleVideoFailure() {
    const video = videoRef.current;
    video?.pause();
    releaseVideoAudio();
    setVideoFailed(true);
    setVideoReady(false);
    setHomeVideoState("background");
  }

  useEffect(() => {
    if (homeVideoState === "background") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") finishVideoPlayback();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [homeVideoState]);

  useEffect(() => () => {
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    releaseVideoAudio();
  }, []);

  if (loading) return <LoadingPage />;
  if (!caseData || error) return <div className="v3-fatal"><X /><h1>案件调取失败</h1><p>{error}</p></div>;

  async function begin() {
    setWorking(true);
    const next = await createRun();
    setWorking(false);
    navigate(routeFor(next));
  }

  const closed = run?.status === "CLOSED";
  return <main className={`v3-home ${homeVideoState === "playing" ? "is-intro-playing" : homeVideoState === "restoring" ? "is-intro-restoring" : ""}`}>
    <header><div className="v3-wordmark large"><span>看山</span><strong>侦探事务所</strong><small>KANSHAN DETECTIVE AGENCY</small></div><div className="home-header-actions"><div className="open-light"><i /> 今夜营业中</div><SoundToggle /></div></header>
    <section className={`v3-home-stage ${videoFailed ? "is-video-fallback" : ""}`}>
      <video ref={videoRef} className={`home-video-bg ${videoFailed ? "is-unavailable" : ""} ${homeVideoState !== "background" ? "is-immersive" : ""}`} src="/assets/kanshan/kanshan-intro.mp4" autoPlay muted loop playsInline preload="metadata" onCanPlay={() => setVideoReady(true)} onError={handleVideoFailure} onEnded={finishVideoPlayback} aria-hidden="true" />
      {homeVideoState !== "background" && <div className="home-video-overlay"><span>看山短剧 · CASE 001</span><button type="button" onClick={finishVideoPlayback} aria-label="关闭介绍片" title="关闭介绍片"><X /></button></div>}
      <div className="v3-home-copy"><small>全新案件 / 7轮调查</small><h1>有人偷走了<br /><em>45分钟。</em></h1><p>每轮证据都可能改变你的判断。先别急着猜，真正的侦探会把每个结论带回来源。</p><div><span><Clock3 />{caseData.duration}</span><span><Search />知乎真实搜索</span><span><Bot />知乎直答协查</span></div>{!videoFailed && <button className="home-intro-play" type="button" onClick={playIntro} disabled={!videoReady} aria-label="播放看山介绍片"><Play />{videoReady ? "播放介绍片" : "介绍片加载中"}</button>}<Link className="v3-custom-commission-entry" to="/commission"><Plus /><span><strong>自行发起委托</strong><small>输入问题，生成你的调查线索</small></span><i>NEW</i><ArrowRight /></Link></div>
      <div className="v3-home-focus" />
      <article className="v3-case-card"><div><span>今日案件</span><b>NEW</b><small>{caseData.caseNumber}</small></div><h2>{caseData.title}</h2><p>{caseData.question}</p><dl><div><dt>难度</dt><dd>进阶</dd></div><div><dt>轮次</dt><dd>7轮</dd></div><div><dt>进度</dt><dd>{closed ? "100%" : run ? `${Math.min(100, Math.round((run.currentRound / 7) * 100))}%` : "0%"}</dd></div></dl>{run ? <button className="v3-primary" onClick={() => navigate(routeFor(run))}>{closed ? "查看结案报告" : "继续调查"} <ArrowRight /></button> : <button className="v3-primary" disabled={working} onClick={begin}>{working ? "正在建档" : "接受委托"}<ArrowRight /></button>}<button className="v3-text-button" onClick={begin}><RotateCcw /> 新建调查</button></article>
    </section>
    <section className="v3-case-archive"><header><b>案件档案</b><small>ARCHIVE / 2026</small></header>{archivedCases.map((item) => <article key={item.number}><div><span>{item.number}</span><LockKeyhole /></div><strong>{item.title}</strong><small>尚未解锁</small></article>)}<aside><b>调查方法</b><strong>搜索 → 阅读 → 比较 → 推理</strong><small>所有正式结论必须回到来源</small><p><ShieldCheck />本案用于知识讨论，不构成医学诊断。</p></aside></section>
  </main>;
}

function CommissionPage() {
  const { setToast } = useV3();
  const [question, setQuestion] = useState("");
  const [categories, setCategories] = useState(["生活之谜"]);
  const [difficulty, setDifficulty] = useState("入门");
  const [duration, setDuration] = useState("5-8 分钟");
  const [options, setOptions] = useState(["案件背景", "嫌疑人设定", "调查路径", "证据与干扰项", "结论与解析"]);
  const [questionDraft, setQuestionDraft] = useState(true);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [source, setSource] = useState("");

  function toggleItem(value: string, setter: Dispatch<SetStateAction<string[]>>) {
    setter((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  }

  function reset() {
    setQuestion("");
    setCategories(["生活之谜"]);
    setDifficulty("入门");
    setDuration("5-8 分钟");
    setOptions(["案件背景", "嫌疑人设定", "调查路径", "证据与干扰项", "结论与解析"]);
    setQuestionDraft(true);
    setResults([]);
    setSource("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = question.trim().replace(/\s+/g, " ");
    if (normalized.length < 2) return;
    setSearching(true);
    setResults([]);
    try {
      const data = await v3Api.commissionSearch(normalized);
      setResults(data.results.slice(0, 4));
      setSource(data.source === "zhihu-cli" ? "知乎 CLI 实时线索" : "演示线索");
      if (data.fallbackUsed) setToast("CLI 暂不可用，当前使用演示线索建立委托");
      else if (!data.results.length) setToast("暂时没有找到相关线索，换一种问法试试");
      else setToast("委托线索已建立");
    } catch (err) { setToast(err instanceof Error ? err.message : "委托生成失败"); }
    finally { setSearching(false); }
  }

  async function copyQuestion() {
    try { await navigator.clipboard.writeText(question.trim()); setToast("问题草稿已复制"); }
    catch { setToast("复制失败，请手动复制问题"); }
  }

  return <div className="v3-commission-page"><header><Link to="/" aria-label="返回事务所"><ArrowLeft /></Link><div><small>新功能</small><strong>自行发起委托</strong><span>创建案件</span></div><SoundToggle /></header><main><section className="v3-commission-paper"><div className="commission-heading"><div><small>CREATE YOUR CASE</small><h1>自行发起委托</h1><p>输入一个值得调查的问题，看山会先从知乎寻找相关来源。</p></div><span>创建新案件</span></div><form onSubmit={submit}><label className="commission-question"><b>输入你想调查的问题或关键词</b><textarea autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={50} placeholder="例：为什么熬夜后第二天很难集中注意力？" /><small>{question.length}/50</small></label><fieldset><legend>选择案件类型 <small>可多选</small></legend><div className="commission-choice-grid categories">{["生活之谜", "社会现象", "科学探索", "历史人文", "其他"].map((item) => <button type="button" key={item} className={categories.includes(item) ? "selected" : ""} onClick={() => toggleItem(item, setCategories)}>{categories.includes(item) && <CheckCircle2 />}{item}</button>)}</div></fieldset><div className="commission-options-row"><fieldset><legend>案件难度</legend><div className="commission-choice-grid difficulty">{[["入门", "★☆☆☆☆"], ["进阶", "★★☆☆☆"], ["专家", "★★★☆☆"]].map(([label, stars]) => <button type="button" key={label} className={difficulty === label ? "selected" : ""} onClick={() => setDifficulty(label)}><b>{label}</b><small>{stars}</small></button>)}</div></fieldset><fieldset><legend>预计用时</legend><div className="commission-choice-grid duration">{["5-8 分钟", "8-15 分钟", "15 分钟以上"].map((item) => <button type="button" key={item} className={duration === item ? "selected" : ""} onClick={() => setDuration(item)}><Clock3 />{item}</button>)}</div></fieldset></div><fieldset><legend>生成内容 <small>可按需调整</small></legend><div className="commission-checks">{["案件背景", "嫌疑人设定", "调查路径", "证据与干扰项", "结论与解析"].map((item) => <label key={item} className={options.includes(item) ? "checked" : ""}><input type="checkbox" checked={options.includes(item)} onChange={() => toggleItem(item, setOptions)} /><span><Check /></span>{item}</label>)}</div></fieldset><label className={`commission-draft-toggle ${questionDraft ? "checked" : ""}`}><Lightbulb /><input type="checkbox" checked={questionDraft} onChange={(event) => setQuestionDraft(event.target.checked)} /><span><b>生成知乎提问草稿</b><small>仅提供复制与知乎提问页跳转，不会自动发布。</small></span><i><em /></i></label><div className="commission-actions"><button type="button" className="v3-secondary" onClick={reset}>清空重置</button><button className="v3-primary" disabled={searching || question.trim().length < 2}>{searching ? "正在建立委托" : "生成我的委托"}<ArrowRight /></button></div></form>{searching && <div className="commission-searching"><img src={poseSearch} alt="看山正在搜索知乎" /><div><b>看山正在核对知乎线索</b><span>搜索标题、摘要与原文链接...</span></div></div>}{results.length > 0 && <section className="commission-results"><header><div><b>委托线索已建立</b><span>{source} · {difficulty} · {duration}</span></div>{questionDraft && <div><button onClick={() => void copyQuestion()}><Clipboard />复制问题</button><a href="https://www.zhihu.com/question/ask" target="_blank" rel="noreferrer">前往知乎提问 <ExternalLink /></a></div>}</header>{results.map((result, index) => <article key={result.sourceId}><b>{String(index + 1).padStart(2, "0")}</b><div><small>{result.type} · {result.author}</small><h3>{result.title}</h3><p>{result.summary}</p></div><a href={result.url} target="_blank" rel="noreferrer" title="查看知乎原文"><ExternalLink /></a></article>)}</section>}</section><aside className="commission-kanshan"><div><img src={poseRead} alt="看山阅读委托资料" /></div><span>每一个好问题，都是一宗好案件。</span><img src={poseThink} alt="看山准备建立案件" /><blockquote>“输入你想知道的问题，<br />我来帮你把它变成一宗值得调查的委托。”</blockquote><small><ShieldCheck />AI 负责整理线索，事实仍回到知乎来源。</small></aside></main></div>;
}

type BriefNarrationStatus = "idle" | "playing" | "ended" | "blocked" | "muted" | "error";

const briefNarrationLines = ["先凭直觉投一票。", "真正的侦探，允许自己改主意。"];

function typedNarrationLine(text: string, start: number, end: number, currentTime: number) {
  if (currentTime <= start) return "";
  if (currentTime >= end) return text;
  return text.slice(0, Math.ceil(((currentTime - start) / (end - start)) * text.length));
}

function cleanRecapText(text: string) {
  return text.replace(/^\s*(?:\*\*)?根据你的要求[，,]\s*以下三句简短中文[:：](?:\*\*)?\s*/, "").trim();
}

function BriefNarration({ runId }: { runId: string }) {
  const { enabled, enable, beginNarration } = useAudio();
  const audioRef = useRef<HTMLAudioElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<BriefNarrationStatus>("idle");
  const [visibleLines, setVisibleLines] = useState(["", ""]);
  const storageKey = `kanshan_dm_brief_${runId}`;

  function hasPlayed() {
    try { return sessionStorage.getItem(storageKey) === "played"; } catch { return false; }
  }

  function rememberPlayed() {
    try { sessionStorage.setItem(storageKey, "played"); } catch { /* Session persistence is optional. */ }
  }

  function showFullTranscript() {
    if (mountedRef.current) setVisibleLines(briefNarrationLines);
  }

  function stopFrame() {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }

  function releaseBackground() {
    releaseRef.current?.();
    releaseRef.current = null;
  }

  function finishNarration(nextStatus: BriefNarrationStatus) {
    stopFrame();
    startingRef.current = false;
    releaseBackground();
    showFullTranscript();
    if (mountedRef.current) setStatus(nextStatus);
  }

  function animateTranscript() {
    const audio = audioRef.current;
    if (!audio || audio.paused || audio.ended) return;
    const currentTime = audio.currentTime;
    setVisibleLines([
      typedNarrationLine(briefNarrationLines[0], 0.15, 2.55, currentTime),
      typedNarrationLine(briefNarrationLines[1], 2.8, 6.75, currentTime)
    ]);
    frameRef.current = window.requestAnimationFrame(animateTranscript);
  }

  async function playNarration() {
    const audio = audioRef.current;
    if (!audio || startingRef.current || status === "playing") return;
    startingRef.current = true;
    stopFrame();
    audio.pause();
    audio.currentTime = 0;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setVisibleLines(reducedMotion ? briefNarrationLines : ["", ""]);
    setStatus("idle");
    releaseBackground();
    releaseRef.current = beginNarration();
    try {
      if (!enabled) await enable();
      await audio.play();
      if (!mountedRef.current) { audio.pause(); releaseBackground(); return; }
      rememberPlayed();
      startingRef.current = false;
      setStatus("playing");
      if (!reducedMotion) animateTranscript();
    } catch {
      audio.pause();
      finishNarration("blocked");
    }
  }

  function stopNarration(nextStatus: BriefNarrationStatus) {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    finishNarration(nextStatus);
  }

  useEffect(() => {
    mountedRef.current = true;
    let timer: number | null = null;
    if (hasPlayed()) {
      showFullTranscript();
      setStatus("ended");
    } else if (!enabled) {
      showFullTranscript();
      setStatus("muted");
    } else {
      timer = window.setTimeout(() => { void playNarration(); }, 180);
    }
    return () => {
      mountedRef.current = false;
      if (timer !== null) window.clearTimeout(timer);
      stopFrame();
      audioRef.current?.pause();
      releaseBackground();
    };
  }, [runId]);

  useEffect(() => {
    if (!enabled && (status === "playing" || startingRef.current)) stopNarration("muted");
    if (enabled && status === "muted" && !hasPlayed()) void playNarration();
  }, [enabled]);

  const statusLabel = status === "playing" ? "开案主持中" : status === "blocked" ? "点击播放" : status === "muted" ? "声音已关闭" : status === "error" ? "配音暂不可用" : status === "ended" ? "主持完毕" : "准备开案";
  const replayLabel = status === "muted" ? "开启并播放" : status === "blocked" ? "播放开案配音" : status === "error" ? "重试配音" : "重播";
  const firstActive = status === "playing" && visibleLines[0].length < briefNarrationLines[0].length;
  const secondActive = status === "playing" && !firstActive && visibleLines[1].length < briefNarrationLines[1].length;

  return <aside className={`brief-kanshan dm-${status}`}>
    <div className="dm-bubble">
      <header><span><i className="dm-wave"><b /><b /><b /></i>看山 DM</span><small>{statusLabel}</small></header>
      <blockquote aria-label={briefNarrationLines.join(" ")}><span aria-hidden="true" className={firstActive ? "typing" : ""}>{visibleLines[0] || "\u00a0"}</span><span aria-hidden="true" className={secondActive ? "typing" : ""}>{visibleLines[1] || "\u00a0"}</span></blockquote>
      <footer>{status === "playing" ? <button type="button" onClick={() => stopNarration("ended")}><SkipForward />跳过配音</button> : <button type="button" onClick={() => void playNarration()}><Volume2 />{replayLabel}</button>}</footer>
    </div>
    <img className={status === "playing" ? "speaking" : ""} src={poseRead} alt="看山主持开案" />
    <audio ref={audioRef} src={briefNarration} preload="auto" onEnded={() => finishNarration("ended")} onError={() => finishNarration("error")} />
  </aside>;
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
  return <div className="v3-page"><CaseHeader board={false} /><main className="brief-stage"><article className="brief-dossier"><div className="dossier-tab">CASE 001</div><div className="v3-stamp">机密档案</div><small>CONFIDENTIAL CASE FILE</small><h1>{caseData.question}</h1><div className="case-numbers"><span><Clock3 />在床 8小时</span><span><Clock3 />有效睡眠 7小时15分</span><span><History />缺口 45分钟</span></div><p className="brief-text">{caseData.brief}</p><div className="suspect-grid">{caseData.suspects.map((item) => <SuspectCard suspect={item} key={item.id} compact />)}</div><div className="brief-rule"><ShieldCheck /><p>每轮在知乎内容中取证并重新投票。投票没有即时对错，最终用两张关键证据和一张误导线索完成指认。</p></div><button className="v3-primary dossier-cta" onClick={confirm}>提交初始判断前先阅读规则 <ArrowRight /></button></article><BriefNarration runId={run.runId} /></main></div>;
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

function SearchWorkbench(props: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
  return props.round.mode === "targeted_search" ? <TargetedSearchWorkbench {...props} /> : <BasicSearchWorkbench {...props} />;
}

function BasicSearchWorkbench({ round, onState }: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
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

function challengeResultScore(result: SearchResult) {
  const text = `${result.title} ${result.summary}`;
  return ["不等于因果", "非因果", "研究局限", "个体差异", "替代解释", "方法", "局限"].reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function challengeResultKind(result: SearchResult) {
  const text = `${result.title} ${result.summary}`;
  if (["不等于因果", "非因果", "方法", "局限"].some((keyword) => text.includes(keyword))) return "方法边界";
  if (["个体差异", "替代", "其他因素"].some((keyword) => text.includes(keyword))) return "替代解释";
  return "反例线索";
}

function TargetedSearchWorkbench({ round, onState }: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
  const { caseData, run, setRun, setToast } = useV3();
  const suspectId = run?.votes.at(-1)?.suspectId || "PRESSURE";
  const suspect = caseData?.suspects.find((item) => item.id === suspectId);
  const review = round.reviewBySuspect?.[suspectId] || round.reviewBySuspect?.PRESSURE;
  const [condition, setCondition] = useState(review?.changeConditions[0] || "");
  const [supportQuery, setSupportQuery] = useState(review?.supportQuery || "");
  const [challengeQuery, setChallengeQuery] = useState(review?.challengeQuery || "");
  const [supportResults, setSupportResults] = useState<SearchResult[]>([]);
  const [challengeResults, setChallengeResults] = useState<SearchResult[]>([]);
  const [support, setSupport] = useState<SearchResult | null>(null);
  const [challenge, setChallenge] = useState<SearchResult | null>(null);
  const [searchingSide, setSearchingSide] = useState<"support" | "challenge" | null>(null);
  const [reason, setReason] = useState("");
  const sourcesDiffer = Boolean(support && challenge && support.sourceId !== challenge.sourceId);
  const ready = Boolean(condition && sourcesDiffer);

  useEffect(() => {
    onState({
      ready,
      payload: {
        reviewCondition: condition,
        changeReason: reason.trim(),
        supportQuery,
        challengeQuery,
        evidence: {
          E12: support ? { excerpt: support.summary, relation: "支持", sourceId: support.sourceId, sourceTitle: support.title, sourceUrl: support.url, suspectIds: [suspectId] } : {},
          E13: challenge ? { excerpt: challenge.summary, relation: "削弱", sourceId: challenge.sourceId, sourceTitle: challenge.title, sourceUrl: challenge.url, suspectIds: [suspectId] } : {}
        }
      }
    });
  }, [condition, reason, support, challenge, supportQuery, challengeQuery, suspectId, ready]);

  async function searchSide(side: "support" | "challenge") {
    if (!run) return;
    const searchQuery = side === "support" ? supportQuery.trim() : challengeQuery.trim();
    if (searchQuery.length < 2) return;
    setSearchingSide(side);
    try {
      const data = await v3Api.search(run.runId, round.id, searchQuery);
      if (side === "support") { setSupportResults(data.results.slice(0, 3)); setSupport(null); }
      else { setChallengeResults([...data.results].sort((a, b) => challengeResultScore(b) - challengeResultScore(a)).slice(0, 3)); setChallenge(null); }
      setRun(await v3Api.getRun(run.runId));
      if (data.fallbackUsed) setToast("CLI暂不可用，当前显示演示搜索结果");
    } catch (err) { setToast(err instanceof Error ? err.message : "搜索失败"); }
    finally { setSearchingSide(null); }
  }

  return <section className="targeted-review-workbench">
    <section className="review-step review-condition-step"><header><i>1</i><div><h3>第一步：先定义什么会让我改票</h3><p>如果出现哪种情况，你会降低对“{review?.assumption || suspect?.name}”的怀疑？</p></div></header><div>{review?.changeConditions.map((item) => <button key={item} className={condition === item ? "selected" : ""} onClick={() => setCondition(item)}><span />{item}</button>)}</div><small>先设定改变判断的条件，可以减少只寻找支持材料的确认偏误。</small></section>
    <section className="review-step review-search-step"><header><i>2</i><div><h3>第二步：启动双向检索</h3><p>同一假设，两种搜索意图</p></div><span>反证不等于相反观点；它也可以是反例、替代解释或方法边界。</span></header><div className="dual-search-grid">
      <section className="review-search-side support"><header><ShieldCheck /><div><h4>寻找支持证据</h4><small>验证已有解释</small></div></header><form onSubmit={(event) => { event.preventDefault(); void searchSide("support"); }}><Search /><input value={supportQuery} onChange={(event) => setSupportQuery(event.target.value)} maxLength={40} /><button disabled={searchingSide !== null || supportQuery.trim().length < 2}>{searchingSide === "support" ? "搜索中" : "搜索支持"}</button></form><div className="review-result-list">{supportResults.map((result) => <article key={result.sourceId} className={support?.sourceId === result.sourceId ? "selected" : ""}><small>支持结果 · {result.type}{result.fallback ? " · 演示数据" : ""}</small><h5>{result.title}</h5><p>{result.summary}</p><em>一般机制，不能直接证明个体原因</em><footer><button onClick={() => setSupport(result)} disabled={challenge?.sourceId === result.sourceId}>{support?.sourceId === result.sourceId ? <><CheckCircle2 />已收为支持证据</> : "收为支持证据"}</button><a href={result.url} target="_blank" rel="noreferrer">查看来源 <ExternalLink /></a></footer></article>)}</div>{!supportResults.length && <div className="review-search-empty"><Search /><p>搜索支持材料，验证当前解释。</p></div>}</section>
      <section className="review-search-side challenge"><header><ShieldCheck /><div><h4>寻找挑战证据</h4><small>主动尝试推翻</small></div><div><span>反例</span><span>替代解释</span><span>方法边界</span></div></header><form onSubmit={(event) => { event.preventDefault(); void searchSide("challenge"); }}><Search /><input value={challengeQuery} onChange={(event) => setChallengeQuery(event.target.value)} maxLength={40} /><button disabled={searchingSide !== null || challengeQuery.trim().length < 2}>{searchingSide === "challenge" ? "搜索中" : "搜索挑战"}</button></form><p className="challenge-query-note">系统根据当前假设自动加入否定词、局限词和替代原因。</p><div className="review-result-list">{challengeResults.map((result) => <article key={result.sourceId} className={challenge?.sourceId === result.sourceId ? "selected" : ""}><small>挑战结果 · {challengeResultKind(result)} · {result.type}{result.fallback ? " · 演示数据" : ""}</small><h5>{result.title}</h5><p>{result.summary}</p><em>用于限定结论，不等于完全否定</em><footer><button onClick={() => setChallenge(result)} disabled={support?.sourceId === result.sourceId}>{challenge?.sourceId === result.sourceId ? <><CheckCircle2 />已收为挑战证据</> : "收为挑战证据"}</button><a href={result.url} target="_blank" rel="noreferrer">查看来源 <ExternalLink /></a></footer></article>)}</div>{!challengeResults.length && <div className="review-search-empty"><Search /><p>搜索反例、替代解释和方法边界。</p></div>}</section>
    </div></section>
    <section className="review-step review-pair-step"><header><i>3</i><div><h3>第三步：检查证据是否真的形成对照</h3></div></header><div className="review-pair"><article className={support ? "complete" : ""}><small>{support ? "已收录支持 1/1" : "待收录支持 0/1"}</small><b>{support?.title || "请从支持检索中选择一条材料"}</b><span>来源：{support ? `${support.type} · ${support.author}` : "未选择"}</span></article><div className="review-pair-rules"><span className={sourcesDiffer ? "done" : ""}><CheckCircle2 />来自不同来源</span><span className={support && challenge ? "done" : ""}><CheckCircle2 />作用方向相反</span><span className={support && challenge ? "done" : ""}><CheckCircle2 />都标注了适用边界</span></div><article className={challenge ? "complete challenge" : "challenge"}><small>{challenge ? "已收录挑战 1/1" : "待收录挑战 0/1"}</small><b>{challenge?.title || "请从挑战检索中选择一条材料"}</b><span>来源：{challenge ? `${challenge.type} · ${challenge.author}` : "未选择"}</span></article></div><label>哪条证据最可能改变你的票？<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={120} placeholder="用一句话写下理由（选填）" /></label></section>
  </section>;
}

function SnapshotWorkbench({ round, onState }: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
  const { caseData } = useV3();
  const sources = caseData?.sources.filter((item) => item.roundId === round.id) || [];
  const [boundaryAnswer, setBoundaryAnswer] = useState("");

  useEffect(() => {
    if (round.mode === "comparison") return;
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
    }
    onState({ ready, payload: { boundaryAnswer, evidence } });
  }, [boundaryAnswer, round.mode]);

  if (round.mode === "comparison") return <ComparisonWorkbench round={round} onState={onState} />;

  const workbenchClass = round.mode === "professional" ? "professional-workbench" : round.mode === "comments" ? "comments-workbench" : round.mode === "research" ? "research-workbench" : "";
  return <section className={`snapshot-workbench ${workbenchClass}`}>
    {sources.map((source) => <SourceCard key={source.id} source={source} professional={round.mode === "professional" || round.mode === "research"} hideHeaderLink={round.mode === "comments"} sectionLabel={round.mode === "research" ? "研究摘要" : "证据摘要"}>
      {round.mode === "professional" && <><div className="professional-takeaways">{source.excerpts?.map((excerpt) => <span key={excerpt}><CheckCircle2 />{excerpt}</span>)}</div><div className="professional-proof-limit"><b>这篇内容不能证明</b><p>{source.limitations}</p></div></>}
      {round.mode === "comments" && <><div className="device-events">{["00:17", "02:48", "05:12"].map((time) => <span key={time}><b>{time}</b><small><Volume2 />异常声音 · 疑似觉醒</small></span>)}<strong>累计约<br /><b>26 分钟</b></strong></div><div className="comment-reading-heading"><MessageCircle /><b>评论区阅读</b><small>只读 · 不计分</small></div><div className="comment-link-list">{source.commentLinks?.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" data-tone={link.tone}><span>{link.label}</span><p>{link.focus}</p><strong>阅读评论区 <ExternalLink /></strong></a>)}</div></>}
      {round.mode === "research" && <><div className="research-findings">{source.excerpts?.map((excerpt) => <span key={excerpt}><CheckCircle2 />{excerpt}</span>)}</div><div className="research-mechanism"><BookOpen /><p><b>研究机制</b>持续威胁可通过 mSTN-CRH-LGP 神经环路改变 REM 睡眠及觉醒反应。</p></div><div className="research-limit"><ShieldCheck />{source.limitations}</div></>}
    </SourceCard>)}
    {round.mode === "research" && <section className="case-alignment"><header><div><small>与本案对照</small><h3>研究机制和本案表现是否一致？</h3></div><span>线索方向 · 一致</span></header><div>{sources[0]?.caseAlignment?.map((item, index) => <article key={item.label}><i>{index + 1}</i><b>{item.label}</b><p>{item.value}</p></article>)}</div><footer><CheckCircle2 /><p><b>研究机制与本案表现相呼应</b>{sources[0]?.caseConclusion}</p></footer></section>}
    {round.mode === "professional" && <div className="boundary-question"><header><small>因果边界判断</small><b>仅凭这篇内容，能否认定刘看山当晚的睡眠问题由咖啡导致？</b><p>请选择一个答案。</p></header><div className="boundary-options"><button className={boundaryAnswer === "can" ? "selected incorrect" : ""} onClick={() => setBoundaryAnswer("can")}><span />能直接证明</button><button className={boundaryAnswer === "cannot" ? "selected correct" : ""} onClick={() => setBoundaryAnswer("cannot")}><span />不能直接证明</button></div>{boundaryAnswer && <div className={`boundary-feedback ${boundaryAnswer === "cannot" ? "correct" : "incorrect"}`}>{boundaryAnswer === "cannot" ? <CheckCircle2 /> : <X />}<p><b>{boundaryAnswer === "cannot" ? "判断正确" : "还不能这样下结论"}</b>{boundaryAnswer === "cannot" ? "文章能够支持一般规律，但缺少刘看山当晚的个体数据，不能确认个体因果。" : "文章未提供刘看山当晚的摄入量、摄入时间、代谢特征和客观睡眠监测。"}</p></div>}</div>}
    {round.mode === "comments" && <div className="boundary-question"><header><small>因果边界判断</small><b>仅凭设备记录和这些评论，能否认定声音导致刘看山醒来？</b><p>请选择一个答案。</p></header><div className="boundary-options"><button className={boundaryAnswer === "can" ? "selected incorrect" : ""} onClick={() => setBoundaryAnswer("can")}><span />能直接证明</button><button className={boundaryAnswer === "cannot" ? "selected correct" : ""} onClick={() => setBoundaryAnswer("cannot")}><span />不能直接证明</button></div>{boundaryAnswer && <div className={`boundary-feedback ${boundaryAnswer === "cannot" ? "correct" : "incorrect"}`}>{boundaryAnswer === "cannot" ? <CheckCircle2 /> : <X />}<p><b>{boundaryAnswer === "cannot" ? "判断正确" : "还不能这样下结论"}</b>{boundaryAnswer === "cannot" ? "现有材料只能说明声音与疑似觉醒在时间上接近；缺少明确先后关系，不能确认个体因果。" : "评论经验和设备同一时段记录，都不能排除醒来后发声或其他环境原因。"}</p></div>}</div>}
    {round.mode === "research" && <div className="boundary-question research-judgement"><header><small>证据作用判断</small><b>这篇动物机制研究在本案中意味着什么？</b><p>请选择一个答案。</p></header><div className="boundary-options"><button className={boundaryAnswer === "sole" ? "selected incorrect" : ""} onClick={() => setBoundaryAnswer("sole")}><span />可以单独定案：工作压力是唯一原因</button><button className={boundaryAnswer === "strengthens" ? "selected correct" : ""} onClick={() => setBoundaryAnswer("strengthens")}><span />不能单独定案，但显著增强压力假设</button></div>{boundaryAnswer && <div className={`boundary-feedback ${boundaryAnswer === "strengthens" ? "correct" : "incorrect"}`}>{boundaryAnswer === "strengthens" ? <CheckCircle2 /> : <X />}<p><b>{boundaryAnswer === "strengthens" ? "判断正确" : "可信研究也不能越过个体边界"}</b>{boundaryAnswer === "strengthens" ? "研究揭示持续威胁影响 REM 睡眠与觉醒的神经机制；本案的压力事件、担忧记录、心率升高和睡眠片段化方向一致，因此压力假设被显著增强。" : "这项研究以小鼠为模式动物，不能排除咖啡因、环境声音等其他变量，也不能单独完成个体定因。"}</p></div>}</div>}
  </section>;
}

function ComparisonRowIcon({ id }: { id: string }) {
  if (id === "phone") return <Smartphone />;
  if (id === "coffee") return <Coffee />;
  if (id === "pressure") return <BriefcaseBusiness />;
  if (id === "environment") return <Volume2 />;
  return <Clock3 />;
}

function ComparisonWorkbench({ round, onState }: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
  const { caseData } = useV3();
  const [answer, setAnswer] = useState("");
  const judgement = round.comparisonJudgement;
  const selectedOption = judgement?.options.find((option) => option.id === answer);
  const ready = Boolean(selectedOption?.correct);

  useEffect(() => {
    const source = caseData?.sources.find((item) => item.id === "S_COMPARE_B");
    onState({
      ready,
      payload: {
        comparisonAnswer: answer,
        evidence: {
          E11: {
            excerpt: "手机暴露基本相同而睡眠结果不同，削弱了手机作为唯一主因的解释；咖啡、压力和环境仍需继续保留。",
            relation: "补充",
            sourceId: source?.id,
            sourceTitle: source?.title,
            sourceUrl: source?.url,
            limitations: "自然对照同时改变多个条件，不能证明其中任何一个是唯一原因。"
          }
        }
      }
    });
  }, [answer, ready]);

  return <section className="comparison-workbench">
    <div className="comparison-main">
      <section className="comparison-table-card">
        <header><h3>两晚条件对照</h3><span>自然对照 · 非严格实验</span></header>
        <div className="comparison-table">
          <div className="comparison-table-head"><b>比较项目</b><b>案发夜</b><b>对照夜</b><b>是否相同</b></div>
          {round.comparisonRows?.map((row) => <div className="comparison-table-row" key={row.id}><strong><ComparisonRowIcon id={row.id} />{row.label}</strong><p>{row.caseNight}</p><p>{row.controlNight}</p><span className={row.same ? "same" : row.id === "sleep" ? "improved" : "different"}>{row.status}</span></div>)}
        </div>
      </section>
      <section className="comparison-meaning">
        <header><h3>对照夜能说明什么？</h3></header>
        <div className="comparison-reasoning">
          <div><i>1</i><b>手机暴露基本相同</b></div>
          <ArrowRight />
          <div><i>2</i><b>睡眠结果出现差异</b></div>
          <ArrowRight />
          <div><i>3</i><b>手机不能单独解释两晚差异</b></div>
        </div>
        <div className="comparison-result"><ShieldCheck /><p><b>手机作为唯一主因被削弱</b>它仍可能影响入睡，但不足以解释全部睡眠变化。</p></div>
        <div className="comparison-boundary"><ShieldCheck /><p>咖啡、压力和环境同时改变，因此不能证明其中任何一项是唯一原因。咖啡的实际影响还取决于摄入量、饮用时间和个人代谢。</p></div>
      </section>
    </div>
    <section className="comparison-judgement">
      <header><div><h3>证据作用判断 <span>单选 · 计入定级</span></h3><p>{judgement?.question}</p></div></header>
      <div className="comparison-options">{judgement?.options.map((option) => <button key={option.id} className={answer === option.id ? option.correct ? "selected correct" : "selected incorrect" : ""} onClick={() => setAnswer(option.id)}><i />{option.label}</button>)}</div>
      {selectedOption && <div className={`comparison-feedback ${selectedOption.correct ? "correct" : "incorrect"}`}>{selectedOption.correct ? <CheckCircle2 /> : <X />}<p><b>{selectedOption.correct ? "判断正确" : "证据还不能支持这个结论"}</b>{selectedOption.correct ? judgement?.correctFeedback : judgement?.incorrectFeedback}</p></div>}
    </section>
  </section>;
}

function AssistantPromptIcon({ id }: { id: string }) {
  if (id === "personal-clues") return <FileSearch />;
  if (id === "sleep-stages") return <Smartphone />;
  if (id === "timeline") return <History />;
  return <ShieldCheck />;
}

function AssistantWorkbench({ round, onState }: { round: RoundConfig; onState: (value: WorkbenchResult) => void }) {
  const { caseData, run, setRun, setToast } = useV3();
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [sendingPromptId, setSendingPromptId] = useState<string | null>(null);
  const turns = run?.assistantTurns || [];
  const prompts = round.assistantPrompts || [];
  const viewedQuestions = new Set(turns.map((turn) => turn.question));
  const viewedCount = prompts.filter((prompt) => viewedQuestions.has(prompt.question)).length;
  const activePrompt = prompts.find((prompt) => prompt.id === activePromptId)
    || prompts.find((prompt) => viewedQuestions.has(prompt.question));
  useEffect(() => { onState({ ready: viewedCount >= 1, payload: { evidence: { E09: { excerpt: "看山助手区分了本人线索与一般规律，梳理手机和压力的作用阶段，并指出下一轮仍需用对照夜核查。", relation: "补充", limitations: "看山助手只整理证据与缺口，不能替代玩家完成因果判断。" } } } }); }, [viewedCount]);
  async function selectPrompt(prompt: AssistantPrompt) {
    setActivePromptId(prompt.id);
    if (!run || viewedQuestions.has(prompt.question)) return;
    setSendingPromptId(prompt.id);
    try {
      await v3Api.assistant(run.runId, prompt.question);
      setRun(await v3Api.getRun(run.runId));
    } catch (err) { setToast(err instanceof Error ? err.message : "协查失败"); }
    finally { setSendingPromptId(null); }
  }
  const sourceCards = caseData?.sources.filter((item) => ["S_DOCTOR", "S_COMMENTS", "S_RESEARCH"].includes(item.id)) || [];
  return <section className="assistant-workbench"><div className="assistant-boundary"><Bot /><b>看山助手的回答是推理提示，不是案件事实或标准答案。</b></div><div className="assistant-collab"><section className="assistant-conversation"><header><img src={poseThink} alt="刘看山助手正在整理证据" /><div><h2>看山助手 <span>证据整理模式</span></h2><p>{round.assistantIntro}</p></div></header>{activePrompt ? <div className="assistant-dialogue"><div className="assistant-user-prompt">{activePrompt.question}<i>你</i></div><article className="assistant-analysis"><header><Sparkles /><div><small>{activePrompt.tag}</small><h3>{activePrompt.question}</h3></div></header><p>{activePrompt.intro}</p><div className="assistant-analysis-points">{activePrompt.points.map((point, index) => <div key={`${point.label}-${index}`} data-tone={point.tone || "neutral"}><b>{point.label}</b><p>{point.text}</p></div>)}</div><aside><Sparkles /><p><b>看山助手提示</b>{activePrompt.observation}</p></aside></article></div> : <div className="assistant-empty"><Bot /><b>选择一个角度开始协查</b><p>建议先看“哪些线索直接来自刘看山当晚？”。</p></div>}<footer>这些标准帮助你比较证据，不会自动生成答案。</footer></section><aside className="assistant-angle-panel"><header><h3>换个角度继续问</h3><p>点击问题，看山助手会切换分析视角</p></header><div className="assistant-prompt-list">{prompts.map((prompt) => { const selected = activePrompt?.id === prompt.id; const viewed = viewedQuestions.has(prompt.question); return <button key={prompt.id} className={selected ? "selected" : ""} onClick={() => void selectPrompt(prompt)} disabled={sendingPromptId !== null && sendingPromptId !== prompt.id}><AssistantPromptIcon id={prompt.id} /><span><b>{prompt.question}</b><small>{prompt.tag}</small></span>{sendingPromptId === prompt.id ? <i className="assistant-loading-dot" /> : viewed ? <CheckCircle2 /> : <ArrowRight />}</button>; })}</div><div className="assistant-progress"><span>已查看 <b>{viewedCount}</b> / {prompts.length} 个分析视角</span><div><i style={{ width: `${prompts.length ? (viewedCount / prompts.length) * 100 : 0}%` }} /></div></div><details className="assistant-citations"><summary><BookOpen />查看本轮引用材料（{sourceCards.length}）<ArrowRight /></summary>{sourceCards.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><BookOpen /><span><b>{source.title}</b><small>{source.authorType}</small></span><ExternalLink /></a>)}</details></aside></div></section>;
}

function RoundFocus({ round }: { round: RoundConfig }) {
  const { run } = useV3();
  const suspectId = run?.votes.at(-1)?.suspectId || "PRESSURE";
  const facts = round.mode === "targeted_search"
    ? round.focusFacts.map((fact, index) => index === 0 ? { ...fact, value: round.reviewBySuspect?.[suspectId]?.assumption || fact.value } : fact)
    : round.focusFacts;
  return <section className="round-focus" aria-label="本轮关键判断">{facts.map((fact) => <div key={fact.label} data-tone={fact.tone}><small>{fact.label}</small><b>{fact.value}</b></div>)}</section>;
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
  const isBoundaryRound = ["professional", "comments", "research", "comparison"].includes(round.mode);
  const sideHint = round.mode === "professional"
    ? "读懂来源，也要看清它不能证明什么。"
    : round.mode === "comments"
      ? "评论提供经验与线索，不替代因果证据。"
      : round.mode === "research"
        ? "高可信研究增强假设，但不能替个体定案。"
        : round.mode === "assistant"
          ? "我只帮你整理证据，不替你下结论。"
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

  return <div className="v3-page round-page"><CaseHeader round={round} /><main className="round-layout"><RoundTimeline round={round} /><section className="investigation-paper"><header><div><small>ROUND {round.index} / INVESTIGATION</small><h1>{round.title}</h1><p>{round.clue}</p></div><span>{round.shortTitle}</span></header><RoundFocus round={round} /><div className="round-objective"><CheckCircle2 /><div><b>本轮任务</b><p>{round.objective}</p></div></div>{round.mode === "search" || round.mode === "targeted_search" ? <SearchWorkbench round={round} onState={setWorkbench} /> : round.mode === "assistant" ? <AssistantWorkbench round={round} onState={setWorkbench} /> : <SnapshotWorkbench round={round} onState={setWorkbench} />}<footer className="round-submit"><p>{workbench.ready ? <><CheckCircle2 />{round.mode === "assistant" ? "已完成一次 AI 协查，可以继续查看，也可以进入投票。" : "取证条件已满足，可以进入本轮投票。"}</> : <><ShieldCheck />{isBoundaryRound ? "完成本轮因果边界判断后才能投票。" : round.mode === "assistant" ? "至少查看一个看山助手分析视角后即可投票。" : "完成页面中的标记和边界确认后才能投票。"}</>}</p><button className="v3-primary" disabled={!workbench.ready || submitting} onClick={complete}>{submitting ? "正在归档" : round.mode === "assistant" ? "带着线索进入投票" : "收录证据并投票"}<ArrowRight /></button></footer></section><aside className="round-side"><div className="evidence-notes"><h2>线索摘录</h2><span>本轮将获得</span>{round.evidenceRewards.map((id) => <div key={id}><FolderOpen /><b>{id}</b><small>{caseData.evidenceBlueprints.find((item) => item.id === id)?.title as string}</small></div>)}</div><img src={round.mode === "assistant" ? poseThink : poseRead} alt="看山陪同调查" /><p>“{sideHint}”</p></aside></main></div>;
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
  return <div className="v3-page"><CaseHeader round={round} /><main className="recap-stage"><section className="recap-card"><div className="recap-label"><Sparkles />看山前情提示</div>{recap ? <><blockquote>{cleanRecapText(recap.text)}</blockquote>{recap.fallbackUsed && <small>模板提示 · 直答服务本轮已降级</small>}<button className="v3-primary" onClick={next}>{recap.cta}<ArrowRight /></button></> : <div className="recap-loading"><span /><span /><span /><p>看山正在整理本轮证据...</p></div>}</section><img src={poseThink} alt="看山生成前情提示" /></main></div>;
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
  const recommendations = caseData.report.recommendations ?? report.recommendations;
  async function copy() { await navigator.clipboard.writeText(report.shareDraft); setToast("分享草稿已复制"); }
  async function restart() { const next = await createRun(); navigate(routeFor(next)); }
  return <div className="v3-page report-page"><CaseHeader backTo="/" /><main><article className="report-paper"><div className="v3-stamp">案件已结</div><header><div><small>{caseData.caseNumber} / FINAL REPORT</small><h1>{caseData.title}</h1><p>你的最终指认：{report.culprit.name}{report.accomplice.name !== "无" ? ` ＋ ${report.accomplice.name}` : ""}</p></div><div className="report-grade"><strong>{report.grade}</strong><span>{report.gradeName}</span><small>{report.score} / 100</small></div></header><section className="report-summary"><div className="report-rebuild"><small>官方案件重建</small><h2>{report.official.culprit} · 主因候选</h2><p>{report.truthReconstruction}</p><div><span>共同作用：{report.official.accomplice}</span><span>触发因素：{report.official.trigger}</span><span>显眼但不充分：{report.official.redHerring}</span></div></div><div className="report-grade-reasons"><header><h2>为什么获得 {report.grade}</h2><p>{report.gradeDescription}</p></header>{report.gradeReasons.map((item) => <div key={item.id} data-status={item.status}>{item.status === "complete" ? <CheckCircle2 /> : item.status === "partial" ? <ShieldCheck /> : <X />}<b>{item.label}</b><span>{item.summary}</span><small>{item.statusLabel} · {item.score}/{item.maxScore}</small></div>)}</div></section><section className="report-user-reason"><h2>你的指认理由</h2><p>{report.reason}</p></section><section className="report-path"><h2>你的判断轨迹</h2><div>{report.votePath.map((vote) => { const suspect = caseData.suspects.find((item) => item.id === vote.suspectId)!; return <div key={vote.voteId}><b>{vote.roundId}</b><span style={{ background: suspect.color }} /><strong>{suspect.name}</strong></div>; })}</div><p>改票只记录推理轨迹，不参与等级计算。本次共改变判断 {report.voteChanges} 次。</p></section><section className="report-evidence"><h2>关键证据</h2>{report.evidence.map((item) => <article key={item.id}><b>{item.id}</b><div><strong>{item.title}</strong><p>{item.excerpt}</p><small>{item.reliability} · {item.relation}</small></div></article>)}</section><section className="report-recommendations"><header><div><h2>结案后的知乎延伸阅读</h2><p>沿着本案证据链，继续核查五个相关方向。</p></div><span>知乎内容</span></header><div>{recommendations.map((item, index) => <article key={item.id}><small>{String(index + 1).padStart(2, "0")} · 推荐主题</small><strong>{item.topic ?? item.author}</strong><h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}<em>配置理由：{item.reason}</em><a href={item.url} target="_blank" rel="noreferrer">在知乎继续阅读 <ArrowRight /></a></article>)}</div><footer><ShieldCheck />以上内容用于知识延伸，不构成医学诊断。</footer></section>{report.fallbackUsed && <div className="report-fallback"><Bot />本次调查部分搜索或直答使用了演示降级内容。</div>}<blockquote>“{report.comment}”</blockquote><footer><button className="v3-primary" onClick={copy}><Clipboard />复制结案卡文案</button><button className="v3-secondary" onClick={() => navigate("/")}>返回事务所</button><button className="v3-text-button" onClick={restart}><RotateCcw />重新调查</button></footer></article><aside><img src={poseClose} alt="刘看山完成结案" /><p>{caseData.report.closingMessage ?? report.closingMessage}</p></aside></main></div>;
}

function V3Routes() {
  const { loading, error } = useV3();
  if (loading) return <LoadingPage />;
  if (error) return <div className="v3-fatal"><X /><h1>案件调取失败</h1><p>{error}</p></div>;
  return <><Routes><Route path="/" element={<HomePage />} /><Route path="/commission" element={<CommissionPage />} /><Route path="/brief" element={<BriefPage />} /><Route path="/initial-vote" element={<InitialVotePage />} /><Route path="/round/:roundId" element={<RoundPage />} /><Route path="/vote/:roundId" element={<VotePage />} /><Route path="/recap/:roundId" element={<RecapPage />} /><Route path="/board" element={<BoardPage />} /><Route path="/final" element={<FinalPage />} /><Route path="/report" element={<ReportPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes><AwardTicker /><Toast /></>;
}

export function V3App() {
  return <AudioProvider><V3Provider><V3Routes /></V3Provider></AudioProvider>;
}
