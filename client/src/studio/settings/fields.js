// What each Settings section asks for. Keys match server/lib/profile.js.

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

// A few big cities per state, offered as suggestions (any city can be typed)
export const CITY_HINTS = {
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Nellore", "Kakinada"],
  Telangana: ["Hyderabad", "Warangal", "Karimnagar", "Nizamabad", "Khammam"],
  Karnataka: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"],
  Kerala: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane"],
  Delhi: ["New Delhi", "Dwarka", "Rohini"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Prayagraj", "Varanasi", "Noida", "Ghaziabad", "Agra"],
  Rajasthan: ["Kota", "Jaipur", "Jodhpur", "Udaipur", "Ajmer"],
  Bihar: ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur"],
  "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Siliguri"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  "Madhya Pradesh": ["Indore", "Bhopal", "Jabalpur", "Gwalior"],
  Odisha: ["Bhubaneswar", "Cuttack", "Rourkela"],
  Punjab: ["Ludhiana", "Amritsar", "Jalandhar", "Mohali"],
  Haryana: ["Gurugram", "Faridabad", "Panipat", "Rohtak"],
  Jharkhand: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"],
  Assam: ["Guwahati", "Dibrugarh", "Silchar"],
  Chandigarh: ["Chandigarh"],
};

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const thisYear = new Date().getFullYear();

export const SECTIONS = [
  {
    id: "personal", icon: "🪪", title: "Personal details", students: true,
    blurb: "Basic details we use to identify you and contact you about tests.",
    fields: [
      { key: "phone", label: "Mobile number", type: "tel", placeholder: "10-digit mobile", key_field: true, required: true,
        hint: "Required. You can change it, but not remove it." },
      { key: "alt_phone", label: "Alternate number", type: "tel", placeholder: "Optional" },
      { key: "date_of_birth", label: "Date of birth", type: "date", key_field: true },
      { key: "gender", label: "Gender", type: "select", key_field: true,
        options: opts([["female", "Female"], ["male", "Male"], ["other", "Other"], ["prefer_not", "Prefer not to say"]]) },
      { key: "nationality", label: "Nationality", type: "text", placeholder: "e.g. Indian" },
      { key: "mother_tongue", label: "Mother tongue", type: "text", placeholder: "e.g. Telugu" },
      { key: "category", label: "Category", type: "select", hint: "Optional. Used only for category-wise rank guidance, as in JEE.",
        options: opts([["general", "General"], ["ews", "GEN-EWS"], ["obc_ncl", "OBC-NCL"], ["sc", "SC"], ["st", "ST"]]) },
      { key: "pwd", label: "Person with disability (PwD)", type: "select", hint: "Optional.",
        options: opts([["false", "No"], ["true", "Yes"]]) },
    ],
  },
  {
    id: "address", icon: "🏠", title: "Address", students: true,
    blurb: "Your communication address.",
    fields: [
      { key: "address_line1", label: "House / flat and street", type: "text", full: true, key_field: true, placeholder: "e.g. 12-3-45, MG Road" },
      { key: "address_line2", label: "Area / landmark", type: "text", full: true, placeholder: "Optional" },
      { key: "state", label: "State / UT", type: "select", key_field: true, options: INDIAN_STATES.map((s) => ({ value: s, label: s })) },
      { key: "city", label: "City / town", type: "city", key_field: true },
      { key: "district", label: "District", type: "text" },
      { key: "pincode", label: "PIN code", type: "text", inputMode: "numeric", maxLength: 6, placeholder: "6 digits", key_field: true },
      { key: "country", label: "Country", type: "text", placeholder: "India" },
    ],
  },
  {
    id: "academic", icon: "🎓", title: "Academic details", students: true,
    blurb: "Helps us tailor tests and compare you with the right group of aspirants.",
    fields: [
      { key: "current_class", label: "Currently in", type: "select", key_field: true,
        options: opts([["class_11", "Class 11"], ["class_12", "Class 12"], ["dropper", "Dropper / repeater"], ["other", "Other"]]) },
      { key: "board", label: "Board", type: "select", key_field: true,
        options: opts([["cbse", "CBSE"], ["icse", "ICSE / ISC"], ["state", "State board"], ["other", "Other"]]) },
      { key: "school_name", label: "School / junior college", type: "text", full: true, key_field: true },
      { key: "school_city", label: "School city", type: "text" },
      { key: "target_year", label: "Appearing for JEE in", type: "select", key_field: true,
        options: [0, 1, 2, 3].map((d) => ({ value: String(thisYear + d), label: String(thisYear + d) })) },
      { key: "class10_percent", label: "Class 10 score (%)", type: "number", step: "0.01", min: 0, max: 100 },
      { key: "class10_year", label: "Class 10 passing year", type: "number", min: 1990, max: 2100 },
      { key: "class12_percent", label: "Class 12 score (%)", type: "number", step: "0.01", min: 0, max: 100, hint: "Leave empty if not yet declared." },
      { key: "class12_year", label: "Class 12 passing year", type: "number", min: 1990, max: 2100 },
      { key: "coaching_institute", label: "Coaching institute", type: "text", placeholder: "Optional" },
      { key: "preferred_language", label: "Preferred language for questions", type: "select",
        options: opts([["english", "English"], ["hindi", "Hindi"], ["other", "Other"]]) },
    ],
  },
  {
    id: "guardian", icon: "👨‍👩‍👧", title: "Parent / guardian", students: true,
    blurb: "Who we can reach about your progress if needed.",
    fields: [
      { key: "guardian_name", label: "Name", type: "text", key_field: true },
      { key: "guardian_relation", label: "Relation", type: "select", key_field: true,
        options: opts([["father", "Father"], ["mother", "Mother"], ["guardian", "Guardian"], ["other", "Other"]]) },
      { key: "guardian_phone", label: "Mobile number", type: "tel", key_field: true },
      { key: "guardian_email", label: "Email", type: "email", placeholder: "Optional" },
      { key: "guardian_occupation", label: "Occupation", type: "text", placeholder: "Optional" },
    ],
  },
  {
    id: "notifications", icon: "🔔", title: "Notifications", toggles: true,
    blurb: "Choose what we tell you about.",
    fields: [
      { key: "notify_contests", label: "Contest reminders", hint: "Before a contest opens and when it's about to close." },
      { key: "notify_results", label: "Results and rankings", hint: "When contest results are published." },
      { key: "notify_email", label: "Email updates", hint: "Weekly progress summary and announcements." },
      { key: "notify_whatsapp", label: "WhatsApp messages", hint: "Test reminders, results and updates on your mobile number.", consent: true },
    ],
  },
];

export const WELCOME_ORDER = ["personal", "address", "academic", "guardian"];
