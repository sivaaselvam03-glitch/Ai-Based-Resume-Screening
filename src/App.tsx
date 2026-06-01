import {
  BarChart3,
  Brain,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Gauge,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type CandidateStatus = "New" | "Shortlisted" | "Interview" | "Offer" | "Rejected";
type CandidateSource = "LinkedIn" | "Referral" | "Job Board" | "Career Site" | "Uploaded";

type ScoreBreakdown = {
  skills: number;
  experience: number;
  education: number;
  semantic: number;
  culture: number;
};

type Candidate = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  source: CandidateSource;
  experienceYears: number;
  education: string;
  skills: string[];
  score: number;
  breakdown: ScoreBreakdown;
  status: CandidateStatus;
  summary: string;
  strengths: string[];
  risks: string[];
  biasFlags: string[];
  questions: string[];
  appliedAt: string;
};

type JobProfile = {
  title: string;
  level: "Junior" | "Mid" | "Senior" | "Lead";
  location: string;
  requiredSkills: string;
  niceSkills: string;
  description: string;
};

type ScreeningSettings = {
  blindMode: boolean;
  biasAudit: boolean;
  explainability: boolean;
  generateQuestions: boolean;
};

type UploadedResumePreview = {
  fileLabel: string;
  details: string;
  text: string;
  candidateIds: string[];
};

const skillCatalog = [
  "Python",
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "FastAPI",
  "Django",
  "Flask",
  "SQL",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "AWS",
  "Azure",
  "Docker",
  "Kubernetes",
  "Git",
  "CI/CD",
  "Machine Learning",
  "Deep Learning",
  "NLP",
  "TensorFlow",
  "PyTorch",
  "Pandas",
  "NumPy",
  "Spark",
  "Tableau",
  "Power BI",
  "Figma",
  "Agile",
  "Leadership",
  "Communication",
  "REST API",
  "GraphQL",
  "Microservices",
  "Data Analysis",
  "MLOps",
  "LangChain",
  "OpenAI",
];

const stopWords = new Set([
  "and",
  "the",
  "with",
  "for",
  "that",
  "this",
  "from",
  "will",
  "have",
  "has",
  "are",
  "our",
  "you",
  "your",
  "into",
  "using",
  "build",
  "work",
  "team",
  "role",
]);

const statusOrder: CandidateStatus[] = ["New", "Shortlisted", "Interview", "Offer", "Rejected"];

const initialJob: JobProfile = {
  title: "Senior AI Engineer",
  level: "Senior",
  location: "Bengaluru / Remote",
  requiredSkills: "Python, FastAPI, Machine Learning, NLP, PostgreSQL, Docker, AWS",
  niceSkills: "React, MLOps, LangChain, OpenAI, Kubernetes",
  description:
    "Build production AI systems for resume parsing, semantic matching, scoring explainability, analytics, and fair screening. Own APIs, data pipelines, model evaluation, and cross-functional delivery.",
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

async function extractPdfText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const textItems = content.items
        .flatMap((item) => {
          if (!("str" in item) || typeof item.str !== "string" || !("transform" in item) || !Array.isArray(item.transform)) {
            return [];
          }
          return [
            {
              text: item.str.trim(),
              x: Number(item.transform[4] ?? 0),
              y: Number(item.transform[5] ?? 0),
            },
          ];
        })
        .filter((item) => item.text);
      const rows: { y: number; items: { text: string; x: number }[] }[] = [];

      textItems
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .forEach((item) => {
          const row = rows.find((current) => Math.abs(current.y - item.y) <= 4);
          if (row) {
            row.items.push({ text: item.text, x: item.x });
            row.y = (row.y + item.y) / 2;
          } else {
            rows.push({ y: item.y, items: [{ text: item.text, x: item.x }] });
          }
        });

      pages.push(
        rows
          .sort((a, b) => b.y - a.y)
          .map((row) =>
            row.items
              .sort((a, b) => a.x - b.x)
              .map((item) => item.text)
              .join(" "),
          )
          .join("\n"),
      );
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages
    .join("\n\n")
    .replace(/\s*@\s*/g, "@")
    .replace(/\s*\.\s*(?=[A-Za-z]{2,}\b)/g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readResumeFile(file: File) {
  const extension = fileExtension(file.name);
  if (extension === ".pdf" || file.type === "application/pdf") {
    return extractPdfText(file);
  }
  if ([".txt", ".md", ".csv"].includes(extension) || file.type.startsWith("text/")) {
    return file.text();
  }
  throw new Error("Unsupported file type. Use TXT, MD, CSV, or text-based PDF.");
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ");
}

function tokenize(text: string) {
  return normalize(text)
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
}

function parseSkillInput(input: string) {
  return input
    .split(/[,;\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractEmail(text: string) {
  const candidates = [
    text,
    text.replace(/\s*([@._%+-])\s*/g, "$1"),
    text.replace(/\s+/g, ""),
  ];
  for (const candidate of candidates) {
    const match = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match) return match[0].toLowerCase();
  }
  return "not-provided@example.com";
}

function extractPhone(text: string) {
  return text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? "Not provided";
}

function nameFromEmail(email: string) {
  if (email === "not-provided@example.com") return "";
  const localPart = email
    .split("@")[0]
    .replace(/\d+/g, " ")
    .replace(/[._%+-]+/g, " ")
    .replace(/\b(resume|cv|mail|email|official)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return localPart.length >= 3 ? toTitleCase(localPart) : "";
}

function nameFromFileName(fileName: string) {
  const cleaned = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\b(?:resume|cv|profile|updated|final|copy)\b/gi, " ")
    .replace(/\d+/g, " ")
    .replace(/[-_()[\].]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /[A-Za-z]{3,}/.test(cleaned) ? toTitleCase(cleaned) : "";
}

function extractName(text: string, fallback: string, email: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^(?:name|candidate)\s*[:\-]\s*/i, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const blockedWords = /(resume|curriculum|vitae|profile|summary|objective|email|phone|mobile|address|location|linkedin|github|portfolio|education|experience|skills|project|certification)/i;
  const firstLine = lines.slice(0, 12).find((line) => {
    const lettersOnly = line.replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim();
    const words = lettersOnly.split(/\s+/).filter(Boolean);
    return (
      /^[A-Za-z][A-Za-z .'-]{2,70}$/.test(lettersOnly) &&
      words.length <= 5 &&
      !blockedWords.test(lettersOnly) &&
      !/(engineer|developer|scientist|analyst|manager|lead|intern|consultant)/i.test(lettersOnly)
    );
  });
  if (firstLine) return toTitleCase(firstLine.replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim());
  return nameFromEmail(email) || nameFromFileName(fallback) || "New Candidate";
}

function extractLocation(text: string) {
  const locations = [
    "Bengaluru",
    "Bangalore",
    "Mumbai",
    "Pune",
    "Delhi",
    "Hyderabad",
    "Chennai",
    "Kolkata",
    "Remote",
    "Noida",
    "Gurugram",
  ];
  const lowerText = normalize(text);
  return locations.find((location) => lowerText.includes(location.toLowerCase())) ?? "Remote / Flexible";
}

function extractExperience(text: string) {
  const matches = [...text.matchAll(/(\d{1,2})\+?\s*(?:years|yrs|year)/gi)].map((match) => Number(match[1]));
  if (matches.length) return Math.max(...matches);
  const lowerText = normalize(text);
  if (lowerText.includes("lead") || lowerText.includes("principal")) return 8;
  if (lowerText.includes("senior")) return 5;
  if (lowerText.includes("junior") || lowerText.includes("intern")) return 1;
  return 2;
}

function extractEducation(text: string) {
  const lowerText = normalize(text);
  if (/(phd|doctorate)/i.test(text)) return "PhD";
  if (lowerText.includes("m.tech") || lowerText.includes("m.sc") || lowerText.includes("master")) return "Master's degree";
  if (lowerText.includes("b.tech") || lowerText.includes("b.e") || lowerText.includes("bachelor")) return "Bachelor's degree";
  if (lowerText.includes("diploma")) return "Diploma";
  return "Not specified";
}

function extractRole(text: string, jobTitle: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const roleLine = lines.slice(1, 4).find((line) => /(engineer|developer|scientist|analyst|designer|lead|manager)/i.test(line));
  return roleLine ?? jobTitle;
}

function extractSkills(text: string) {
  const lowerText = normalize(text);
  return skillCatalog.filter((skill) => lowerText.includes(normalize(skill)));
}

function semanticScore(resumeText: string, jobDescription: string) {
  if (!jobDescription.trim()) return 76;
  const resumeTerms = new Set(tokenize(resumeText));
  const jobTerms = [...new Set(tokenize(jobDescription))];
  if (!jobTerms.length) return 76;
  const matched = jobTerms.filter((term) => resumeTerms.has(term)).length;
  return clamp(50 + (matched / jobTerms.length) * 55, 35, 100);
}

function educationScore(education: string) {
  if (education === "PhD") return 96;
  if (education === "Master's degree") return 90;
  if (education === "Bachelor's degree") return 82;
  if (education === "Diploma") return 68;
  return 56;
}

function cultureScore(text: string) {
  const signals = ["lead", "collaborat", "mentor", "agile", "communicat", "own", "cross-functional", "stakeholder"];
  const lowerText = normalize(text);
  const matched = signals.filter((signal) => lowerText.includes(signal)).length;
  return clamp(58 + matched * 7, 45, 98);
}

function detectBiasFlags(text: string) {
  const flags: string[] = [];
  if (/\b(19[6-9]\d|20[0-1]\d)\b/.test(text)) flags.push("Graduation or age-proxy year detected");
  if (/\b(male|female|married|single|religion|caste|dob|date of birth)\b/i.test(text)) {
    flags.push("Personal demographic detail detected");
  }
  if (/\b(photo|passport|father|mother)\b/i.test(text)) flags.push("Identity detail should be hidden in blind review");
  return flags;
}

function buildQuestions(candidate: Candidate, job: JobProfile, matchedRequired: string[]) {
  const required = parseSkillInput(job.requiredSkills);
  const gaps = required.filter((skill) => !matchedRequired.includes(skill)).slice(0, 2);
  const strongest = candidate.skills.slice(0, 2).join(" and ") || "your strongest technical area";
  const questions = [
    `Walk us through a production project where you used ${strongest}.`,
    `How would you design a reliable resume parsing and scoring pipeline for this role?`,
    `Which quality metrics would you track to make sure the screening model stays fair and useful?`,
  ];
  gaps.forEach((gap) => questions.push(`What is your hands-on experience with ${gap}, and how would you ramp up if needed?`));
  return questions.slice(0, 5);
}

function scoreResume(
  resumeText: string,
  fileName: string,
  job: JobProfile,
  settings: ScreeningSettings,
  source: CandidateSource = "Uploaded",
): Candidate {
  const id = crypto.randomUUID();
  const foundSkills = extractSkills(resumeText);
  const required = parseSkillInput(job.requiredSkills);
  const nice = parseSkillInput(job.niceSkills);
  const matchedRequired = required.filter((skill) => foundSkills.some((found) => normalize(found) === normalize(skill)));
  const matchedNice = nice.filter((skill) => foundSkills.some((found) => normalize(found) === normalize(skill)));
  const experienceYears = extractExperience(resumeText);
  const targetExperience = { Junior: 1, Mid: 3, Senior: 5, Lead: 8 }[job.level];
  const education = extractEducation(resumeText);

  const skills = required.length
    ? clamp(40 + (matchedRequired.length / required.length) * 55 + matchedNice.length * 2, 25, 100)
    : clamp(64 + foundSkills.length * 3, 40, 100);
  const experience = clamp(72 - Math.abs(experienceYears - targetExperience) * 9 + (experienceYears >= targetExperience ? 16 : 0), 35, 100);
  const semantic = semanticScore(resumeText, job.description);
  const educationValue = educationScore(education);
  const culture = cultureScore(resumeText);
  const email = extractEmail(resumeText);
  const breakdown = {
    skills: Math.round(skills),
    experience: Math.round(experience),
    education: Math.round(educationValue),
    semantic: Math.round(semantic),
    culture: Math.round(culture),
  };
  const score = Math.round(
    breakdown.skills * 0.3 +
      breakdown.experience * 0.25 +
      breakdown.semantic * 0.2 +
      breakdown.education * 0.15 +
      breakdown.culture * 0.1,
  );
  const rawName = extractName(resumeText, fileName, email);
  const candidateShell = {
    id,
    name: settings.blindMode ? `Blind Candidate ${id.slice(0, 4).toUpperCase()}` : rawName,
    role: extractRole(resumeText, job.title),
    email: settings.blindMode ? "hidden@blind-review.local" : email,
    phone: settings.blindMode ? "Hidden" : extractPhone(resumeText),
    location: settings.blindMode ? "Hidden in blind mode" : extractLocation(resumeText),
    source,
    experienceYears,
    education,
    skills: foundSkills,
    score,
    breakdown,
    status: (score >= 82 ? "Shortlisted" : "New") as CandidateStatus,
    summary: "",
    strengths: [
      `${matchedRequired.length}/${Math.max(required.length, 1)} required skills matched`,
      `${experienceYears} years of relevant experience`,
      `${breakdown.semantic}% semantic alignment with the role`,
    ],
    risks: [
      ...(required.length && matchedRequired.length < required.length ? [`Missing: ${required.filter((skill) => !matchedRequired.includes(skill)).slice(0, 3).join(", ")}`] : []),
      ...(breakdown.experience < 70 ? ["Experience is below the target band"] : []),
      ...(foundSkills.length < 5 ? ["Limited explicit technical skill evidence"] : []),
    ],
    biasFlags: settings.biasAudit ? detectBiasFlags(resumeText) : [],
    questions: [] as string[],
    appliedAt: new Date().toISOString(),
  };
  const candidate: Candidate = {
    ...candidateShell,
    summary:
      score >= 85
        ? "Strong match with clear evidence across required skills, delivery experience, and role alignment."
        : score >= 70
          ? "Promising candidate with useful strengths and a few areas to verify during screening."
          : "Needs closer review before moving forward; the resume has notable gaps against this role.",
  };
  return {
    ...candidate,
    questions: settings.generateQuestions ? buildQuestions(candidate, job, matchedRequired) : [],
  };
}

function scoreClass(score: number) {
  if (score >= 85) return "excellent";
  if (score >= 72) return "good";
  if (score >= 60) return "watch";
  return "low";
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function ProgressBar({ value, tone = "blue" }: { value: number; tone?: "blue" | "green" | "amber" }) {
  return (
    <div className={`progress progress-${tone}`} aria-label={`${value}%`}>
      <span style={{ width: `${clamp(value)}%` }} />
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return <span className={`score-badge ${scoreClass(score)}`}>{score}</span>;
}

function StatusBadge({ status }: { status: CandidateStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>;
}

function App() {
  const defaultSettings: ScreeningSettings = {
    blindMode: false,
    biasAudit: true,
    explainability: true,
    generateQuestions: true,
  };
  const [job, setJob] = useState<JobProfile>(initialJob);
  const [settings, setSettings] = useState<ScreeningSettings>(defaultSettings);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [activeView, setActiveView] = useState<"screening" | "analytics" | "workflow">("screening");
  const [uploadState, setUploadState] = useState("Ready");
  const [uploadedPreview, setUploadedPreview] = useState<UploadedResumePreview | null>(null);

  const sortedCandidates = useMemo(
    () =>
      [...candidates]
        .filter((candidate) => {
          const q = query.trim().toLowerCase();
          const matchesQuery =
            !q ||
            candidate.name.toLowerCase().includes(q) ||
            candidate.role.toLowerCase().includes(q) ||
            candidate.skills.join(" ").toLowerCase().includes(q);
          return matchesQuery && candidate.score >= minScore;
        })
        .sort((a, b) => b.score - a.score),
    [candidates, minScore, query],
  );

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId) ?? sortedCandidates[0] ?? candidates[0];

  const metrics = useMemo(() => {
    const average = candidates.length ? Math.round(candidates.reduce((sum, candidate) => sum + candidate.score, 0) / candidates.length) : 0;
    const shortlisted = candidates.filter((candidate) => ["Shortlisted", "Interview", "Offer"].includes(candidate.status)).length;
    const biasQueue = candidates.filter((candidate) => candidate.biasFlags.length > 0).length;
    return { average, shortlisted, biasQueue };
  }, [candidates]);

  const funnelData = useMemo(
    () =>
      statusOrder.map((status) => ({
        name: status,
        value: candidates.filter((candidate) => candidate.status === status).length,
      })),
    [candidates],
  );

  const sourceData = useMemo(() => {
    const counts = candidates.reduce<Record<string, number>>((acc, candidate) => {
      acc[candidate.source] = (acc[candidate.source] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [candidates]);

  const modelQuality = [
    { name: "Week 1", accuracy: 87, fairness: 91 },
    { name: "Week 2", accuracy: 89, fairness: 90 },
    { name: "Week 3", accuracy: 92, fairness: 93 },
    { name: "Week 4", accuracy: 94, fairness: 95 },
  ];

  const footerColumns = [
    [
      {
        title: "Improve your resume",
        links: ["Score my resume", "Targeted resume"],
      },
      {
        title: "Write your resume",
        links: [
          "ATS resume templates",
          "ATS resume test",
          "ATS resume guide",
          "Resume helper",
          "Resume proofreader",
          "Rate my resume",
          "Resume grammar checker",
          "Resume optimizer",
          "Google Docs resume templates",
          "Sample resume bullet points",
          "Skills and keywords",
        ],
      },
    ],
    [
      {
        title: "Optimize your career",
        links: [
          "LinkedIn review",
          "Optimize your LinkedIn profile",
          "LinkedIn headline samples",
          "Networking emails",
          "AI cover letter generator",
          "Candidate ranking",
          "Recruitment analytics",
        ],
      },
    ],
    [
      {
        title: "Get to know us",
        links: ["Help center", "Get in touch", "For businesses", "For resume writers", "Affiliates"],
      },
      {
        title: "Enquiry",
        links: ["sivaaselvam@gmail.com"],
      },
      {
        title: "Legal",
        links: ["Testimonials", "Privacy", "Terms"],
      },
    ],
  ];

  function updateJob<K extends keyof JobProfile>(key: K, value: JobProfile[K]) {
    setJob((current) => ({ ...current, [key]: value }));
  }

  function updateStatus(candidateId: string, status: CandidateStatus) {
    setCandidates((current) =>
      current.map((candidate) => (candidate.id === candidateId ? { ...candidate, status } : candidate)),
    );
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploadState(`Reading ${files.length} file${files.length > 1 ? "s" : ""}...`);
    const analyzed: Candidate[] = [];
    const previewTexts: string[] = [];
    const skippedFiles: string[] = [];
    for (const file of files) {
      try {
        const text = (await readResumeFile(file)).trim();
        if (text.length < 30) {
          skippedFiles.push(`${file.name}: no readable resume text found`);
          continue;
        }
        analyzed.push(scoreResume(text, file.name, job, settings));
        previewTexts.push(`File: ${file.name}\n\n${text}`);
      } catch (error) {
        skippedFiles.push(`${file.name}: ${error instanceof Error ? error.message : "could not be read"}`);
      }
    }
    if (!analyzed.length) {
      setUploadedPreview(null);
      setUploadState(skippedFiles.length ? skippedFiles.join(" ") : "No readable resume text found.");
      event.target.value = "";
      return;
    }
    const previewText = previewTexts.join("\n\n---\n\n");
    setCandidates((current) => [...analyzed, ...current]);
    setSelectedId(analyzed[0]?.id ?? selectedId);
    setMinScore(0);
    setUploadedPreview({
      fileLabel: files.length === 1 ? files[0].name : `${files[0].name} + ${files.length - 1} more`,
      details: `${files.length} file${files.length > 1 ? "s" : ""} | ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))}`,
      text: previewText,
      candidateIds: analyzed.map((candidate) => candidate.id),
    });
    setUploadState(
      `${analyzed.length} resume${analyzed.length > 1 ? "s" : ""} analyzed. Uploaded text is shown below.${
        skippedFiles.length ? ` ${skippedFiles.length} file${skippedFiles.length > 1 ? "s were" : " was"} skipped.` : ""
      }`,
    );
    event.target.value = "";
  }

  function undoUpload() {
    if (!uploadedPreview) return;
    setCandidates((current) => current.filter((candidate) => !uploadedPreview.candidateIds.includes(candidate.id)));
    setSelectedId((current) => (uploadedPreview.candidateIds.includes(current) ? "" : current));
    setUploadedPreview(null);
    setUploadState("Upload undone.");
  }

  function exportCsv() {
    const header = ["Name", "Role", "Score", "Status", "Experience", "Skills", "Source"];
    const rows = candidates.map((candidate) => [
      candidate.name,
      candidate.role,
      String(candidate.score),
      candidate.status,
      String(candidate.experienceYears),
      candidate.skills.join(" | "),
      candidate.source,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "screened-candidates.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Brain size={24} />
          </div>
          <div>
            <p>TalentLens</p>
            <h1>AI Resume Screening System</h1>
          </div>
        </div>
        <nav className="view-tabs" aria-label="Main views">
          <button className={activeView === "screening" ? "active" : ""} onClick={() => setActiveView("screening")}>
            <FileText size={16} /> Screening
          </button>
          <button className={activeView === "analytics" ? "active" : ""} onClick={() => setActiveView("analytics")}>
            <BarChart3 size={16} /> Analytics
          </button>
          <button className={activeView === "workflow" ? "active" : ""} onClick={() => setActiveView("workflow")}>
            <CalendarClock size={16} /> Workflow
          </button>
        </nav>
      </header>

      <section className="metrics-grid" aria-label="Screening metrics">
        <MetricCard icon={<Users size={20} />} label="Candidate Pool" value={String(candidates.length)} detail="active profiles" />
        <MetricCard icon={<Gauge size={20} />} label="Average Score" value={`${metrics.average}%`} detail="weighted AI match" />
        <MetricCard icon={<UserRoundCheck size={20} />} label="Recommended" value={String(metrics.shortlisted)} detail="ready for next step" />
        <MetricCard icon={<ShieldCheck size={20} />} label="Bias Review" value={String(metrics.biasQueue)} detail="needs blind audit" />
      </section>

      {activeView === "screening" && (
        <section className="screening-layout">
          <aside className="panel control-panel">
            <div className="panel-heading">
              <SlidersHorizontal size={18} />
              <h2>Role Setup</h2>
            </div>
            <label>
              Job title
              <input value={job.title} onChange={(event) => updateJob("title", event.target.value)} />
            </label>
            <div className="field-row">
              <label>
                Level
                <select value={job.level} onChange={(event) => updateJob("level", event.target.value as JobProfile["level"])}>
                  <option>Junior</option>
                  <option>Mid</option>
                  <option>Senior</option>
                  <option>Lead</option>
                </select>
              </label>
              <label>
                Location
                <input value={job.location} onChange={(event) => updateJob("location", event.target.value)} />
              </label>
            </div>
            <label>
              Required skills
              <textarea value={job.requiredSkills} onChange={(event) => updateJob("requiredSkills", event.target.value)} rows={3} />
            </label>
            <label>
              Nice-to-have skills
              <textarea value={job.niceSkills} onChange={(event) => updateJob("niceSkills", event.target.value)} rows={2} />
            </label>
            <label>
              Job description
              <textarea value={job.description} onChange={(event) => updateJob("description", event.target.value)} rows={5} />
            </label>

            <div className="settings-grid">
              {[
                ["blindMode", "Blind mode"],
                ["biasAudit", "Bias audit"],
                ["explainability", "Explain scores"],
                ["generateQuestions", "Interview questions"],
              ].map(([key, label]) => (
                <label className="toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={settings[key as keyof ScreeningSettings]}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="upload-box">
              <Upload size={20} />
              <strong>Upload Resume</strong>
              <p>{uploadState}</p>
              <input type="file" multiple accept=".txt,.md,.csv,.pdf" onChange={handleFiles} />
            </div>
            {uploadedPreview && (
              <section className="uploaded-resume-section" aria-label="Uploaded resume preview">
                <div className="uploaded-file-preview">
                  <div>
                    <span>Uploaded file</span>
                    <strong>{uploadedPreview.fileLabel}</strong>
                    <small>{uploadedPreview.details}</small>
                  </div>
                  <button type="button" onClick={undoUpload}>
                    <RotateCcw size={15} /> Undo
                  </button>
                </div>
                <label>
                  Uploaded resume text
                  <textarea value={uploadedPreview.text} rows={7} readOnly />
                </label>
              </section>
            )}
          </aside>

          <section className="results-workspace">
            <section className="panel candidate-panel">
              <div className="candidate-toolbar">
                <div className="panel-heading">
                  <Filter size={18} />
                  <h2>Ranked Candidates</h2>
                </div>
                <button onClick={exportCsv}>
                  <Download size={16} /> Export
                </button>
              </div>
              <div className="filters">
                <label className="search-field">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills or candidates" />
                </label>
                <label className="range-field">
                  Min score {minScore}
                  <input type="range" min="0" max="100" value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} />
                </label>
              </div>
              <div className="candidate-list">
                {sortedCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    className={`candidate-row ${selectedCandidate?.id === candidate.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(candidate.id)}
                  >
                    <div className="candidate-main">
                      <ScoreBadge score={candidate.score} />
                      <div>
                        <strong>{candidate.name}</strong>
                        <p>{candidate.role}</p>
                      </div>
                    </div>
                    <div className="candidate-meta">
                      <StatusBadge status={candidate.status} />
                      <span>{candidate.experienceYears} yrs</span>
                      <span>{candidate.skills.slice(0, 3).join(", ") || "Skills pending"}</span>
                    </div>
                  </button>
                ))}
                {!sortedCandidates.length && (
                  <p className="empty-state">
                    {candidates.length ? "No candidates match the current filters. Lower the minimum score." : "Upload resumes to see ranked candidates here."}
                  </p>
                )}
              </div>
            </section>

            <aside className="panel detail-panel">
              {selectedCandidate ? (
                <>
                  <div className="profile-head">
                    <div>
                      <p>{selectedCandidate.source}</p>
                      <h2>{selectedCandidate.name}</h2>
                      <span>{selectedCandidate.role}</span>
                    </div>
                    <ScoreBadge score={selectedCandidate.score} />
                  </div>
                  <p className="summary">{selectedCandidate.summary}</p>
                  <div className="contact-grid">
                    <span>
                      <Mail size={14} /> {selectedCandidate.email}
                    </span>
                    <span>{selectedCandidate.location}</span>
                  </div>
                  <div className="stage-actions">
                    {statusOrder.map((status) => (
                      <button
                        key={status}
                        className={selectedCandidate.status === status ? "active" : ""}
                        onClick={() => updateStatus(selectedCandidate.id, status)}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                  <section className="detail-block">
                    <h3>Score Breakdown</h3>
                    {Object.entries(selectedCandidate.breakdown).map(([key, value]) => (
                      <div className="breakdown-row" key={key}>
                        <span>{key}</span>
                        <ProgressBar value={value} tone={value >= 80 ? "green" : value >= 65 ? "blue" : "amber"} />
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </section>
                  <section className="detail-block">
                    <h3>Skills</h3>
                    <div className="tag-cloud">
                      {selectedCandidate.skills.map((skill) => (
                        <span key={skill}>{skill}</span>
                      ))}
                    </div>
                  </section>
                  <section className="detail-block two-column">
                    <div>
                      <h3>Strengths</h3>
                      <ul>
                        {selectedCandidate.strengths.map((item) => (
                          <li key={item}>
                            <CheckCircle2 size={15} /> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3>Risks</h3>
                      <ul>
                        {(selectedCandidate.risks.length ? selectedCandidate.risks : ["No major risk found"]).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                  <section className="detail-block">
                    <h3>Bias Review</h3>
                    <div className="review-box">
                      <ShieldCheck size={16} />
                      <span>
                        {selectedCandidate.biasFlags.length
                          ? selectedCandidate.biasFlags.join("; ")
                          : "No protected-attribute signals found in this resume text."}
                      </span>
                    </div>
                  </section>
                  <section className="detail-block">
                    <h3>Interview Questions</h3>
                    <ol>
                      {selectedCandidate.questions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ol>
                  </section>
                </>
              ) : (
                <p className="empty-state">Select a candidate to see screening detail.</p>
              )}
            </aside>
          </section>
        </section>
      )}

      {activeView === "analytics" && (
        <section className="analytics-grid">
          <article className="panel chart-panel">
            <div className="panel-heading">
              <BarChart3 size={18} />
              <h2>Hiring Funnel</h2>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#0f8a6d" />
              </BarChart>
            </ResponsiveContainer>
          </article>
          <article className="panel chart-panel">
            <div className="panel-heading">
              <Users size={18} />
              <h2>Source Mix</h2>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" outerRadius={92} label>
                  {sourceData.map((entry, index) => (
                    <Cell key={entry.name} fill={["#0f8a6d", "#277c78", "#4f8f5f", "#9b6b12", "#6b716d"][index % 5]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </article>
          <article className="panel chart-panel wide">
            <div className="panel-heading">
              <Gauge size={18} />
              <h2>Model Quality</h2>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={modelQuality}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis domain={[70, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="accuracy" stroke="#0f8a6d" strokeWidth={3} />
                <Line type="monotone" dataKey="fairness" stroke="#277c78" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </article>
        </section>
      )}

      {activeView === "workflow" && (
        <section className="workflow-grid">
          {statusOrder.map((status) => (
            <article className="panel workflow-column" key={status}>
              <div className="panel-heading">
                <CalendarClock size={18} />
                <h2>{status}</h2>
              </div>
              {candidates
                .filter((candidate) => candidate.status === status)
                .sort((a, b) => b.score - a.score)
                .map((candidate) => (
                  <button className="workflow-card" key={candidate.id} onClick={() => setSelectedId(candidate.id)}>
                    <div>
                      <strong>{candidate.name}</strong>
                      <span>{candidate.role}</span>
                    </div>
                    <ScoreBadge score={candidate.score} />
                  </button>
                ))}
              {!candidates.some((candidate) => candidate.status === status) && <p className="empty-state">No candidates here yet.</p>}
            </article>
          ))}
        </section>
      )}

      <footer className="site-footer" aria-label="Footer keyword links">
        <div className="footer-inner">
          {footerColumns.map((column, columnIndex) => (
            <div className="footer-column" key={columnIndex}>
              {column.map((group) => (
                <section className="footer-group" key={group.title}>
                  <h2>{group.title}</h2>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link}>
                        {link === "sivaaselvam@gmail.com" ? (
                          <a href="mailto:sivaaselvam@gmail.com">
                            <Mail size={16} /> {link}
                          </a>
                        ) : (
                          <a href="#">{link}</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}
        </div>
      </footer>
    </main>
  );
}

export default App;
