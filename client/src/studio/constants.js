export const TYPE_LABEL = {
  single: "Single correct",
  multiple: "Multiple correct",
  numerical: "Numerical",
};

// Starting marks for each type; creators can change them per question
export const DEFAULT_MARKS = {
  single: [4, -1],
  multiple: [4, -2],
  numerical: [4, 0],
};

export const EXAM_LABEL = {
  practice: "Practice",
  jee_main: "JEE Main",
  jee_advanced: "JEE Advanced",
};

// Suggested durations when a creator picks an exam type (editable)
export const EXAM_DURATION = { practice: 60, jee_main: 180, jee_advanced: 180 };

export const SERIES_EXAM_LABEL = {
  both: "JEE Main + Advanced",
  jee_main: "JEE Main",
  jee_advanced: "JEE Advanced",
};

// The two syllabus trees
export const SYLLABUS_EXAMS = ["jee_main", "jee_advanced"];
export const SYLLABUS_LABEL = { jee_main: "JEE Main", jee_advanced: "JEE Advanced" };
export const SYLLABUS_SHORT = { jee_main: "Main", jee_advanced: "Adv" };
export const LEVELS = ["subject", "cluster", "chapter", "topic", "subtopic", "section"];
export const LEVEL_LABEL = {
  subject: "Subject", cluster: "Cluster", chapter: "Chapter",
  topic: "Topic", subtopic: "Subtopic", section: "Section",
};
// Questions are tagged at chapter level or deeper
export const TAGGABLE = ["chapter", "topic", "subtopic", "section"];
