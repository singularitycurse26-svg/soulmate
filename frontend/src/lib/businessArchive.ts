// Business Archive — Universal Memory & Journal Store
// Shared across all Business Archive departments
// Uses localStorage with IndexedDB-style persistence pattern

const STORAGE_KEYS = {
  documents: "business_archive_documents",
  contacts: "business_archive_contacts",
  memory: "business_archive_memory",
  journal: "business_archive_journal",
  suggestions: "business_archive_suggestions",
  projects: "business_archive_projects",
  departments: "business_archive_departments",
  faxNumbers: "business_archive_fax_numbers",
} as const;

// ── Types ────────────────────────────────────────────────────────

export interface ScannedDocument {
  id: string;
  name: string;
  category: string;
  imageData: string;
  thumbnail: string;
  fileSize: number;
  capturedAt: number;
  source: "camera" | "upload" | "fax";
  faxNumber?: string;
  filed: boolean;
  fileLocation: string;
  tags: string[];
  notes: string;
}

export interface BusinessContact {
  id: string;
  name: string;
  company: string;
  faxNumber: string;
  phoneNumber: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  category: string;
  notes: string;
  createdAt: number;
}

export interface MemoryEntry {
  id: string;
  type: "fact" | "preference" | "context" | "skill" | "document" | "suggestion";
  key: string;
  value: string;
  source: string;
  createdAt: number;
  tags: string[];
}

export interface JournalEntry {
  id: string;
  text: string;
  mood: string;
  tags: string[];
  source: string;
  timestamp: number;
  linkedProject?: string;
  linkedDocument?: string;
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  status: "new" | "accepted" | "dismissed" | "auto-added";
  createdAt: number;
  autoAddedAt?: number;
  projectId?: string;
}

export interface BusinessProject {
  id: string;
  name: string;
  description: string;
  status: "planning" | "in-progress" | "review" | "complete" | "paused";
  startedAt: number;
  lastUpdated: number;
  progress: number;
  tasks: { id: string; text: string; done: boolean }[];
  analysis?: ProjectAnalysis;
}

export interface ProjectAnalysis {
  projectId: string;
  analyzedAt: number;
  present: string[];
  missing: string[];
  improvements: string[];
  compiledList: string;
}

export interface Department {
  id: number;
  name: string;
  icon: string;
  enabled: boolean;
  customizable: boolean;
  description: string;
}

// ── Default Departments ──────────────────────────────────────────

const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 1, name: "Fax Machine", icon: "Fax", enabled: true, customizable: false, description: "Scan documents via camera or upload, auto-file by name, send/receive fax" },
  { id: 2, name: "Custom Dept 2", icon: "Folder", enabled: true, customizable: true, description: "Customizable department — configure for your needs" },
  { id: 3, name: "Custom Dept 3", icon: "Folder", enabled: true, customizable: true, description: "Customizable department — configure for your needs" },
  { id: 4, name: "Contacts & Addresses", icon: "AddressBook", enabled: true, customizable: false, description: "Fax numbers, contacts, addresses for all business communications" },
  { id: 5, name: "Project Analyzer", icon: "ScanSearch", enabled: true, customizable: false, description: "Watches all projects, analyzes what's missing, generates 25 suggestions every 15 minutes" },
  { id: 6, name: "Custom Dept 6", icon: "Folder", enabled: true, customizable: true, description: "Customizable department — configure for your needs" },
  { id: 7, name: "Custom Dept 7", icon: "Folder", enabled: true, customizable: true, description: "Customizable department — configure for your needs" },
  { id: 8, name: "Custom Dept 8", icon: "Folder", enabled: true, customizable: true, description: "Customizable department — configure for your needs" },
];

// ── Storage helpers ─────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Business Archive storage error:", e);
  }
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Documents (Fax Machine) ─────────────────────────────────────

export function getDocuments(): ScannedDocument[] {
  return load(STORAGE_KEYS.documents, []);
}

export function saveDocument(doc: Omit<ScannedDocument, "id" | "capturedAt" | "filed" | "fileLocation">): ScannedDocument {
  const docs = getDocuments();
  const fileLocation = `Business Archive / Fax Machine / ${doc.category || "Uncategorized"} / ${doc.name}`;
  const newDoc: ScannedDocument = {
    ...doc,
    id: genId(),
    capturedAt: Date.now(),
    filed: true,
    fileLocation,
  };
  docs.unshift(newDoc);
  save(STORAGE_KEYS.documents, docs);

  // Auto-add to memory
  addMemory({
    type: "document",
    key: doc.name,
    value: `Document scanned via ${doc.source}: ${doc.name} — Filed at ${fileLocation}`,
    source: "fax-machine",
    tags: ["document", doc.category, doc.source],
  });

  // Auto-add to journal
  addJournalEntry({
    text: `Document "${doc.name}" scanned and filed at ${fileLocation}`,
    mood: "neutral",
    tags: ["fax", "document", doc.category],
    source: "fax-machine",
    linkedDocument: newDoc.id,
  });

  return newDoc;
}

export function deleteDocument(id: string): void {
  const docs = getDocuments().filter(d => d.id !== id);
  save(STORAGE_KEYS.documents, docs);
}

export function updateDocument(id: string, updates: Partial<ScannedDocument>): void {
  const docs = getDocuments().map(d => d.id === id ? { ...d, ...updates } : d);
  save(STORAGE_KEYS.documents, docs);
}

// ── Contacts ────────────────────────────────────────────────────

export function getContacts(): BusinessContact[] {
  return load(STORAGE_KEYS.contacts, []);
}

export function saveContact(contact: Omit<BusinessContact, "id" | "createdAt">): BusinessContact {
  const contacts = getContacts();
  const newContact: BusinessContact = { ...contact, id: genId(), createdAt: Date.now() };
  contacts.unshift(newContact);
  save(STORAGE_KEYS.contacts, contacts);

  addMemory({
    type: "fact",
    key: `contact:${newContact.name}`,
    value: `${newContact.name} — Fax: ${newContact.faxNumber}, Phone: ${newContact.phoneNumber}, Address: ${newContact.address}`,
    source: "contacts",
    tags: ["contact", newContact.category],
  });

  return newContact;
}

export function deleteContact(id: string): void {
  const contacts = getContacts().filter(c => c.id !== id);
  save(STORAGE_KEYS.contacts, contacts);
}

export function updateContact(id: string, updates: Partial<BusinessContact>): void {
  const contacts = getContacts().map(c => c.id === id ? { ...c, ...updates } : c);
  save(STORAGE_KEYS.contacts, contacts);
}

// ── Universal Memory ─────────────────────────────────────────────

export function getMemory(): MemoryEntry[] {
  return load(STORAGE_KEYS.memory, []);
}

export function addMemory(entry: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
  const memory = getMemory();
  const newEntry: MemoryEntry = { ...entry, id: genId(), createdAt: Date.now() };
  memory.unshift(newEntry);
  save(STORAGE_KEYS.memory, memory);
  return newEntry;
}

export function deleteMemory(id: string): void {
  const memory = getMemory().filter(m => m.id !== id);
  save(STORAGE_KEYS.memory, memory);
}

export function searchMemory(query: string): MemoryEntry[] {
  const q = query.toLowerCase();
  return getMemory().filter(m =>
    m.key.toLowerCase().includes(q) ||
    m.value.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q))
  );
}

// ── Universal Journal ────────────────────────────────────────────

export function getJournal(): JournalEntry[] {
  return load(STORAGE_KEYS.journal, []);
}

export function addJournalEntry(entry: Omit<JournalEntry, "id" | "timestamp">): JournalEntry {
  const journal = getJournal();
  const newEntry: JournalEntry = { ...entry, id: genId(), timestamp: Date.now() };
  journal.unshift(newEntry);
  save(STORAGE_KEYS.journal, journal);
  return newEntry;
}

export function deleteJournalEntry(id: string): void {
  const journal = getJournal().filter(j => j.id !== id);
  save(STORAGE_KEYS.journal, journal);
}

// ── Suggestions Engine ───────────────────────────────────────────

export function getSuggestions(): Suggestion[] {
  return load(STORAGE_KEYS.suggestions, []);
}

export function addSuggestion(suggestion: Omit<Suggestion, "id" | "createdAt" | "status">): Suggestion {
  const suggestions = getSuggestions();
  const newSuggestion: Suggestion = {
    ...suggestion,
    id: genId(),
    createdAt: Date.now(),
    status: "new",
  };
  suggestions.unshift(newSuggestion);
  save(STORAGE_KEYS.suggestions, suggestions);
  return newSuggestion;
}

export function updateSuggestion(id: string, updates: Partial<Suggestion>): void {
  const suggestions = getSuggestions().map(s => s.id === id ? { ...s, ...updates } : s);
  save(STORAGE_KEYS.suggestions, suggestions);
}

export function dismissSuggestion(id: string): void {
  updateSuggestion(id, { status: "dismissed" });
}

export function acceptSuggestion(id: string): void {
  updateSuggestion(id, { status: "accepted" });
}

// Auto-add suggestions to memory + journal after 1 hour mark
export function autoAddSuggestionsAfterOneHour(): number {
  const suggestions = getSuggestions();
  let added = 0;
  for (const s of suggestions) {
    if (s.status === "new" && (Date.now() - s.createdAt) > 3600000) {
      updateSuggestion(s.id, { status: "auto-added", autoAddedAt: Date.now() });
      addMemory({
        type: "suggestion",
        key: `suggestion:${s.title}`,
        value: `${s.title} — ${s.description} [Priority: ${s.priority}]`,
        source: "project-analyzer",
        tags: ["suggestion", "auto-added", s.category],
      });
      addJournalEntry({
        text: `Suggestion auto-added: "${s.title}" — ${s.description}`,
        mood: "neutral",
        tags: ["suggestion", "auto-added", s.category],
        source: "project-analyzer",
        linkedProject: s.projectId,
      });
      added++;
    }
  }
  return added;
}

// ── Projects ────────────────────────────────────────────────────

export function getProjects(): BusinessProject[] {
  return load(STORAGE_KEYS.projects, []);
}

export function saveProject(project: Omit<BusinessProject, "id" | "startedAt" | "lastUpdated" | "progress" | "tasks">): BusinessProject {
  const projects = getProjects();
  const newProject: BusinessProject = {
    ...project,
    id: genId(),
    startedAt: Date.now(),
    lastUpdated: Date.now(),
    progress: 0,
    tasks: [],
  };
  projects.unshift(newProject);
  save(STORAGE_KEYS.projects, projects);
  return newProject;
}

export function updateProject(id: string, updates: Partial<BusinessProject>): void {
  const projects = getProjects().map(p => p.id === id ? { ...p, ...updates, lastUpdated: Date.now() } : p);
  save(STORAGE_KEYS.projects, projects);
}

export function deleteProject(id: string): void {
  const projects = getProjects().filter(p => p.id !== id);
  save(STORAGE_KEYS.projects, projects);
}

// ── Project Analysis ──────────────────────────────────────────────

export function analyzeProject(project: BusinessProject): ProjectAnalysis {
  const present: string[] = [];
  const missing: string[] = [];
  const improvements: string[] = [];

  // Check what's present
  if (project.description.length > 0) present.push("Project description");
  if (project.tasks.length > 0) present.push(`${project.tasks.length} tasks defined`);
  const completedTasks = project.tasks.filter(t => t.done).length;
  if (completedTasks > 0) present.push(`${completedTasks} completed tasks`);
  if (project.progress > 0) present.push(`Progress tracking (${project.progress}%)`);

  // Check what's missing
  if (project.description.length < 50) missing.push("Detailed project description (currently too brief)");
  if (project.tasks.length < 5) missing.push("More task breakdown needed (currently < 5 tasks)");
  if (project.tasks.length > 0 && completedTasks === 0) missing.push("No completed tasks yet");
  if (!project.analysis) missing.push("No prior analysis recorded");
  if (project.progress === 0 && project.status === "in-progress") missing.push("Progress not being tracked");
  if (project.tasks.filter(t => !t.done).length > project.tasks.filter(t => t.done).length * 3) {
    missing.push("Task completion ratio is low — may need scope reduction");
  }

  // Suggest improvements
  improvements.push("Break down large tasks into smaller sub-tasks for better tracking");
  improvements.push("Add estimated time for each task to improve planning");
  improvements.push("Link related documents from the Fax Machine to this project");
  improvements.push("Add priority levels to tasks (high/medium/low)");
  improvements.push("Set milestone checkpoints for progress validation");
  improvements.push("Document dependencies between tasks");
  improvements.push("Add acceptance criteria for each task");
  improvements.push("Review and update project status weekly");
  improvements.push("Add risk assessment for critical path tasks");
  improvements.push("Create a communication plan for stakeholders");

  // Context-aware suggestions
  if (project.status === "planning") {
    improvements.push("Move from planning to in-progress once initial tasks are defined");
    improvements.push("Define success criteria before starting work");
  }
  if (project.status === "in-progress") {
    improvements.push("Consider adding a retrospective at key milestones");
    improvements.push("Track time spent vs estimated for better future estimates");
  }
  if (project.status === "paused") {
    improvements.push("Review why the project was paused and document blockers");
    improvements.push("Create a resume plan with updated priorities");
  }

  const compiledList = [
    "=== PROJECT ANALYSIS REPORT ===",
    `Project: ${project.name}`,
    `Status: ${project.status}`,
    `Progress: ${project.progress}%`,
    "",
    "--- PRESENT ---",
    ...present.map(p => `✓ ${p}`),
    "",
    "--- MISSING ---",
    ...missing.map(m => `✗ ${m}`),
    "",
    "--- IMPROVEMENTS ---",
    ...improvements.map((i, idx) => `${idx + 1}. ${i}`),
    "",
    "=== END REPORT ===",
  ].join("\n");

  const analysis: ProjectAnalysis = {
    projectId: project.id,
    analyzedAt: Date.now(),
    present,
    missing,
    improvements,
    compiledList,
  };

  updateProject(project.id, { analysis });
  return analysis;
}

// Generate 25 suggestions for all projects
export function generateSuggestionsForAllProjects(): Suggestion[] {
  const projects = getProjects();
  const suggestions: Suggestion[] = [];

  if (projects.length === 0) {
    // General business suggestions
    const generalSuggestions = [
      { title: "Create your first project", description: "No projects found. Start by defining a project in the Project Analyzer.", priority: "high" as const, category: "setup" },
      { title: "Set up contact directory", description: "Add your business contacts to the Contacts department for easy access.", priority: "medium" as const, category: "contacts" },
      { title: "Scan your first document", description: "Use the Fax Machine to digitize and file important business documents.", priority: "medium" as const, category: "fax" },
      { title: "Configure custom departments", description: "Customize departments 2, 3, 6, 7, 8 for your specific business needs.", priority: "low" as const, category: "setup" },
      { title: "Set up fax number", description: "Add your business fax number to start sending and receiving documents.", priority: "medium" as const, category: "fax" },
    ];
    for (const s of generalSuggestions) {
      suggestions.push(addSuggestion(s));
    }
    return suggestions;
  }

  for (const project of projects) {
    const analysis = analyzeProject(project);

    // Generate suggestions from missing items
    for (const m of analysis.missing.slice(0, 5)) {
      suggestions.push(addSuggestion({
        title: `[${project.name}] Address: ${m}`,
        description: `Missing item detected in project "${project.name}": ${m}. Add this to improve project completeness.`,
        priority: "high",
        category: "missing",
        projectId: project.id,
      }));
    }

    // Generate suggestions from improvements
    for (const imp of analysis.improvements.slice(0, 8)) {
      suggestions.push(addSuggestion({
        title: `[${project.name}] Improve: ${imp.slice(0, 60)}`,
        description: `Improvement for project "${project.name}": ${imp}`,
        priority: "medium",
        category: "improvement",
        projectId: project.id,
      }));
    }

    // Status-based suggestions
    if (project.status === "in-progress") {
      const elapsed = Date.now() - project.startedAt;
      const hoursElapsed = elapsed / 3600000;
      if (hoursElapsed > 1) {
        suggestions.push(addSuggestion({
          title: `[${project.name}] 1+ hour elapsed — auto-adding suggestions to memory`,
          description: `Project has been running for ${hoursElapsed.toFixed(1)} hours. All pending suggestions will be auto-added to universal memory and journal.`,
          priority: "high",
          category: "milestone",
          projectId: project.id,
        }));
      }
      if (project.progress < 25) {
        suggestions.push(addSuggestion({
          title: `[${project.name}] Progress is below 25%`,
          description: "Consider breaking tasks into smaller pieces or removing scope creep.",
          priority: "medium",
          category: "progress",
          projectId: project.id,
        }));
      }
    }
  }

  // Pad to 25 if needed
  while (suggestions.length < 25) {
    const fillerSuggestions = [
      { title: "Review document filing system", description: "Check that all scanned documents are properly categorized and filed.", priority: "low" as const, category: "organization" },
      { title: "Update contact information", description: "Verify fax numbers and addresses are current for all contacts.", priority: "low" as const, category: "contacts" },
      { title: "Backup business archive", description: "Export your business archive data for safekeeping.", priority: "medium" as const, category: "backup" },
      { title: "Review project priorities", description: "Reassess which projects need immediate attention.", priority: "low" as const, category: "planning" },
      { title: "Clean up completed projects", description: "Archive or remove completed projects to reduce clutter.", priority: "low" as const, category: "cleanup" },
    ];
    const filler = fillerSuggestions[suggestions.length % fillerSuggestions.length];
    suggestions.push(addSuggestion(filler));
  }

  return suggestions.slice(0, 25);
}

// ── Departments ──────────────────────────────────────────────────

export function getDepartments(): Department[] {
  return load(STORAGE_KEYS.departments, DEFAULT_DEPARTMENTS);
}

export function updateDepartment(id: number, updates: Partial<Department>): void {
  const depts = getDepartments().map(d => d.id === id ? { ...d, ...updates } : d);
  save(STORAGE_KEYS.departments, depts);
}

// ── Fax Numbers ──────────────────────────────────────────────────

export function getFaxNumbers(): string[] {
  return load(STORAGE_KEYS.faxNumbers, []);
}

export function addFaxNumber(number: string): void {
  const numbers = getFaxNumbers();
  if (!numbers.includes(number)) {
    numbers.push(number);
    save(STORAGE_KEYS.faxNumbers, numbers);
  }
}

export function removeFaxNumber(number: string): void {
  const numbers = getFaxNumbers().filter(n => n !== number);
  save(STORAGE_KEYS.faxNumbers, numbers);
}

// ── Export / Import ──────────────────────────────────────────────

export function exportArchive(): string {
  return JSON.stringify({
    documents: getDocuments(),
    contacts: getContacts(),
    memory: getMemory(),
    journal: getJournal(),
    suggestions: getSuggestions(),
    projects: getProjects(),
    departments: getDepartments(),
    faxNumbers: getFaxNumbers(),
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

export function importArchive(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (data.documents) save(STORAGE_KEYS.documents, data.documents);
    if (data.contacts) save(STORAGE_KEYS.contacts, data.contacts);
    if (data.memory) save(STORAGE_KEYS.memory, data.memory);
    if (data.journal) save(STORAGE_KEYS.journal, data.journal);
    if (data.suggestions) save(STORAGE_KEYS.suggestions, data.suggestions);
    if (data.projects) save(STORAGE_KEYS.projects, data.projects);
    if (data.departments) save(STORAGE_KEYS.departments, data.departments);
    if (data.faxNumbers) save(STORAGE_KEYS.faxNumbers, data.faxNumbers);
    return true;
  } catch {
    return false;
  }
}
