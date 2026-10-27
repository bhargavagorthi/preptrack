// Student profile fields: one definition drives validation, saving,
// clearing and the "how complete is my profile" score.

const OPT = {
  gender: ["female", "male", "other", "prefer_not"],
  category: ["general", "ews", "obc_ncl", "sc", "st"],
  current_class: ["class_11", "class_12", "dropper", "other"],
  board: ["cbse", "icse", "state", "other"],
  preferred_language: ["english", "hindi", "other"],
  guardian_relation: ["father", "mother", "guardian", "other"],
};

// [key, type, extra]
const SECTIONS = {
  personal: [
    ["phone", "phone"], ["alt_phone", "phone"], ["date_of_birth", "date"], ["gender", "enum"],
    ["nationality", "text"], ["category", "enum"], ["pwd", "bool"], ["mother_tongue", "text"],
  ],
  address: [
    ["address_line1", "text"], ["address_line2", "text"], ["city", "text"], ["district", "text"],
    ["state", "text"], ["pincode", "pincode"], ["country", "text"],
  ],
  academic: [
    ["current_class", "enum"], ["board", "enum"], ["school_name", "text"], ["school_city", "text"],
    ["class10_percent", "percent"], ["class10_year", "year"], ["class12_percent", "percent"], ["class12_year", "year"],
    ["target_year", "year"], ["coaching_institute", "text"], ["preferred_language", "enum"],
  ],
  guardian: [
    ["guardian_name", "text"], ["guardian_relation", "enum"], ["guardian_phone", "phone"],
    ["guardian_email", "email"], ["guardian_occupation", "text"],
  ],
  notifications: [
    ["notify_email", "flag"], ["notify_whatsapp", "flag"], ["notify_contests", "flag"], ["notify_results", "flag"],
  ],
};

// Fields that count towards "profile complete"
const KEY_FIELDS = {
  personal: ["phone", "date_of_birth", "gender"],
  address: ["address_line1", "city", "state", "pincode"],
  academic: ["current_class", "board", "school_name", "target_year"],
  guardian: ["guardian_name", "guardian_relation", "guardian_phone"],
};

const FIELD = {};
for (const [section, list] of Object.entries(SECTIONS)) {
  for (const [key, type] of list) FIELD[key] = { key, type, section };
}

const LABEL = {
  phone: "Mobile number", alt_phone: "Alternate number", date_of_birth: "Date of birth", pincode: "PIN code",
  guardian_phone: "Parent's phone", guardian_email: "Parent's email", class10_percent: "Class 10 %",
  class12_percent: "Class 12 %", class10_year: "Class 10 year", class12_year: "Class 12 year", target_year: "Target year",
};
const label = (k) => LABEL[k] || k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Clean one value. Empty → null (that's how a field is deleted).
function cleanValue(key, raw) {
  const f = FIELD[key];
  if (f.type === "flag") return { value: Boolean(raw) };
  if (raw === null || raw === undefined || String(raw).trim() === "") return { value: null };
  const s = String(raw).trim();
  switch (f.type) {
    case "text":
      if (s.length > 200) return { error: `${label(key)} is too long` };
      return { value: s };
    case "phone": {
      const digits = s.replace(/[\s\-()]/g, "");
      if (!/^\+?[0-9]{10,13}$/.test(digits)) return { error: `${label(key)} should be a 10-digit mobile number` };
      return { value: digits };
    }
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 200) return { error: `${label(key)} isn't a valid email` };
      return { value: s.toLowerCase() };
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return { error: `${label(key)} isn't a valid date` };
      const year = Number(s.slice(0, 4));
      const now = new Date().getFullYear();
      if (year < now - 60 || year > now - 8) return { error: `${label(key)} doesn't look right` };
      return { value: s };
    }
    case "enum":
      if (!OPT[key].includes(s)) return { error: `Choose a valid ${label(key).toLowerCase()}` };
      return { value: s };
    case "bool":
      if (!["true", "false"].includes(s)) return { error: `Choose yes or no for ${label(key)}` };
      return { value: s === "true" };
    case "percent": {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { error: `${label(key)} must be between 0 and 100` };
      return { value: Math.round(n * 100) / 100 };
    }
    case "year": {
      const n = Number(s);
      if (!Number.isInteger(n) || n < 1990 || n > 2100) return { error: `${label(key)} must be a year like 2027` };
      return { value: n };
    }
    case "pincode":
      if (!/^[1-9][0-9]{5}$/.test(s)) return { error: "PIN code must be 6 digits" };
      return { value: s };
    default:
      return { error: "Unknown field" };
  }
}

function completeness(profile) {
  const p = profile || {};
  const sections = {};
  let done = 0, total = 0;
  for (const [section, keys] of Object.entries(KEY_FIELDS)) {
    const filled = keys.filter((k) => p[k] !== null && p[k] !== undefined && p[k] !== "");
    sections[section] = { filled: filled.length, total: keys.length, missing: keys.filter((k) => !filled.includes(k)) };
    done += filled.length;
    total += keys.length;
  }
  return { pct: Math.round((done / total) * 100), sections };
}

module.exports = { SECTIONS, FIELD, OPT, KEY_FIELDS, cleanValue, completeness };
