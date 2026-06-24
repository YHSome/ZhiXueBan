// 试卷数据管理（存 localStorage）

function generateId() {
  return "exam_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

const STORAGE_KEY = "zhixueban-exams";

export function getAllExams() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function getExam(examId) {
  return getAllExams().find((e) => e.id === examId) || null;
}

export function addExam(examData) {
  const exams = getAllExams();
  const exam = { id: generateId(), ...examData, createdAt: new Date().toISOString() };
  exams.push(exam);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
  return exam;
}

export function updateExam(examId, updates) {
  const exams = getAllExams();
  const idx = exams.findIndex((e) => e.id === examId);
  if (idx === -1) return null;
  exams[idx] = { ...exams[idx], ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
  return exams[idx];
}

export function deleteExam(examId) {
  const exams = getAllExams().filter((e) => e.id !== examId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
  localStorage.removeItem(`zhixueban-exam-cache-${examId}`);
}
