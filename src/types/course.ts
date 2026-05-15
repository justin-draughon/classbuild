export type EducationLevel =
  | 'high-school'
  | 'first-year'
  | 'advanced-undergrad'
  | 'postgraduate'
  | 'professional'
  | 'general-public';

export type PriorKnowledge = 'none' | 'some' | 'significant';

export type ChapterLength = 'concise' | 'standard' | 'comprehensive';

export type TeachingEnvironment = 'lecture-theatre' | 'collaborative' | 'flat-classroom' | 'online' | '';

export interface CourseSetup {
  topic: string;
  specificTopics?: string;
  avoidTopics?: string;
  textbookReference?: string;
  educationLevel: EducationLevel;
  priorKnowledge: PriorKnowledge;
  cohortSize: number;
  learnerNotes?: string;
  teachingEnvironment: TeachingEnvironment;
  environmentNotes?: string;
  numChapters: number;
  chapterLength: ChapterLength;
  widgetsPerChapter: number;
  themeId?: string;
  voiceId?: string;
}

export type SciencePrinciple =
  | 'spacing'
  | 'interleaving'
  | 'retrieval'
  | 'examples'
  | 'dual-coding';

export interface ScienceAnnotation {
  principle: SciencePrinciple;
  description: string;
  relatedChapters?: number[];
}

export interface WidgetSpec {
  title: string;
  description: string;
  concept: string;
  rationale: string;
}

export interface ChapterSyllabus {
  number: number;
  title: string;
  narrative: string;
  keyConcepts: string[];
  widgets: WidgetSpec[];
  scienceAnnotations: ScienceAnnotation[];
  spacingConnections: number[]; // chapter numbers this connects back to
}

export interface Syllabus {
  courseTitle: string;
  courseOverview: string;
  chapters: ChapterSyllabus[];
}

export interface ResearchSource {
  title: string;
  authors: string;
  year: string;
  url?: string;
  doi?: string;
  summary: string;
  relevance: string;
  isVerified: boolean; // false = AI-generated, needs verification
}

export interface ResearchDossier {
  chapterNumber: number;
  sources: ResearchSource[];
  synthesisNotes: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface InClassQuizQuestion {
  question: string;
  correctAnswer: string;
  correctFeedback: string;
  distractors: Array<{
    text: string;
    feedback: string;
  }>;
}

// ── Weekly Challenge types ──

export type ChallengeQuestionType =
  | 'mcq' | 'two-stage' | 'assertion-reason'
  | 'agreement-matrix' | 'confidence-weighted'
  | 'slider-estimation' | 'boss';

export type ChallengeTier = 'warmup' | 'core' | 'challenge' | 'boss';

export type AssertionReasonRelationship =
  | 'both-true-reason-explains'
  | 'both-true-reason-independent'
  | 'a-true-b-false'
  | 'a-false-b-true'
  | 'both-false';

export type AgreementCategory = 'always' | 'sometimes' | 'never';

export interface ChallengeQuestionBase {
  type: ChallengeQuestionType;
  tier: ChallengeTier;
  stem: string;
  feedback: { correct: string; incorrect: string; wrongReason?: string };
  difficulty: 1 | 2 | 3;
  isSpacedReview?: boolean;
  sourceChapter?: number;
  /** 1-2 alternative versions of this question. At runtime one variant is randomly
   *  selected and its fields merged over the base question, producing a unique instance
   *  per attempt. Fields not present in the variant fall through to the base. */
  variants?: Array<Record<string, unknown>>;
}

export interface ChallengeMcq extends ChallengeQuestionBase {
  type: 'mcq';
  options: string[];
  correctIndex: number;
}

export interface ChallengeTwoStage extends ChallengeQuestionBase {
  type: 'two-stage' | 'boss';
  options: string[];
  correctIndex: number;
  justifications: string[];
  correctJustificationIndex: number;
}

export interface ChallengeAssertionReason extends ChallengeQuestionBase {
  type: 'assertion-reason';
  assertion: string;
  reason: string;
  correctRelationship: AssertionReasonRelationship;
}

export interface ChallengeAgreementMatrix extends ChallengeQuestionBase {
  type: 'agreement-matrix';
  statements: Array<{ text: string; correct: AgreementCategory }>;
}

export interface ChallengeConfidenceWeighted extends ChallengeQuestionBase {
  type: 'confidence-weighted';
  options: string[];
  correctIndex: number;
}

export interface ChallengeSliderEstimation extends ChallengeQuestionBase {
  type: 'slider-estimation';
  unit: string;
  correctValue: number;
  acceptableRange: [number, number];
  sliderMin: number;
  sliderMax: number;
}

export type ChallengeQuestion =
  | ChallengeMcq | ChallengeTwoStage | ChallengeAssertionReason
  | ChallengeAgreementMatrix | ChallengeConfidenceWeighted
  | ChallengeSliderEstimation;

export interface WeeklyChallengeData {
  metadata: { chapterTitle: string; weekNumber: number; estimatedMinutes: number };
  questions: ChallengeQuestion[];
}

export interface ActivityDetail {
  steps: Array<{ step: number; timing: string; instruction: string; studentAction: string }>;
  facilitationTips: string[];
  commonPitfalls: string[];
  debriefGuide: string;
  variations: string[];
  assessmentIdeas: string;
}

export interface GeneratedChapter {
  number: number;
  title: string;
  htmlContent: string; // full HTML with embedded widgets
  practiceQuizData?: string; // quiz text format
  inClassQuizData?: InClassQuizQuestion[];
  discussionData?: Array<{ prompt: string; hook: string }>;
  activityData?: Array<{ title: string; duration: string; description: string; materials: string; learningGoal: string; scalingNotes: string }>;
  activityDetails?: Record<number, ActivityDetail>;
  audioTranscript?: string;
  audioUrl?: string; // blob URL from Gemini TTS (WAV)
  slidesJson?: SlideData[];
  pptxUrl?: string; // blob URL
  infographicDataUri?: string; // data:image/jpeg;base64,...
  infographicPrompt?: string; // the Claude-written prompt for Gemini
  weeklyChallengeData?: WeeklyChallengeData;
}

export interface SlideData {
  title: string;
  bullets: string[];
  speakerNotes: string;
  layout?: 'title' | 'content' | 'section' | 'big-idea' | 'quote' | 'two-column';
  bodyText?: string; // Used by big-idea, quote, section layouts
}

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type AlignmentLevel = 'introduced' | 'developed' | 'mastered';

export interface LearningObjective {
  id: number;
  text: string;
  bloomLevel: BloomLevel;
  alignments: Record<number, AlignmentLevel>;
}

export interface CurriculumMap {
  objectives: LearningObjective[];
  generatedAt: string;
}

export type StageId =
  | 'landing'
  | 'setup'
  | 'syllabus'
  | 'research'
  | 'build'
  | 'export';

export interface Stage {
  id: StageId;
  number: number;
  label: string;
  path: string;
}

export const STAGES: Stage[] = [
  { id: 'setup', number: 1, label: 'Setup', path: '/setup' },
  { id: 'syllabus', number: 2, label: 'Syllabus', path: '/syllabus' },
  { id: 'research', number: 3, label: 'Research', path: '/research' },
  { id: 'build', number: 4, label: 'Build', path: '/build' },
  { id: 'export', number: 5, label: 'Export', path: '/export' },
];
