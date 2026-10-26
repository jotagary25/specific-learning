import {
  ArticleDetail,
  ArticlesListResponse,
  EditorRunResponse,
  GlossResponse,
  QuestionGradeResponse,
  type ReadingStep,
  RecallAnswerResponse,
  RecallResponse,
  RetellResponse,
  SaveWordResponse,
  type SpotRequest,
  SpotResponse,
  TodayResponse,
} from "@english-course/shared";
import { apiRequest } from "../../shared/api/http.ts";

const base = "/api/reading";
const article = (id: string) => `${base}/articles/${encodeURIComponent(id)}`;

export const readingKeys = {
  all: ["reading"] as const,
  today: ["reading", "today"] as const,
  recall: ["reading", "recall"] as const,
  history: ["reading", "history"] as const,
  article: (id: string) => ["reading", "article", id] as const,
};

export const fetchToday = () => apiRequest(`${base}/today`, TodayResponse);
export const fetchHistory = () => apiRequest(`${base}/articles`, ArticlesListResponse);
export const fetchArticle = (id: string) => apiRequest(article(id), ArticleDetail);
export const fetchRecall = () => apiRequest(`${base}/recall`, RecallResponse);

export const runEditor = () =>
  apiRequest(`${base}/editor/run`, EditorRunResponse, { method: "POST", body: {} });

export const retryAnnotations = (id: string) =>
  apiRequest(`${article(id)}/annotate`, ArticleDetail, { method: "POST", body: {} });

export const savePrediction = (id: string, prediction: string) =>
  apiRequest(`${article(id)}/prediction`, ArticleDetail, { method: "POST", body: { prediction } });

export const goToStep = (id: string, step: ReadingStep) =>
  apiRequest(`${article(id)}/step`, ArticleDetail, { method: "POST", body: { step } });

export const glossWord = (id: string, word: string, sentence: string) =>
  apiRequest(`${article(id)}/gloss`, GlossResponse, { method: "POST", body: { word, sentence } });

export const saveWord = (id: string, word: string, sentence: string) =>
  apiRequest(`${article(id)}/save-word`, SaveWordResponse, {
    method: "POST",
    body: { word, sentence },
  });

export const answerQuestion = (id: string, qid: number, answer: string) =>
  apiRequest(`${article(id)}/questions/${qid}`, QuestionGradeResponse, {
    method: "POST",
    body: { answer },
  });

export const checkSpot = (id: string, body: SpotRequest) =>
  apiRequest(`${article(id)}/spots`, SpotResponse, { method: "POST", body });

export const revealSpots = (id: string) =>
  apiRequest(`${article(id)}/spots/reveal`, ArticleDetail, { method: "POST", body: {} });

export const submitRetell = (id: string, text: string) =>
  apiRequest(`${article(id)}/retell`, RetellResponse, { method: "POST", body: { text } });

export const saveOpinion = (id: string, opinion: string) =>
  apiRequest(`${article(id)}/opinion`, ArticleDetail, { method: "POST", body: { opinion } });

export const completeReading = (id: string) =>
  apiRequest(`${article(id)}/complete`, ArticleDetail, { method: "POST", body: {} });

export const answerRecall = (qid: number, answer: string) =>
  apiRequest(`${base}/recall/${qid}`, RecallAnswerResponse, { method: "POST", body: { answer } });
