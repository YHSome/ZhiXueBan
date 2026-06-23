// 课程数据管理 —— 支持多门课程（存 localStorage）

// 简单的 ID 生成（不依赖外部包）
function generateId() {
  return "course_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

const STORAGE_KEY = "zhixueban-courses";

// 获取所有课程
export function getAllCourses() {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// 获取单个课程
export function getCourse(courseId) {
  return getAllCourses().find((c) => c.id === courseId) || null;
}

// 添加课程
export function addCourse(courseData) {
  const courses = getAllCourses();
  const course = {
    id: generateId(),
    ...courseData,
    createdAt: new Date().toISOString(),
  };
  courses.push(course);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
  return course;
}

// 删除课程
export function deleteCourse(courseId) {
  const courses = getAllCourses().filter((c) => c.id !== courseId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
  // 同时清除该课程的缓存
  const cacheKey = `zhixueban-cache-${courseId}`;
  localStorage.removeItem(cacheKey);
}

// 更新课程（比如修改章节结构）
export function updateCourse(courseId, updates) {
  const courses = getAllCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) return null;
  courses[idx] = { ...courses[idx], ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
  return courses[idx];
}
