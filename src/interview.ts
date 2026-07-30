import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractRequirements } from "./apply.js";
import { applicationArchivePath } from "./archive.js";

export type InterviewStage = "screening" | "technical" | "behavioral" | "onsite" | "final";

export interface InterviewInput {
  applicationKey: string;
  company: string;
  role: string;
  stage: InterviewStage;
  postingText: string;
  submittedMaterials: string[];
  approvedFacts: string[];
  research?: Array<{ fact: string; source: string; date: string }>;
  feedback: string[];
}

export interface InterviewQuestion {
  id: string;
  text: string;
  stage: InterviewStage;
  source: string;
}

export interface StarMapping {
  fact: string;
  situationPrompt: string;
  taskPrompt: string;
  actionPrompt: string;
  resultPrompt: string;
}

export interface InterviewPack {
  applicationKey: string;
  company: string;
  role: string;
  stage: InterviewStage;
  researchStatus: "available" | "unavailable";
  questions: InterviewQuestion[];
  starMappings: StarMapping[];
  sources: string[];
  feedback: string[];
}

const BASE_QUESTIONS: Record<InterviewStage, string[]> = {
  screening: ["Why are you interested in this role?", "What would you like to clarify about the team or process?"],
  technical: ["Walk through a technical design you owned.", "How would you test and operate a production service?"],
  behavioral: ["Describe a difficult collaboration and how you handled it.", "Tell me about a decision that did not go as planned."],
  onsite: ["How do you prioritize trade-offs with several stakeholders?", "What would your first 30 days in this role look like?"],
  final: ["Why is this role the right next step for you?", "What questions do you have for the decision maker?"],
};

export function buildInterviewPack(input: InterviewInput): InterviewPack {
  const requirements = extractRequirements(input.postingText);
  const questions = BASE_QUESTIONS[input.stage].map((text, index) => ({ id: `${input.stage}-${index + 1}`, text, stage: input.stage, source: "stage-protocol" }));
  for (const requirement of requirements) questions.push({ id: `${input.stage}-requirement-${requirement.id}`, text: `How would you demonstrate ${requirement.text}?`, stage: input.stage, source: `archived-posting:${requirement.id}` });
  const starMappings = input.approvedFacts.map((fact) => ({
    fact,
    situationPrompt: `What was the context for: ${fact}?`,
    taskPrompt: "What outcome or responsibility defined the task?",
    actionPrompt: "What did you personally do?",
    resultPrompt: "What measurable result or learning can you support?",
  }));
  const research = input.research ?? [];
  return {
    applicationKey: input.applicationKey,
    company: input.company,
    role: input.role,
    stage: input.stage,
    researchStatus: research.length ? "available" : "unavailable",
    questions,
    starMappings,
    sources: [...input.submittedMaterials, ...research.map((item) => item.source)],
    feedback: [...input.feedback],
  };
}

export interface MockTranscriptEntry {
  question: string;
  answer: string;
  feedback?: string;
}

export interface MockSession {
  pack: InterviewPack;
  index: number;
  transcript: MockTranscriptEntry[];
  currentQuestion: string | null;
}

export async function saveInterviewPack(cwd: string, pack: InterviewPack): Promise<string> {
  const archive = applicationArchivePath(cwd, pack.applicationKey);
  await mkdir(archive, { recursive: true });
  const path = join(archive, `interview-prep-${pack.stage}.md`);
  const questions = pack.questions.map((question) => `- ${question.text} (${question.source})`).join("\n");
  const mappings = pack.starMappings.map((mapping) => `- ${mapping.fact}: ${mapping.situationPrompt}`).join("\n");
  await writeFile(path, `# Interview preparation: ${pack.role} at ${pack.company}\n\nStage: ${pack.stage}\nResearch: ${pack.researchStatus}\n\n## Questions\n${questions}\n\n## STAR evidence prompts\n${mappings}\n`, { encoding: "utf8", flag: "w" });
  return path;
}

export function startMockInterview(pack: InterviewPack): MockSession {
  return { pack, index: 0, transcript: [], currentQuestion: pack.questions[0]?.text ?? null };
}

export function answerMockQuestion(session: MockSession, answer: string, feedback?: string): MockSession {
  const question = session.currentQuestion;
  if (!question) return session;
  const index = session.index + 1;
  return { ...session, index, transcript: [...session.transcript, { question, answer, feedback }], currentQuestion: session.pack.questions[index]?.text ?? null };
}
