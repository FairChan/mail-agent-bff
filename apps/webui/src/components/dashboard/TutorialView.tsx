import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MailPersonalizationProfile } from "../../types";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { getApiErrorMessage, readApiPayload } from "../../utils/http";
import MailKBSummaryModal from "./MailKBSummaryModal";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { CalmButton, CalmPill, CalmSectionLabel, CalmSurface } from "../ui/Calm";

type KnowledgeBaseArtifact = {
  key: string;
  label: string;
  path: string;
};

type TutorialViewProps = {
  apiBase: string;
  onComplete: () => void;
  completed: boolean;
};

type PersonalizationDraft = {
  urgentSignals: string;
  hiddenImportantTopics: string;
  deadlineAlertWindowHours: number;
  vipSenders: string;
  softRejectMode: "downgrade_only" | "draft_reject";
  softRejectNotes: string;
  noiseSources: string;
  notes: string;
};

type TutorialPromptCardProps = {
  step: string;
  prompt: string;
  hint: string;
  children: ReactNode;
};

const DAY_OPTIONS = [7, 14, 30, 60];
const DEADLINE_OPTIONS = [24, 48, 72];

function createEmptyPersonalizationDraft(): PersonalizationDraft {
  return {
    urgentSignals: "",
    hiddenImportantTopics: "",
    deadlineAlertWindowHours: 48,
    vipSenders: "",
    softRejectMode: "downgrade_only",
    softRejectNotes: "",
    noiseSources: "",
    notes: "",
  };
}

function draftFromProfile(profile: MailPersonalizationProfile): PersonalizationDraft {
  return {
    urgentSignals: profile.answers.urgentSignals,
    hiddenImportantTopics: profile.answers.hiddenImportantTopics,
    deadlineAlertWindowHours: profile.answers.deadlineAlertWindowHours,
    vipSenders: profile.answers.vipSenders,
    softRejectMode: profile.answers.softRejectMode,
    softRejectNotes: profile.answers.softRejectNotes,
    noiseSources: profile.answers.noiseSources,
    notes: profile.answers.notes,
  };
}

function formatSavedAt(value: string, locale: "zh" | "en" | "ja"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

function toTimeInputValue(hour: number, minute: number): string {
  return `${String(Math.max(0, Math.min(23, hour))).padStart(2, "0")}:${String(
    Math.max(0, Math.min(59, minute))
  ).padStart(2, "0")}`;
}

function fromTimeInputValue(value: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return {
    hour: Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.round(hour))) : 20,
    minute: Number.isFinite(minute) ? Math.max(0, Math.min(59, Math.round(minute))) : 0,
  };
}

function mergeArtifacts(
  personalizationArtifacts: KnowledgeBaseArtifact[],
  knowledgeArtifacts: KnowledgeBaseArtifact[]
): KnowledgeBaseArtifact[] {
  const seen = new Set<string>();
  const merged: KnowledgeBaseArtifact[] = [];

  for (const artifact of [...personalizationArtifacts, ...knowledgeArtifacts]) {
    const key = `${artifact.key}:${artifact.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(artifact);
  }

  return merged;
}

function TutorialPromptCard({ step, prompt, hint, children }: TutorialPromptCardProps) {
  return (
    <CalmSurface className="p-5" tone="muted">
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-info)] text-sm font-semibold text-[color:var(--pill-info-ink)]">
          M
        </div>
        <div className="min-w-0 flex-1">
          <CalmSectionLabel>{step}</CalmSectionLabel>
          <p className="mt-2 text-base font-semibold text-[color:var(--ink)]">{prompt}</p>
          <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">{hint}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </CalmSurface>
  );
}

function TutorialTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-[112px] w-full rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-4 py-3 text-sm leading-7 text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--ink-subtle)]",
        "focus:border-[color:var(--border-info)] focus:ring-2 focus:ring-[color:var(--focus-ring)]/35",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function TutorialInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-[999px] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-4 text-sm text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--ink-subtle)]",
        "focus:border-[color:var(--border-info)] focus:ring-2 focus:ring-[color:var(--focus-ring)]/35",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function TutorialView({ apiBase, onComplete, completed }: TutorialViewProps) {
  const { locale, setCurrentView } = useApp();
  const {
    activeSourceId,
    sources,
    kbStats,
    notificationPrefs,
    fetchKbStats,
    fetchNotificationPrefs,
    updateNotificationPrefs,
    triggerSummarize,
  } = useMail();

  const [selectedDays, setSelectedDays] = useState(30);
  const [jobId, setJobId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<KnowledgeBaseArtifact[]>([]);
  const [baselineReady, setBaselineReady] = useState(false);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const artifactRequestIdRef = useRef(0);

  const [personalizationDraft, setPersonalizationDraft] = useState<PersonalizationDraft>(createEmptyPersonalizationDraft);
  const [personalizationArtifacts, setPersonalizationArtifacts] = useState<KnowledgeBaseArtifact[]>([]);
  const [personalizationCompleted, setPersonalizationCompleted] = useState(false);
  const [isLoadingPersonalization, setIsLoadingPersonalization] = useState(false);
  const [isSavingPersonalization, setIsSavingPersonalization] = useState(false);
  const [personalizationError, setPersonalizationError] = useState<string | null>(null);
  const [personalizationSavedAt, setPersonalizationSavedAt] = useState<string | null>(null);
  const personalizationRequestIdRef = useRef(0);
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(true);
  const [digestTimeValue, setDigestTimeValue] = useState("20:00");
  const [digestTimeZone, setDigestTimeZone] = useState(browserTimeZone);
  const [isSavingDigestPrefs, setIsSavingDigestPrefs] = useState(false);
  const [digestPrefsError, setDigestPrefsError] = useState<string | null>(null);
  const [digestPrefsSavedAt, setDigestPrefsSavedAt] = useState<string | null>(null);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources]
  );
  const mailboxReady = Boolean(activeSource?.ready);
  const visibleArtifacts = useMemo(
    () => mergeArtifacts(personalizationArtifacts, artifacts),
    [artifacts, personalizationArtifacts]
  );

  const copy = {
    eyebrow: locale === "zh" ? "Onboarding" : locale === "ja" ? "オンボーディング" : "Onboarding",
    headline:
      locale === "zh"
        ? "第一次使用，先把邮箱助理点亮"
        : locale === "ja"
          ? "まずはメールアシスタントを起動しましょう"
          : "Start by lighting up your mail copilot",
    description:
      locale === "zh"
        ? "先绑定邮箱，再把你的轻重缓急讲给 Mery。系统会把这些偏好写成结构化本地文档，后续四象限分类、提醒和 Agent 问答都会优先参考它。"
        : locale === "ja"
          ? "まずメールボックスを接続し、そのあと優先順位の感覚を Mery に教えます。設定は構造化されたローカル文書として保存され、その後の分類・通知・Agent 回答に優先的に使われます。"
          : "Connect a mailbox, then teach Mery how you personally weigh urgency and importance. The system saves that as a structured local document for future triage, alerts, and agent answers.",
    openSettings: locale === "zh" ? "前往绑定邮箱" : locale === "ja" ? "設定を開く" : "Open Settings",
    skip:
      completed
        ? locale === "zh"
          ? "再次进入收件箱"
          : locale === "ja"
            ? "受信トレイに戻る"
            : "Back to inbox"
        : locale === "zh"
          ? "暂时跳过教程"
          : locale === "ja"
            ? "いまはスキップ"
            : "Skip for now",
    mailboxReady: locale === "zh" ? "邮箱已就绪" : locale === "ja" ? "メールボックス準備完了" : "Mailbox ready",
    mailboxPending: locale === "zh" ? "等待连接邮箱" : locale === "ja" ? "メールボックス接続待ち" : "Mailbox pending",
    profileReady: locale === "zh" ? "判据文档已保存" : locale === "ja" ? "優先判定文書を保存済み" : "Decision profile saved",
    profilePending: locale === "zh" ? "等待定义判据" : locale === "ja" ? "優先判定の定義待ち" : "Decision profile pending",
    docsReady: locale === "zh" ? "知识文档可用" : locale === "ja" ? "知識文書利用可" : "Docs ready",
    docsPending: locale === "zh" ? "知识库尚在构建" : locale === "ja" ? "知識ベース構築中" : "Knowledge base building",
    sourceTitle: locale === "zh" ? "1. 绑定邮箱" : locale === "ja" ? "1. メールボックスを接続" : "1. Connect a mailbox",
    sourceBody:
      locale === "zh"
        ? activeSource
          ? `当前已连接：${activeSource.name || activeSource.emailHint || activeSource.id}`
          : "先在设置中完成邮箱绑定，系统才能读取你的历史邮件。"
        : locale === "ja"
          ? activeSource
            ? `現在の接続先: ${activeSource.name || activeSource.emailHint || activeSource.id}`
            : "履歴メールを読むには、まず設定でメール連携を完了してください。"
          : activeSource
            ? `Connected: ${activeSource.name || activeSource.emailHint || activeSource.id}`
            : "Finish mailbox setup in Settings before running the historical summary flow.",
    sourceReadyNote:
      locale === "zh"
        ? "邮箱已经可读，可以直接开始历史归纳和个性化设定。"
        : locale === "ja"
          ? "メールボックスは読み取り可能で、そのまま過去メール要約と個性化設定を始められます。"
          : "Mailbox is ready to read.",
    sourcePendingNote:
      locale === "zh"
        ? "邮箱已连接，后台仍可能继续验证。现在也可以先完成偏好设定。"
        : locale === "ja"
          ? "メールボックスは接続済みですが、バックグラウンド検証が続く場合があります。それでも個性化設定は進められます。"
          : "Mailbox is connected and you can already finish your preference setup.",
    summaryTitle: locale === "zh" ? "4. 选择历史范围" : locale === "ja" ? "4. 要約する期間を選ぶ" : "4. Choose a history range",
    summaryBody:
      locale === "zh"
        ? "建议先从 30 天开始。完成后会自动生成邮件 ID、题目索引、评分索引、摘要正文、事件聚类和发件人画像文档。"
        : locale === "ja"
          ? "まずは 30 日から始めるのがおすすめです。完了すると、メール ID、件名索引、スコア索引、要約本文、イベントクラスタ、送信者プロファイルが自動生成されます。"
          : "Start with 30 days. The pipeline will export mail IDs, subject index, score index, summaries, event clusters, and sender profiles.",
    start: locale === "zh" ? "开始归纳旧邮件" : locale === "ja" ? "過去メールの要約を開始" : "Start history summary",
    openResults: locale === "zh" ? "查看归纳结果" : locale === "ja" ? "要約結果を見る" : "Open summary results",
    digestTitle:
      locale === "zh"
        ? "2. 设定每天的邮件摘要时间"
        : locale === "ja"
          ? "2. 毎日のメール要約時刻を設定"
          : "2. Schedule the daily mail digest",
    digestBody:
      locale === "zh"
        ? "到这个时间后，Mery 会把当天邮箱状态、紧急重要邮件、近期 DDL 和建议动作合成一条摘要推送给你。"
        : locale === "ja"
          ? "この時刻になると、Mery が当日のメール状況、緊急重要メール、近い締切、推奨アクションを要約して通知します。"
          : "At this time, Mery sends a compact digest of today’s mailbox state, urgent mail, upcoming deadlines, and suggested actions.",
    digestEnable:
      locale === "zh" ? "开启每日摘要推送" : locale === "ja" ? "毎日の要約通知を有効化" : "Enable daily digest push",
    digestTimeLabel: locale === "zh" ? "推送时间" : locale === "ja" ? "通知時刻" : "Push time",
    digestTimeZoneLabel: locale === "zh" ? "时区" : locale === "ja" ? "タイムゾーン" : "Time zone",
    digestUseLocal:
      locale === "zh" ? "使用本机时区" : locale === "ja" ? "端末のタイムゾーンを使用" : "Use device time zone",
    digestSave: locale === "zh" ? "保存每日摘要设置" : locale === "ja" ? "毎日要約設定を保存" : "Save digest schedule",
    digestSaved:
      locale === "zh"
        ? "每日摘要时间已保存，后续通知会按这个时间触发。"
        : locale === "ja"
          ? "毎日要約の時刻を保存しました。以後の通知はこの時刻で実行されます。"
          : "Daily digest schedule saved. Future pushes will use this time.",
    digestMissingSource:
      locale === "zh"
        ? "先连接一个邮箱，这样每日摘要设置会绑定到具体邮箱。"
        : locale === "ja"
          ? "まずメールボックスを接続すると、毎日要約設定をそのメールボックスに保存できます。"
          : "Connect a mailbox first so the digest schedule can be saved for that source.",
    profileTitle:
      locale === "zh"
        ? "3. 用对话卡片，讲清楚你的轻重缓急"
        : locale === "ja"
          ? "3. 会話カードで優先順位の感覚を教える"
          : "3. Teach your urgency logic through conversation cards",
    profileBody:
      locale === "zh"
        ? "这一步不是普通问卷。它会生成一份结构化的本地判据文档，之后系统会据此判断谁该强提醒、哪些话题需要提升重要度、哪些群发邮件该降权。"
        : locale === "ja"
          ? "これはただのアンケートではありません。ここで入力した内容は構造化されたローカル判定文書になり、その後の重要度判定・通知・ノイズ抑制に使われます。"
          : "This is not a generic form. Your answers become a structured local decision document that drives future triage, alerting, and noise reduction.",
    profileLoading:
      locale === "zh" ? "正在读取你之前保存的判据..." : locale === "ja" ? "保存済みの判定文書を読み込み中..." : "Loading your saved decision profile...",
    profileEmpty:
      locale === "zh"
        ? "先连接一个邮箱，然后再把你的判据讲给 Mery。"
        : locale === "ja"
          ? "まずメールボックスを接続してから、Mery にあなたの判定基準を教えてください。"
          : "Connect a mailbox first, then teach Mery how you prioritize mail.",
    profileSave:
      locale === "zh" ? "保存个性化判据" : locale === "ja" ? "個性化判定を保存" : "Save decision profile",
    profileSaved:
      locale === "zh"
        ? "你的个性化判据已经写入本地文档，后续分类会直接参考。"
        : locale === "ja"
          ? "個性化判定はローカル文書に保存され、以後の分類に使われます。"
          : "Your personalized decision profile is saved locally and will now influence future triage.",
    featuresTitle: locale === "zh" ? "5. 完成后会自动点亮的能力" : locale === "ja" ? "5. 完了後に有効になる機能" : "5. What this unlocks next",
    docsTitle:
      locale === "zh" ? "6. 本地文档与 Agent 可访问结果" : locale === "ja" ? "6. ローカル文書と Agent 可読結果" : "6. Local documents and agent-readable outputs",
    docsDescription:
      locale === "zh"
        ? "这里会同时展示个性化判据文档和历史邮件知识库文档。后续 Agent 会直接读取它们来回答旧邮件问题，并参考你的偏好做分类。"
        : locale === "ja"
          ? "ここには個性化判定文書と過去メール知識ベース文書の両方が表示されます。今後 Agent はこれらを直接読み、あなたの好みに沿って答えや分類を行います。"
          : "This shows both your personalized decision document and the historical mail knowledge base. Future agent answers will read from these files and classify mail using your preferences.",
    docsLoading:
      locale === "zh"
        ? "正在读取本地文档状态..."
        : locale === "ja"
          ? "ローカル文書の状態を読み込み中..."
          : "Loading local artifact status...",
    docsEmpty:
      locale === "zh"
        ? "当前还没有生成本地文档。保存判据或完成一次历史归纳后，这里会出现可复用的本地材料。"
        : locale === "ja"
          ? "まだローカル文書は生成されていません。判定文書を保存するか、過去メール要約を完了すると、ここに再利用可能な資料が表示されます。"
          : "No local documents yet. Save your decision profile or run a history summary to generate reusable artifacts here.",
    docsReadyNote:
      locale === "zh"
        ? "个性化判据和旧邮件归档结果都可以被 Agent 直接访问。"
        : locale === "ja"
          ? "個性化判定と過去メール文書の両方を Agent が直接参照できます。"
          : "Both your personalization profile and historical mail artifacts are now directly readable by the agent.",
    docsProfileReadyNote:
      locale === "zh"
        ? "个性化判据文档已经可以被 Agent 直接访问；完成一次历史归档后，旧邮件知识库也会出现在这里。"
        : locale === "ja"
          ? "個性化判定文書は Agent が直接参照できます。過去メール要約を完了すると、知識ベース文書もここに表示されます。"
          : "Your personalization profile is directly readable by the agent. Historical mail artifacts will appear here after a summary run.",
    docsKnowledgeReadyNote:
      locale === "zh"
        ? "旧邮件归档结果已经可以被 Agent 直接访问；保存个性化判据后，分类也会参考你的个人偏好。"
        : locale === "ja"
          ? "過去メール文書は Agent が直接参照できます。個性化判定を保存すると、分類もあなたの好みを参照します。"
          : "Historical mail artifacts are directly readable by the agent. Save your personalization profile to make triage use your preferences too.",
    statsSummary:
      locale === "zh"
        ? `当前已归档 ${kbStats?.totalMails ?? 0} 封邮件 / ${kbStats?.totalEvents ?? 0} 个事件 / ${kbStats?.totalPersons ?? 0} 位人物`
        : locale === "ja"
          ? `${kbStats?.totalMails ?? 0} 通のメール / ${kbStats?.totalEvents ?? 0} 件のイベント / ${kbStats?.totalPersons ?? 0} 人物`
          : `${kbStats?.totalMails ?? 0} mails / ${kbStats?.totalEvents ?? 0} events / ${kbStats?.totalPersons ?? 0} people`,
    sourceMissingMessage:
      locale === "zh"
        ? "先连接一个邮箱，这样这份判据会和具体邮箱一起保存。"
        : locale === "ja"
          ? "まずメールボックスを接続すると、この判定文書をそのメールボックスと一緒に保存できます。"
          : "Connect a mailbox first so this profile can be saved with that source.",
    savedAtLabel: locale === "zh" ? "最近保存" : locale === "ja" ? "最終保存" : "Last saved",
    questionUrgentStep: locale === "zh" ? "卡片 01" : locale === "ja" ? "カード 01" : "Card 01",
    questionUrgentPrompt:
      locale === "zh"
        ? "什么样的字眼或语气，会立刻触发你的“紧急”雷达？"
        : locale === "ja"
          ? "どんな言い回しやトーンが、あなたの“緊急”レーダーを即座に反応させますか。"
          : "What words or tone immediately trigger your urgency radar?",
    questionUrgentHint:
      locale === "zh"
        ? "比如“务必”“尽快”“最后通牒”，或者全大写标题。可以按逗号或换行列出。"
        : locale === "ja"
          ? "たとえば「至急」「必須」「最終通知」、あるいは全大文字の件名など。カンマか改行で区切って入力できます。"
          : "Examples: “must”, “as soon as possible”, “final notice”, or all-caps subjects. Separate with commas or line breaks.",
    questionImportantStep: locale === "zh" ? "卡片 02" : locale === "ja" ? "カード 02" : "Card 02",
    questionImportantPrompt:
      locale === "zh"
        ? "有哪些深层关切，仅看标题很难发现，但对你其实是最高优先级？"
        : locale === "ja"
          ? "件名だけでは分かりにくいけれど、実は最優先になる深い関心事は何ですか。"
          : "Which hidden topics matter deeply to you, even when the subject line looks ordinary?",
    questionImportantHint:
      locale === "zh"
        ? "例如奖学金、实验室安全、导师安排、课程成绩。Agent 会用它们来提升重要度。"
        : locale === "ja"
          ? "たとえば奨学金、研究室安全、指導教員からの依頼、成績など。これらは重要度を引き上げる材料になります。"
          : "Examples: scholarships, lab safety, advisor requests, course grades. These directly raise importance.",
    questionWindowStep: locale === "zh" ? "卡片 03" : locale === "ja" ? "カード 03" : "Card 03",
    questionWindowPrompt:
      locale === "zh"
        ? "你对时间窗口的容忍度是多少？"
        : locale === "ja"
          ? "締切や会議の残り時間、どの時点で強く通知してほしいですか。"
          : "How much time tolerance do you want before a deadline or meeting becomes urgent?",
    questionWindowHint:
      locale === "zh"
        ? "当邮件里识别到 DDL、会议、考试时间时，只要剩余时间进入这个窗口，就会显著提高紧急度。"
        : locale === "ja"
          ? "メール内で DDL・会議・試験時刻を検出したとき、この閾値以内なら緊急度を強く引き上げます。"
          : "If a detected DDL, meeting, or exam falls inside this window, urgency will be pushed up sharply.",
    questionVipStep: locale === "zh" ? "卡片 04" : locale === "ja" ? "カード 04" : "Card 04",
    questionVipPrompt:
      locale === "zh"
        ? "哪些人的来信必须无条件进入最高优先级？"
        : locale === "ja"
          ? "誰からのメールなら無条件で最優先にしたいですか。"
          : "Which senders should always land in the highest priority bucket?",
    questionVipHint:
      locale === "zh"
        ? "可以写姓名、头衔、邮箱、邮箱后缀，例如导师、辅导员、教务处邮箱。"
        : locale === "ja"
          ? "氏名、役職、メール、ドメインなどを書けます。たとえば指導教員、教務、研究室管理者など。"
          : "Use names, titles, email addresses, or domain suffixes like your advisor, student office, or department.",
    questionRejectStep: locale === "zh" ? "卡片 05" : locale === "ja" ? "カード 05" : "Card 05",
    questionRejectPrompt:
      locale === "zh"
        ? "遇到你内心想要婉拒的请求时，你通常更希望系统怎么帮你？"
        : locale === "ja"
          ? "本当は断りたい依頼が来たとき、システムにどう振る舞ってほしいですか。"
          : "When a request arrives that you would rather decline, how should the system help?",
    questionRejectHint:
      locale === "zh"
        ? "选择“降级处理”时，系统会倾向把这类邮件往低优先级推；选择“准备草稿”时，后续自动回复能力会优先参考它。"
        : locale === "ja"
          ? "「優先度を下げる」を選ぶと低優先度寄りに判定し、「草稿を用意する」を選ぶと今後の自動返信機能がそれを優先します。"
          : "Choose “downgrade” to push these mails lower in priority, or “draft reply” to prepare future decline drafts.",
    questionNoiseStep: locale === "zh" ? "卡片 06" : locale === "ja" ? "カード 06" : "Card 06",
    questionNoisePrompt:
      locale === "zh"
        ? "哪些来源的邮件在你眼中属于纯噪音？"
        : locale === "ja"
          ? "あなたにとって“純粋なノイズ”に見える送信元は何ですか。"
          : "Which senders or sources are pure noise in your eyes?",
    questionNoiseHint:
      locale === "zh"
        ? "例如图书馆推荐、社团群发、促销活动。系统会优先降低它们的重要度。"
        : locale === "ja"
          ? "たとえば図書館の週刊おすすめ、サークル配信、販促メールなど。重要度を優先的に下げます。"
          : "Examples: weekly library digests, club blasts, promotional mail. These will be down-ranked first.",
    questionNotesStep: locale === "zh" ? "卡片 07" : locale === "ja" ? "カード 07" : "Card 07",
    questionNotesPrompt:
      locale === "zh"
        ? "还有什么是 Mery 应该记住的个人判断习惯？"
        : locale === "ja"
          ? "ほかに Mery が覚えておくべき判断習慣はありますか。"
          : "Anything else Mery should remember about how you judge mail?",
    questionNotesHint:
      locale === "zh"
        ? "例如“周末我不想被低优先级打扰”“所有带附件的实验安排都更重要”。"
        : locale === "ja"
          ? "たとえば「週末は低優先度で邪魔しないでほしい」「添付付きの実験安排は重要」など。"
          : "Examples: “don’t bother me with low-priority mail on weekends” or “lab plans with attachments matter more.”",
    rejectDowngrade: locale === "zh" ? "降级处理" : locale === "ja" ? "優先度を下げる" : "Downgrade first",
    rejectDraft: locale === "zh" ? "准备草稿" : locale === "ja" ? "草稿を用意する" : "Draft a reply",
  };

  const docsReadinessNote =
    personalizationCompleted && baselineReady
      ? copy.docsReadyNote
      : personalizationCompleted
        ? copy.docsProfileReadyNote
        : copy.docsKnowledgeReadyNote;

  const featureItems = [
    locale === "zh"
      ? "在你设定的时间，把当天邮件重点、紧急事项、DDL 和建议动作推送给你"
      : locale === "ja"
        ? "設定した時刻に、当日の重要メール、緊急事項、締切、推奨アクションを通知"
        : "Push today’s key mail, urgent items, deadlines, and suggested actions at your chosen time",
    locale === "zh"
      ? "按照你的个性化判据，把邮件自动分到未处理队列与艾森豪威尔四象限"
      : locale === "ja"
        ? "あなたの判定基準に沿って、未処理キューとアイゼンハワーマトリクスへ自動分類"
        : "Auto-bucket mail into the pending queue and Eisenhower quadrants using your own decision profile",
    locale === "zh"
      ? "识别日期、会议、考试和 DDL，并在进入你的提醒窗口时提升紧急度"
      : locale === "ja"
        ? "日付、会議、試験、締切を抽出し、あなたの通知ウィンドウに入ると緊急度を引き上げる"
        : "Extract dates, meetings, exams, and deadlines, then boost urgency when they enter your alert window",
    locale === "zh"
      ? "把重点邮件沉淀为可追溯的知识卡片与摘要"
      : locale === "ja"
        ? "重要メールを追跡可能な知識カードと要約へ変換"
        : "Turn important mail into reusable knowledge cards and summaries",
    locale === "zh"
      ? "让后续 Agent 问答优先直接读取本地总结结果与个性化判据"
      : locale === "ja"
        ? "今後の Agent 回答でローカル要約と個性化判定を優先参照"
        : "Let future agent answers read from both local summaries and your personalization profile first",
  ];

  const dayLabel = useCallback(
    (days: number) => {
      if (locale === "zh") return `近 ${days} 天`;
      if (locale === "ja") return `直近 ${days} 日`;
      return `${days} days`;
    },
    [locale]
  );

  const loadArtifacts = useCallback(async () => {
    const requestId = artifactRequestIdRef.current + 1;
    artifactRequestIdRef.current = requestId;
    if (!activeSourceId) {
      setArtifacts([]);
      setBaselineReady(false);
      setArtifactsError(null);
      setIsLoadingArtifacts(false);
      return;
    }

    setIsLoadingArtifacts(true);
    setArtifactsError(null);
    try {
      const params = new URLSearchParams({ sourceId: activeSourceId });
      const response = await fetch(`${apiBase}/mail-kb/artifacts?${params.toString()}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        artifacts?: KnowledgeBaseArtifact[];
        baselineStatus?: { backfillCompleted?: boolean } | null;
        result?: {
          artifacts?: KnowledgeBaseArtifact[];
          baselineStatus?: { backfillCompleted?: boolean } | null;
        };
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "Unable to read knowledge base artifact status");
      }
      if (requestId !== artifactRequestIdRef.current) {
        return;
      }
      setArtifacts(payload.artifacts ?? payload.result?.artifacts ?? []);
      setBaselineReady(
        Boolean(payload.baselineStatus?.backfillCompleted ?? payload.result?.baselineStatus?.backfillCompleted)
      );
    } catch (error) {
      if (requestId !== artifactRequestIdRef.current) {
        return;
      }
      setArtifacts([]);
      setBaselineReady(false);
      setArtifactsError(error instanceof Error ? error.message : "Unable to read artifact status");
    } finally {
      if (requestId === artifactRequestIdRef.current) {
        setIsLoadingArtifacts(false);
      }
    }
  }, [activeSourceId, apiBase]);

  const loadPersonalizationProfile = useCallback(async () => {
    const requestId = personalizationRequestIdRef.current + 1;
    personalizationRequestIdRef.current = requestId;

    if (!activeSourceId) {
      setPersonalizationDraft(createEmptyPersonalizationDraft());
      setPersonalizationArtifacts([]);
      setPersonalizationCompleted(false);
      setPersonalizationSavedAt(null);
      setPersonalizationError(null);
      setIsLoadingPersonalization(false);
      return;
    }

    setIsLoadingPersonalization(true);
    setPersonalizationError(null);
    try {
      const params = new URLSearchParams({ sourceId: activeSourceId });
      const response = await fetch(`${apiBase}/mail/personalization-profile?${params.toString()}`, {
        credentials: "include",
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, response, "Unable to load personalization profile"));
      }
      const profile = (payload as {
        result?: {
          profile?: MailPersonalizationProfile;
        };
      })?.result?.profile;
      if (!profile) {
        throw new Error("Personalization profile missing from response");
      }
      if (requestId !== personalizationRequestIdRef.current) {
        return;
      }
      setPersonalizationDraft(draftFromProfile(profile));
      setPersonalizationArtifacts(profile.completed ? (profile.artifacts as KnowledgeBaseArtifact[]) : []);
      setPersonalizationCompleted(profile.completed);
      setPersonalizationSavedAt(profile.completed ? profile.updatedAt : null);
    } catch (error) {
      if (requestId !== personalizationRequestIdRef.current) {
        return;
      }
      setPersonalizationDraft(createEmptyPersonalizationDraft());
      setPersonalizationArtifacts([]);
      setPersonalizationCompleted(false);
      setPersonalizationSavedAt(null);
      setPersonalizationError(error instanceof Error ? error.message : "Unable to load personalization profile");
    } finally {
      if (requestId === personalizationRequestIdRef.current) {
        setIsLoadingPersonalization(false);
      }
    }
  }, [activeSourceId, apiBase]);

  useEffect(() => {
    artifactRequestIdRef.current += 1;
    setArtifacts([]);
    setBaselineReady(false);
    setArtifactsError(null);
    setIsLoadingArtifacts(false);
  }, [activeSourceId]);

  useEffect(() => {
    personalizationRequestIdRef.current += 1;
    setPersonalizationDraft(createEmptyPersonalizationDraft());
    setPersonalizationArtifacts([]);
    setPersonalizationCompleted(false);
    setPersonalizationSavedAt(null);
    setPersonalizationError(null);
    setIsLoadingPersonalization(false);
  }, [activeSourceId]);

  useEffect(() => {
    void fetchKbStats();
    void loadArtifacts();
    void loadPersonalizationProfile();
  }, [fetchKbStats, loadArtifacts, loadPersonalizationProfile]);

  useEffect(() => {
    if (!activeSourceId) {
      setDailyDigestEnabled(true);
      setDigestTimeValue("20:00");
      setDigestTimeZone(browserTimeZone());
      setDigestPrefsError(null);
      setDigestPrefsSavedAt(null);
      return;
    }

    void fetchNotificationPrefs();
  }, [activeSourceId, fetchNotificationPrefs]);

  useEffect(() => {
    if (!notificationPrefs) {
      return;
    }

    setDailyDigestEnabled(notificationPrefs.dailyDigestEnabled);
    setDigestTimeValue(toTimeInputValue(notificationPrefs.digestHour, notificationPrefs.digestMinute));
    setDigestTimeZone(notificationPrefs.digestTimeZone || browserTimeZone());
    setDigestPrefsSavedAt(notificationPrefs.updatedAt ?? null);
    setDigestPrefsError(null);
  }, [notificationPrefs]);

  const handleStartSummary = async () => {
    setIsStarting(true);
    try {
      const nextJobId = await triggerSummarize({ windowDays: selectedDays });
      if (nextJobId) {
        setJobId(nextJobId);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleSaveDailyDigest = async () => {
    if (!activeSourceId) {
      setDigestPrefsError(copy.digestMissingSource);
      return;
    }

    const parsedTime = fromTimeInputValue(digestTimeValue);
    setIsSavingDigestPrefs(true);
    setDigestPrefsError(null);
    setDigestPrefsSavedAt(null);
    try {
      await updateNotificationPrefs({
        dailyDigestEnabled,
        digestHour: parsedTime.hour,
        digestMinute: parsedTime.minute,
        digestTimeZone: digestTimeZone.trim() || browserTimeZone(),
      });
      setDigestPrefsSavedAt(new Date().toISOString());
    } catch (error) {
      setDigestPrefsSavedAt(null);
      setDigestPrefsError(error instanceof Error ? error.message : "Unable to save daily digest preferences");
    } finally {
      setIsSavingDigestPrefs(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!activeSourceId) {
      setPersonalizationError(copy.sourceMissingMessage);
      return;
    }

    setIsSavingPersonalization(true);
    setPersonalizationError(null);
    try {
      const response = await fetch(`${apiBase}/mail/personalization-profile`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId: activeSourceId,
          completed: true,
          ...personalizationDraft,
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, response, "Unable to save personalization profile"));
      }
      const profile = (payload as {
        result?: {
          profile?: MailPersonalizationProfile;
        };
      })?.result?.profile;
      if (!profile) {
        throw new Error("Personalization profile missing from response");
      }

      setPersonalizationDraft(draftFromProfile(profile));
      setPersonalizationArtifacts(profile.artifacts as KnowledgeBaseArtifact[]);
      setPersonalizationCompleted(profile.completed);
      setPersonalizationSavedAt(profile.updatedAt);
    } catch (error) {
      setPersonalizationError(error instanceof Error ? error.message : "Unable to save personalization profile");
    } finally {
      setIsSavingPersonalization(false);
    }
  };

  return (
    <div className="space-y-6">
      <CalmSurface className="p-6 sm:p-7" beam>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <CalmSectionLabel>{copy.eyebrow}</CalmSectionLabel>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--ink)] sm:text-3xl">{copy.headline}</h2>
            <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{copy.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CalmPill tone={mailboxReady ? "info" : "warning"} pulse={!mailboxReady}>
                {mailboxReady ? copy.mailboxReady : copy.mailboxPending}
              </CalmPill>
              <CalmPill tone={personalizationCompleted ? "success" : "warning"} pulse={!personalizationCompleted}>
                {personalizationCompleted ? copy.profileReady : copy.profilePending}
              </CalmPill>
              <CalmPill tone={baselineReady ? "success" : "muted"} pulse={!baselineReady}>
                {baselineReady ? copy.docsReady : copy.docsPending}
              </CalmPill>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <CalmButton type="button" onClick={() => setCurrentView("settings")} variant="primary">
              {copy.openSettings}
            </CalmButton>
            <CalmButton type="button" onClick={onComplete} variant="secondary">
              {copy.skip}
            </CalmButton>
          </div>
        </div>
      </CalmSurface>

      <section className="grid gap-4 xl:grid-cols-2">
        <CalmSurface className="p-5">
          <CalmSectionLabel>{copy.sourceTitle}</CalmSectionLabel>
          <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{copy.sourceBody}</p>
          {activeSource ? (
            <div className="mt-4 rounded-[1rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
              {activeSource.ready ? copy.sourceReadyNote : copy.sourcePendingNote}
            </div>
          ) : (
            <div className="mt-4 rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-4 text-sm text-[color:var(--ink-subtle)]">
              {copy.sourceBody}
            </div>
          )}
        </CalmSurface>

        <CalmSurface className="p-5">
          <CalmSectionLabel>{copy.digestTitle}</CalmSectionLabel>
          <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{copy.digestBody}</p>

          <label className="mt-4 flex items-center gap-3 rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm font-medium text-[color:var(--ink)]">
            <input
              type="checkbox"
              checked={dailyDigestEnabled}
              onChange={(event) => setDailyDigestEnabled(event.target.checked)}
              disabled={!activeSourceId || isSavingDigestPrefs}
              className="h-4 w-4 rounded border-[color:var(--border-soft)] accent-[color:var(--button-primary)]"
            />
            {copy.digestEnable}
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-[color:var(--ink-muted)]">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">
                {copy.digestTimeLabel}
              </span>
              <TutorialInput
                type="time"
                value={digestTimeValue}
                onChange={(event) => setDigestTimeValue(event.target.value)}
                disabled={!activeSourceId || !dailyDigestEnabled || isSavingDigestPrefs}
              />
            </label>
            <label className="text-sm text-[color:var(--ink-muted)]">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">
                {copy.digestTimeZoneLabel}
              </span>
              <TutorialInput
                value={digestTimeZone}
                onChange={(event) => setDigestTimeZone(event.target.value)}
                disabled={!activeSourceId || !dailyDigestEnabled || isSavingDigestPrefs}
                placeholder="Asia/Shanghai"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <CalmButton
              type="button"
              onClick={() => {
                setDigestTimeZone(browserTimeZone());
              }}
              disabled={!activeSourceId || !dailyDigestEnabled || isSavingDigestPrefs}
              variant="secondary"
            >
              {copy.digestUseLocal}
            </CalmButton>
            <CalmButton
              type="button"
              onClick={() => void handleSaveDailyDigest()}
              disabled={!activeSourceId || isSavingDigestPrefs}
              variant="primary"
            >
              {isSavingDigestPrefs ? <LoadingSpinner size="sm" /> : null}
              {copy.digestSave}
            </CalmButton>
          </div>
          {digestPrefsError ? (
            <div className="mt-4 rounded-[1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-sm text-[color:var(--pill-urgent-ink)]">
              {digestPrefsError}
            </div>
          ) : null}
          {digestPrefsSavedAt ? (
            <div className="mt-4 rounded-[1rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] px-4 py-3 text-sm text-[color:var(--pill-success-ink)]">
              {copy.digestSaved} {copy.savedAtLabel}: {formatSavedAt(digestPrefsSavedAt, locale)}
            </div>
          ) : null}
        </CalmSurface>
      </section>

      <CalmSurface className="p-5 sm:p-6" beam>
        <div className="max-w-3xl">
          <CalmSectionLabel>{copy.profileTitle}</CalmSectionLabel>
          <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{copy.profileBody}</p>
        </div>

        {!activeSource ? (
          <div className="mt-5 rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-5 text-sm text-[color:var(--ink-subtle)]">
            {copy.profileEmpty}
          </div>
        ) : isLoadingPersonalization ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-[color:var(--ink-subtle)]">
            <LoadingSpinner size="sm" />
            {copy.profileLoading}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <TutorialPromptCard
              step={copy.questionUrgentStep}
              prompt={copy.questionUrgentPrompt}
              hint={copy.questionUrgentHint}
            >
              <TutorialTextarea
                value={personalizationDraft.urgentSignals}
                onChange={(event) =>
                  setPersonalizationDraft((current) => ({ ...current, urgentSignals: event.target.value }))
                }
                placeholder={
                  locale === "zh"
                    ? "务必、尽快、最后提醒、ACTION REQUIRED"
                    : locale === "ja"
                      ? "至急、必須、最終通知、ACTION REQUIRED"
                      : "must, asap, final notice, ACTION REQUIRED"
                }
              />
            </TutorialPromptCard>

            <TutorialPromptCard
              step={copy.questionImportantStep}
              prompt={copy.questionImportantPrompt}
              hint={copy.questionImportantHint}
            >
              <TutorialTextarea
                value={personalizationDraft.hiddenImportantTopics}
                onChange={(event) =>
                  setPersonalizationDraft((current) => ({
                    ...current,
                    hiddenImportantTopics: event.target.value,
                  }))
                }
                placeholder={
                  locale === "zh"
                    ? "奖学金、实验室安全、导师安排、课程成绩"
                    : locale === "ja"
                      ? "奨学金、研究室安全、指導教員、成績"
                      : "scholarship, lab safety, advisor requests, course grade"
                }
              />
            </TutorialPromptCard>

            <TutorialPromptCard
              step={copy.questionWindowStep}
              prompt={copy.questionWindowPrompt}
              hint={copy.questionWindowHint}
            >
              <div className="flex flex-wrap gap-2">
                {DEADLINE_OPTIONS.map((hours) => {
                  const active = personalizationDraft.deadlineAlertWindowHours === hours;
                  return (
                    <button
                      key={hours}
                      type="button"
                      onClick={() =>
                        setPersonalizationDraft((current) => ({ ...current, deadlineAlertWindowHours: hours }))
                      }
                      className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)] shadow-[var(--shadow-soft)]"
                          : "border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
                      }`}
                    >
                      {locale === "zh" ? `${hours} 小时` : locale === "ja" ? `${hours} 時間` : `${hours} hours`}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 max-w-[14rem]">
                <TutorialInput
                  type="number"
                  min={1}
                  max={24 * 14}
                  value={personalizationDraft.deadlineAlertWindowHours}
                  onChange={(event) =>
                    setPersonalizationDraft((current) => ({
                      ...current,
                      deadlineAlertWindowHours: Math.max(1, Number(event.target.value || 48)),
                    }))
                  }
                />
              </div>
            </TutorialPromptCard>

            <TutorialPromptCard step={copy.questionVipStep} prompt={copy.questionVipPrompt} hint={copy.questionVipHint}>
              <TutorialTextarea
                value={personalizationDraft.vipSenders}
                onChange={(event) =>
                  setPersonalizationDraft((current) => ({ ...current, vipSenders: event.target.value }))
                }
                placeholder={
                  locale === "zh"
                    ? "我的导师、辅导员、教务处、@faculty.school.edu"
                    : locale === "ja"
                      ? "指導教員、教務、研究室管理、@faculty.school.edu"
                      : "my advisor, student office, registrar, @faculty.school.edu"
                }
              />
            </TutorialPromptCard>

            <TutorialPromptCard
              step={copy.questionRejectStep}
              prompt={copy.questionRejectPrompt}
              hint={copy.questionRejectHint}
            >
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "downgrade_only", label: copy.rejectDowngrade },
                  { key: "draft_reject", label: copy.rejectDraft },
                ].map((option) => {
                  const active = personalizationDraft.softRejectMode === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setPersonalizationDraft((current) => ({
                          ...current,
                          softRejectMode: option.key as PersonalizationDraft["softRejectMode"],
                        }))
                      }
                      className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)] shadow-[var(--shadow-soft)]"
                          : "border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <TutorialTextarea
                className="mt-3"
                value={personalizationDraft.softRejectNotes}
                onChange={(event) =>
                  setPersonalizationDraft((current) => ({ ...current, softRejectNotes: event.target.value }))
                }
                placeholder={
                  locale === "zh"
                    ? "例如：非强制讲座、和我研究方向无关的合作邀请"
                    : locale === "ja"
                      ? "例: 任意参加の講演会、研究テーマと無関係な共同研究の誘い"
                      : "For example: optional lectures, collaborations unrelated to my work"
                }
              />
            </TutorialPromptCard>

            <TutorialPromptCard
              step={copy.questionNoiseStep}
              prompt={copy.questionNoisePrompt}
              hint={copy.questionNoiseHint}
            >
              <TutorialTextarea
                value={personalizationDraft.noiseSources}
                onChange={(event) =>
                  setPersonalizationDraft((current) => ({ ...current, noiseSources: event.target.value }))
                }
                placeholder={
                  locale === "zh"
                    ? "图书馆推荐、某社团群发、促销活动"
                    : locale === "ja"
                      ? "図書館の週刊おすすめ、サークル配信、販促メール"
                      : "library digest, club blast, promo campaign"
                }
              />
            </TutorialPromptCard>

            <TutorialPromptCard
              step={copy.questionNotesStep}
              prompt={copy.questionNotesPrompt}
              hint={copy.questionNotesHint}
            >
              <TutorialTextarea
                value={personalizationDraft.notes}
                onChange={(event) =>
                  setPersonalizationDraft((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder={
                  locale === "zh"
                    ? "例如：周末别因为低优先级消息打扰我"
                    : locale === "ja"
                      ? "例: 週末は低優先度メールで邪魔しないでほしい"
                      : "For example: don’t disturb me with low-priority mail on weekends"
                }
              />
            </TutorialPromptCard>

            <div className="flex flex-col gap-3 border-t border-[color:var(--border-soft)] pt-4">
              {personalizationError ? (
                <div className="rounded-[1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-sm text-[color:var(--pill-urgent-ink)]">
                  {personalizationError}
                </div>
              ) : null}
              {personalizationSavedAt ? (
                <div className="rounded-[1rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] px-4 py-3 text-sm text-[color:var(--pill-success-ink)]">
                  {copy.profileSaved} {copy.savedAtLabel}: {formatSavedAt(personalizationSavedAt, locale)}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <CalmButton type="button" onClick={() => void handleSaveProfile()} disabled={isSavingPersonalization} variant="primary">
                  {isSavingPersonalization ? <LoadingSpinner size="sm" /> : null}
                  {copy.profileSave}
                </CalmButton>
              </div>
            </div>
          </div>
        )}
      </CalmSurface>

      <CalmSurface className="p-5" beam>
        <CalmSectionLabel>{copy.summaryTitle}</CalmSectionLabel>
        <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{copy.summaryBody}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {DAY_OPTIONS.map((days) => {
            const active = selectedDays === days;
            return (
              <button
                key={days}
                type="button"
                onClick={() => setSelectedDays(days)}
                className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)] shadow-[var(--shadow-soft)]"
                    : "border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
                }`}
              >
                {dayLabel(days)}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <CalmButton
            type="button"
            onClick={() => {
              void handleStartSummary();
            }}
            disabled={!activeSourceId || isStarting}
            variant="primary"
          >
            {isStarting ? <LoadingSpinner size="sm" /> : null}
            {copy.start}
          </CalmButton>
          <CalmButton type="button" onClick={() => setCurrentView("stats")} variant="secondary">
            {copy.openResults}
          </CalmButton>
        </div>
      </CalmSurface>

      <section>
        <CalmSectionLabel>{copy.featuresTitle}</CalmSectionLabel>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {featureItems.map((item, index) => (
            <CalmSurface
              key={item}
              className={`p-4 ${index === 0 ? "md:col-span-2 xl:col-span-1" : ""}`}
              tone={index === 1 ? "info" : index === 2 ? "success" : index === 3 ? "warning" : "muted"}
            >
              <p className="text-sm leading-7 text-[color:var(--ink)]">{item}</p>
            </CalmSurface>
          ))}
        </div>
      </section>

      <CalmSurface className="p-5" beam>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <CalmSectionLabel>{copy.docsTitle}</CalmSectionLabel>
            <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{copy.docsDescription}</p>
          </div>
          {kbStats ? (
            <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--ink)]">
              {copy.statsSummary}
            </div>
          ) : null}
        </div>

        {isLoadingArtifacts || isLoadingPersonalization ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-[color:var(--ink-subtle)]">
            <LoadingSpinner size="sm" />
            {copy.docsLoading}
          </div>
        ) : artifactsError ? (
          <div className="mt-4 rounded-[1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-sm text-[color:var(--pill-urgent-ink)]">
            {artifactsError}
          </div>
        ) : visibleArtifacts.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visibleArtifacts.map((artifact) => (
              <div
                key={`${artifact.key}:${artifact.path}`}
                className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-4"
              >
                <p className="text-sm font-semibold text-[color:var(--ink)]">{artifact.label}</p>
                <p className="mt-2 break-all font-mono text-[11px] leading-5 text-[color:var(--ink-subtle)]">
                  {artifact.path}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-6 text-sm text-[color:var(--ink-subtle)]">
            {copy.docsEmpty}
          </div>
        )}

        {baselineReady || personalizationCompleted ? (
          <div className="mt-4 rounded-[1rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] px-4 py-3 text-sm text-[color:var(--pill-success-ink)]">
            {docsReadinessNote}
          </div>
        ) : null}
      </CalmSurface>

      {jobId ? (
        <MailKBSummaryModal
          jobId={jobId}
          onClose={(options) => {
            setJobId(null);
            if (options?.refresh === false) {
              return;
            }
            void fetchKbStats();
            void loadArtifacts();
          }}
        />
      ) : null}
    </div>
  );
}

export default TutorialView;
