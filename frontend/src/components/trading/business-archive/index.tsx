import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  getDocuments, saveDocument, deleteDocument, updateDocument,
  getContacts, saveContact, deleteContact,
  getMemory, addMemory, deleteMemory,
  getJournal, addJournalEntry, deleteJournalEntry,
  getSuggestions, generateSuggestionsForAllProjects, dismissSuggestion, acceptSuggestion,
  autoAddSuggestionsAfterOneHour,
  getProjects, saveProject, updateProject, deleteProject, analyzeProject,
  getDepartments, updateDepartment,
  type ScannedDocument, type BusinessContact, type Suggestion, type BusinessProject,
  type Department, type ProjectAnalysis,
} from "@/lib/businessArchive";
import { incllmv2Api } from "@/lib/api";
import {
  Printer, Camera, Upload, Trash2, FileText, Phone, MapPin, Mail,
  Brain, Lightbulb, AlertCircle, CheckCircle, Clock, Plus,
  Search, Folder, Settings, BookOpen, Zap, TrendingUp, Eye,
  Download, Upload as UploadIcon, BookUser, ScanSearch,
  Terminal, Send, Mic, Sparkles, Cpu, ChevronDown, X,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════
// Department 1: Fax Machine
// ═════════════════════════════════════════════════════════════════

export function FaxMachineDept() {
  const [documents, setDocuments] = useState<ScannedDocument[]>(getDocuments());
  const [showCamera, setShowCamera] = useState(false);
  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState("General");
  const [docNotes, setDocNotes] = useState("");
  const [faxNumber, setFaxNumber] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setDocuments(getDocuments());

  const handleFileCapture = (file: File, source: "camera" | "upload") => {
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result as string;
      setCapturedImage(imageData);
      // Auto-generate name from filename if empty
      if (!docName) {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        setDocName(baseName);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!capturedImage || !docName) return;
    saveDocument({
      name: docName,
      category: docCategory,
      imageData: capturedImage,
      thumbnail: capturedImage,
      fileSize: capturedImage.length,
      source: faxNumber ? "fax" : "camera",
      faxNumber: faxNumber || undefined,
      tags: [docCategory, faxNumber ? "fax" : "scan"],
      notes: docNotes,
    });
    // Reset
    setCapturedImage(null);
    setDocName("");
    setDocNotes("");
    setFaxNumber("");
    refresh();
  };

  const filteredDocs = documents.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Printer className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold">Fax Machine</h2>
        <span className="text-[10px] text-muted ml-auto">
          {documents.length} documents filed
        </span>
      </div>

      {/* Capture controls */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/20 text-accent text-sm font-medium hover:bg-accent/30 transition"
        >
          <Camera className="w-4 h-4" />
          Take Photo
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-text text-sm font-medium hover:bg-white/10 transition"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileCapture(file, "camera");
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileCapture(file, "upload");
          }}
        />
      </div>

      {/* Capture preview + form */}
      {capturedImage && (
        <div className="p-3 rounded-xl bg-bg-alt border border-accent/20 space-y-3">
          <div className="flex gap-3">
            <img src={capturedImage} alt="Captured" className="w-32 h-32 object-cover rounded-lg border border-white/10" />
            <div className="flex-1 space-y-2">
              <input
                type="text"
                placeholder="Document name (auto-files by this name)"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm"
              />
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm"
              >
                <option>General</option>
                <option>Contract</option>
                <option>Invoice</option>
                <option>Legal</option>
                <option>Receipt</option>
                <option>Letter</option>
                <option>ID/Document</option>
                <option>Other</option>
              </select>
              <input
                type="text"
                placeholder="Fax number (optional — for faxed documents)"
                value={faxNumber}
                onChange={(e) => setFaxNumber(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm"
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!docName}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success text-sm font-medium hover:bg-success/30 transition disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              Save & Auto-File to Memory + Journal
            </button>
            <button
              onClick={() => { setCapturedImage(null); setDocName(""); }}
              className="px-3 py-2 rounded-lg bg-white/5 text-muted text-sm hover:bg-white/10 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search documents by name, category, or tag..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-white/10 text-sm"
      />

      {/* Document list */}
      <div className="space-y-2 max-h-96 overflow-y-auto no-scrollbar">
        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No documents filed yet</p>
            <p className="text-[10px] mt-1">Take a photo or upload to get started</p>
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <div key={doc.id} className="flex gap-3 p-2 rounded-lg bg-bg-alt border border-white/5 hover:border-white/10 transition">
              <img src={doc.thumbnail} alt={doc.name} className="w-16 h-16 object-cover rounded-lg border border-white/10 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  {doc.source === "fax" && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-accent/20 text-accent font-mono">FAX</span>
                  )}
                </div>
                <p className="text-[10px] text-muted truncate">{doc.fileLocation}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted">{doc.category}</span>
                  <span className="text-[9px] text-muted">{new Date(doc.capturedAt).toLocaleDateString()}</span>
                  {doc.faxNumber && (
                    <span className="text-[9px] text-accent font-mono">Fax: {doc.faxNumber}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { deleteDocument(doc.id); refresh(); }}
                className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Info banner */}
      <div className="p-2 rounded-lg bg-accent/5 border border-accent/10 text-[10px] text-muted">
        <p className="flex items-center gap-1.5">
          <Brain className="w-3 h-3 text-accent" />
          All scanned documents are auto-filed by name and stored in the universal memory + journal.
          Phone camera captures are filed automatically based on document content.
        </p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Department 4: Contacts & Addresses
// ═════════════════════════════════════════════════════════════════

export function ContactsDept() {
  const [contacts, setContacts] = useState<BusinessContact[]>(getContacts());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", company: "", faxNumber: "", phoneNumber: "",
    email: "", address: "", city: "", state: "", zip: "",
    category: "Business", notes: "",
  });

  const refresh = () => setContacts(getContacts());

  const handleSave = () => {
    if (!form.name) return;
    saveContact(form);
    setForm({
      name: "", company: "", faxNumber: "", phoneNumber: "",
      email: "", address: "", city: "", state: "", zip: "",
      category: "Business", notes: "",
    });
    setShowForm(false);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <BookUser className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold">Contacts & Addresses</h2>
        <span className="text-[10px] text-muted ml-auto">{contacts.length} contacts</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/20 text-accent text-xs"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {showForm && (
        <div className="p-3 rounded-xl bg-bg-alt border border-accent/20 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="text" placeholder="Company" value={form.company} onChange={e => setForm({...form, company: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="text" placeholder="Fax Number" value={form.faxNumber} onChange={e => setForm({...form, faxNumber: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="text" placeholder="Phone Number" value={form.phoneNumber} onChange={e => setForm({...form, phoneNumber: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm">
              <option>Business</option><option>Client</option><option>Vendor</option><option>Personal</option><option>Other</option>
            </select>
            <input type="text" placeholder="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="col-span-2 px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="text" placeholder="City" value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="text" placeholder="State" value={form.state} onChange={e => setForm({...form, state: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="text" placeholder="ZIP" value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
            <input type="text" placeholder="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success text-sm disabled:opacity-50">
              <CheckCircle className="w-4 h-4" /> Save Contact
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg bg-white/5 text-muted text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto no-scrollbar">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <BookUser className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No contacts yet</p>
          </div>
        ) : (
          contacts.map(c => (
            <div key={c.id} className="p-3 rounded-lg bg-bg-alt border border-white/5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.company && <p className="text-[10px] text-muted">{c.company}</p>}
                  <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-muted">
                    {c.faxNumber && <span className="flex items-center gap-1"><Printer className="w-3 h-3" />{c.faxNumber}</span>}
                    {c.phoneNumber && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phoneNumber}</span>}
                    {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                  </div>
                  {(c.address || c.city) && (
                    <p className="flex items-center gap-1 mt-1 text-[10px] text-muted">
                      <MapPin className="w-3 h-3" />
                      {[c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-white/5">{c.category}</span>
                </div>
                <button onClick={() => { deleteContact(c.id); refresh(); }} className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Department 5: Project Analyzer
// ═════════════════════════════════════════════════════════════════

export function ProjectAnalyzerDept() {
  const [projects, setProjects] = useState<BusinessProject[]>(getProjects());
  const [suggestions, setSuggestions] = useState<Suggestion[]>(getSuggestions());
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [autoAddedCount, setAutoAddedCount] = useState(0);
  const [lastSuggestionTime, setLastSuggestionTime] = useState<number>(0);

  const refresh = () => {
    setProjects(getProjects());
    setSuggestions(getSuggestions());
  };

  // 25 suggestions every 15 minutes + auto-add after 1 hour
  useEffect(() => {
    const runSuggestions = () => {
      generateSuggestionsForAllProjects();
      const added = autoAddSuggestionsAfterOneHour();
      if (added > 0) setAutoAddedCount(added);
      setLastSuggestionTime(Date.now());
      refresh();
    };

    // Run immediately if projects exist
    if (getProjects().length > 0) {
      runSuggestions();
    }

    // Then every 15 minutes
    const interval = setInterval(runSuggestions, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateProject = () => {
    if (!newProject.name) return;
    const project = saveProject({
      name: newProject.name,
      description: newProject.description,
      status: "planning",
    });
    setNewProject({ name: "", description: "" });
    setShowProjectForm(false);
    refresh();
    // Generate initial suggestions
    generateSuggestionsForAllProjects();
    refresh();
  };

  const handleAnalyze = (projectId: string) => {
    const project = getProjects().find(p => p.id === projectId);
    if (!project) return;
    const result = analyzeProject(project);
    setAnalysis(result);
    setSelectedProject(projectId);
    // Also generate fresh suggestions
    generateSuggestionsForAllProjects();
    refresh();
  };

  const handleAddTask = (projectId: string, taskText: string) => {
    const project = getProjects().find(p => p.id === projectId);
    if (!project || !taskText) return;
    const tasks = [...project.tasks, { id: `${Date.now()}`, text: taskText, done: false }];
    const completed = tasks.filter(t => t.done).length;
    const progress = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
    updateProject(projectId, { tasks, progress });
    refresh();
  };

  const handleToggleTask = (projectId: string, taskId: string) => {
    const project = getProjects().find(p => p.id === projectId);
    if (!project) return;
    const tasks = project.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    const completed = tasks.filter(t => t.done).length;
    const progress = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
    updateProject(projectId, { tasks, progress, status: progress === 100 ? "complete" : "in-progress" });
    refresh();
  };

  const newSuggestions = suggestions.filter(s => s.status === "new");
  const acceptedSuggestions = suggestions.filter(s => s.status === "accepted" || s.status === "auto-added");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ScanSearch className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold">Project Analyzer</h2>
        <span className="text-[10px] text-muted ml-auto">
          {newSuggestions.length} new · {acceptedSuggestions.length} added
        </span>
        <button
          onClick={() => setShowProjectForm(!showProjectForm)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/20 text-accent text-xs"
        >
          <Plus className="w-3 h-3" /> New Project
        </button>
      </div>

      {/* Timer indicator */}
      <div className="flex items-center gap-2 text-[10px] text-muted">
        <Clock className="w-3 h-3" />
        {lastSuggestionTime > 0 ? (
          <span>Last suggestion run: {new Date(lastSuggestionTime).toLocaleTimeString()} · Next in ~15 min</span>
        ) : (
          <span>Suggestions generate every 15 minutes · Auto-add to memory after 1 hour</span>
        )}
        {autoAddedCount > 0 && (
          <span className="text-success">· {autoAddedCount} auto-added to memory</span>
        )}
      </div>

      {/* New project form */}
      {showProjectForm && (
        <div className="p-3 rounded-xl bg-bg-alt border border-accent/20 space-y-2">
          <input type="text" placeholder="Project name *" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} className="w-full px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm" />
          <textarea placeholder="Project description" value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} className="w-full px-2 py-1.5 rounded-lg bg-bg-card border border-white/10 text-sm min-h-[60px]" />
          <div className="flex gap-2">
            <button onClick={handleCreateProject} disabled={!newProject.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success text-sm disabled:opacity-50">
              <CheckCircle className="w-4 h-4" /> Create
            </button>
            <button onClick={() => setShowProjectForm(false)} className="px-3 py-2 rounded-lg bg-white/5 text-muted text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Projects list */}
      <div className="space-y-2">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted">
            <Folder className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No projects yet</p>
            <p className="text-[10px] mt-1">Create a project to start analysis</p>
          </div>
        ) : (
          projects.map(p => (
            <div key={p.id} className="p-3 rounded-lg bg-bg-alt border border-white/5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">{p.name}</p>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded font-mono",
                    p.status === "complete" ? "bg-success/20 text-success" :
                    p.status === "in-progress" ? "bg-accent/20 text-accent" :
                    p.status === "paused" ? "bg-warning/20 text-warning" :
                    "bg-white/5 text-muted"
                  )}>{p.status}</span>
                  <span className="text-[9px] text-muted">{p.progress}%</span>
                  <button onClick={() => handleAnalyze(p.id)} className="p-1 rounded text-accent hover:bg-accent/10" title="Analyze">
                    <ScanSearch className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { deleteProject(p.id); refresh(); }} className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {p.description && <p className="text-[10px] text-muted mb-1">{p.description}</p>}
              {/* Progress bar */}
              <div className="h-1 rounded-full bg-white/5 mb-2">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${p.progress}%` }} />
              </div>
              {/* Tasks */}
              {p.tasks.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  {p.tasks.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-[10px]">
                      <button onClick={() => handleToggleTask(p.id, t.id)} className={cn("w-3 h-3 rounded border flex items-center justify-center", t.done ? "bg-success border-success" : "border-white/20")} >
                        {t.done && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <span className={cn(t.done ? "line-through text-muted" : "text-text")}>{t.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Quick add task */}
              <TaskQuickAdd projectId={p.id} onAdd={handleAddTask} />
              {/* Analysis */}
              {selectedProject === p.id && analysis && (
                <div className="mt-2 p-2 rounded-lg bg-bg-card border border-accent/10 text-[10px] space-y-1">
                  <p className="font-semibold text-accent flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Analysis Report
                  </p>
                  {analysis.present.length > 0 && (
                    <div>
                      <p className="text-success font-medium">Present:</p>
                      {analysis.present.map((item, i) => <p key={i} className="text-muted pl-3">✓ {item}</p>)}
                    </div>
                  )}
                  {analysis.missing.length > 0 && (
                    <div>
                      <p className="text-danger font-medium">Missing:</p>
                      {analysis.missing.map((item, i) => <p key={i} className="text-muted pl-3">✗ {item}</p>)}
                    </div>
                  )}
                  {analysis.improvements.length > 0 && (
                    <div>
                      <p className="text-warning font-medium">Improvements ({analysis.improvements.length}):</p>
                      {analysis.improvements.slice(0, 5).map((item, i) => <p key={i} className="text-muted pl-3">{i + 1}. {item}</p>)}
                      {analysis.improvements.length > 5 && <p className="text-muted pl-3">...and {analysis.improvements.length - 5} more</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Suggestions */}
      {newSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4 text-warning" />
            New Suggestions ({newSuggestions.length})
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
            {newSuggestions.slice(0, 25).map(s => (
              <div key={s.id} className="flex items-start gap-2 p-2 rounded-lg bg-warning/5 border border-warning/10">
                <div className="flex-1">
                  <p className="text-[11px] font-medium">{s.title}</p>
                  <p className="text-[10px] text-muted">{s.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-[8px] px-1 py-0.5 rounded font-mono",
                      s.priority === "high" ? "bg-danger/20 text-danger" :
                      s.priority === "medium" ? "bg-warning/20 text-warning" :
                      "bg-white/5 text-muted"
                    )}>{s.priority}</span>
                    <span className="text-[8px] text-muted">{s.category}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { acceptSuggestion(s.id); refresh(); }} className="p-1 rounded text-success hover:bg-success/10">
                    <CheckCircle className="w-3 h-3" />
                  </button>
                  <button onClick={() => { dismissSuggestion(s.id); refresh(); }} className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="p-2 rounded-lg bg-accent/5 border border-accent/10 text-[10px] text-muted">
        <p className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-accent" />
          25 suggestions generated every 15 min · Auto-added to universal memory + journal after 1 hour of project activity
        </p>
      </div>
    </div>
  );
}

function TaskQuickAdd({ projectId, onAdd }: { projectId: string; onAdd: (id: string, text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-1">
      <input
        type="text"
        placeholder="Add task..."
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && text) {
            onAdd(projectId, text);
            setText("");
          }
        }}
        className="flex-1 px-2 py-1 rounded-lg bg-bg-card border border-white/10 text-[10px]"
      />
      <button
        onClick={() => { if (text) { onAdd(projectId, text); setText(""); } }}
        className="px-2 py-1 rounded-lg bg-accent/20 text-accent text-[10px]"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Custom Departments (2, 3, 6, 7, 8)
// ═════════════════════════════════════════════════════════════════

export function CustomDept({ dept, onUpdate }: { dept: Department; onUpdate: (updates: Partial<Department>) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const [description, setDescription] = useState(dept.description);

  const handleSave = () => {
    onUpdate({ name, description });
    updateDepartment(dept.id, { name, description });
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Folder className="w-5 h-5 text-accent" />
        {editing ? (
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="px-2 py-1 rounded-lg bg-bg-alt border border-white/10 text-sm font-semibold" />
        ) : (
          <h2 className="text-lg font-semibold">{dept.name}</h2>
        )}
        <span className="text-[10px] text-muted ml-auto">Custom Department</span>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 text-muted text-xs hover:bg-white/10"
        >
          <Settings className="w-3 h-3" /> {editing ? "Cancel" : "Configure"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            placeholder="Department description..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-bg-alt border border-white/10 text-sm min-h-[60px]"
          />
          <button onClick={handleSave} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/20 text-success text-sm">
            <CheckCircle className="w-4 h-4" /> Save
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted">
          <Settings className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">{dept.description}</p>
          <p className="text-[10px] mt-2">Click "Configure" to customize this department</p>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Cline AI Agent — Connected via incllmv2 (GLM 5.1 / Ollama)
// Same pattern as Aceline in Wakkii Links
// ═════════════════════════════════════════════════════════════════

export function ClineAgentDept() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "ai"; text: string; actions?: string[] }>>([
    {
      role: "ai",
      text: `Hi! I'm Cline, your AI coding assistant for the Business Archive. I can analyze projects, suggest improvements, write code snippets, and help manage your business documents. I connect through the Soulmate OS backend using GLM 5.1. What do you need help with?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [model, setModel] = useState<string>(() => {
    try { return localStorage.getItem("cline_model") || "trill"; } catch { return "trill"; }
  });
  const [showModels, setShowModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; params: string }>>([]);
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const AI_MODELS = [
    { id: "trill", name: "GLM 5.1", desc: "Standard · Balanced", icon: <Brain className="w-3 h-3" />, color: "text-blue-400" },
    { id: "singularity", name: "Singularity", desc: "Analytical · Precision", icon: <Cpu className="w-3 h-3" />, color: "text-purple-400" },
    { id: "splitbit", name: "SplitBit", desc: "Compressed · Efficient", icon: <Terminal className="w-3 h-3" />, color: "text-green-400" },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    incllmv2Api.models().then(async (res) => {
      try {
        const data = await res.json();
        if (data.models) setAvailableModels(data.models);
      } catch {}
    }).catch(() => {});
  }, []);

  const fetchMemoryCount = useCallback(async () => {
    try {
      const res = await incllmv2Api.memories();
      const data = await res.json();
      setMemoryCount(data.memories?.length || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchMemoryCount(); }, [fetchMemoryCount]);

  const speak = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#>]/g, "").slice(0, 500);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Voice input not supported. Use Chrome or Edge."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    setListening(false);
  };

  const generateLocalResponse = (query: string): string => {
    const q = query.toLowerCase();
    const projects = getProjects();
    const docs = getDocuments();
    const contacts = getContacts();
    const suggestions = getSuggestions();

    if (q.includes("project") || q.includes("analyz") || q.includes("status")) {
      return `Here's the current Business Archive status:\n\n**Projects:** ${projects.length} tracked\n**Documents:** ${docs.length} filed\n**Contacts:** ${contacts.length} stored\n**Suggestions:** ${suggestions.filter(s => s.status === "new").length} pending\n\n${projects.length > 0 ? "Latest project: " + projects[0].name + " (" + projects[0].progress + "% complete)" : "No projects yet. Create one in the Project Analyzer department."}`;
    }
    if (q.includes("suggest") || q.includes("improv") || q.includes("missing")) {
      const newSugs = suggestions.filter(s => s.status === "new").slice(0, 5);
      if (newSugs.length === 0) return "No new suggestions. The Project Analyzer generates 25 suggestions every 15 minutes for active projects.";
      return `Here are ${newSugs.length} suggestions:\n\n${newSugs.map((s, i) => `${i + 1}. [${s.priority}] ${s.title}`).join("\n")}`;
    }
    if (q.includes("document") || q.includes("fax") || q.includes("scan")) {
      return `The Fax Machine has ${docs.length} documents filed. Use the camera to scan new documents — they auto-file by name to universal memory and journal. Categories include Contract, Invoice, Legal, Receipt, and more.`;
    }
    if (q.includes("contact") || q.includes("address") || q.includes("fax number")) {
      return `You have ${contacts.length} contacts stored. Each contact can have fax numbers, phone, email, and full address. All contacts are saved to universal memory.`;
    }
    if (q.includes("memory") || q.includes("remember")) {
      return `Universal memory has ${memoryCount || "unknown"} entries from the backend, plus all Business Archive data in localStorage. Every document scan, contact save, and project update is auto-logged.`;
    }
    if (q.includes("code") || q.includes("build") || q.includes("feature")) {
      return `I can help you build features for the Business Archive or any Soulmate OS component. I work with the same backend as Aceline in Wakkii Links — using GLM 5.1 via the incllmv2 backend. Tell me what you want to build.`;
    }
    if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
      return `Hello! I'm Cline, your AI coding assistant for the Business Archive. I can analyze projects, suggest improvements, help with documents, and write code. What do you need?`;
    }
    return `I'm running in offline mode (no local backend detected). I can still help with:\n\n• Project analysis and suggestions\n• Document and contact management\n• Code generation for Business Archive features\n• Universal memory and journal queries\n\nFor full AI capabilities, run the Soulmate server locally with Ollama + GLM 5.1.`;
  };

  const send = async () => {
    if (!input.trim() || thinking) return;
    const text = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setThinking(true);

    // Log to business journal
    addJournalEntry({
      text: `Cline query: ${text}`,
      mood: "neutral",
      tags: ["cline", "ai", "query"],
      source: "cline-agent",
    });

    try {
      const result = await incllmv2Api.jarvis(text, model, { agent: "cline", source: "business-archive" });
      const data = await result.json();
      const reply = data.response || "No response";
      setMessages(prev => [...prev, { role: "ai", text: reply, actions: data.actions_taken || [] }]);
      speak(reply);
    } catch {
      const reply = generateLocalResponse(text);
      setMessages(prev => [...prev, { role: "ai", text: reply }]);
      speak(reply);
    } finally {
      setThinking(false);
    }
  };

  const quickActions = [
    "Analyze my projects",
    "What suggestions do you have?",
    "Help me write code",
    "Show business archive status",
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-base flex items-center gap-2">
            Cline
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-normal">
              AI CODING AGENT
            </span>
          </h3>
          <p className="text-xs text-muted">
            GLM 5.1 via incllmv2 · Voice enabled · Connected to universal memory
          </p>
        </div>
        <button
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          className={cn("text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors",
            voiceEnabled ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted")}
          title="Toggle voice output"
        >
          <Mic className="w-3 h-3" />
        </button>
        <button
          onClick={() => setShowModels(!showModels)}
          className={cn("text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors",
            showModels ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted")}
          title="Switch AI model"
        >
          <Brain className="w-3 h-3" />
          {AI_MODELS.find(m => m.id === model)?.name || "GLM 5.1"}
        </button>
      </div>

      {/* Model picker */}
      {showModels && (
        <div className="p-3 rounded-xl bg-bg-alt space-y-1">
          <p className="text-xs font-semibold text-muted mb-2">Select Model</p>
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => {
                setModel(m.id);
                try { localStorage.setItem("cline_model", m.id); } catch {}
                setShowModels(false);
              }}
              className={cn("w-full flex items-center justify-between p-2 rounded-lg text-left text-xs",
                model === m.id ? "bg-accent/15" : "hover:bg-bg-card")}
            >
              <div className="flex items-center gap-2">
                <span className={m.color}>{m.icon}</span>
                <div>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted ml-2 text-[10px]">{m.desc}</span>
                </div>
              </div>
              {model === m.id && <CheckCircle className="w-3 h-3 text-accent" />}
            </button>
          ))}
          {availableModels.length > 0 && (
            <>
              <p className="text-[10px] text-muted pt-2 border-t border-white/5 mt-2">Available Ollama models:</p>
              {availableModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    setModel(m.id);
                    try { localStorage.setItem("cline_model", m.id); } catch {}
                    setShowModels(false);
                  }}
                  className={cn("w-full flex items-center justify-between p-2 rounded-lg text-left text-xs",
                    model === m.id ? "bg-accent/15" : "hover:bg-bg-card")}
                >
                  <div>
                    <span className="font-medium">{m.name}</span>
                    {m.params && <span className="text-muted ml-2 text-[10px]">{m.params}</span>}
                  </div>
                  {model === m.id && <CheckCircle className="w-3 h-3 text-accent" />}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Memory info */}
      {memoryCount !== null && (
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <Brain className="w-3 h-3" />
          <span>{memoryCount} memories stored</span>
          <button
            onClick={async () => {
              try {
                await incllmv2Api.consolidateMemories();
                fetchMemoryCount();
              } catch {}
            }}
            className="text-accent hover:text-accent/80"
          >
            Consolidate
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-3 max-h-[40vh] overflow-y-auto no-scrollbar">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[80%] p-3 rounded-xl text-sm",
              msg.role === "user"
                ? "bg-accent/15 text-text"
                : "bg-bg-alt text-text border border-white/5"
            )}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5">
                  {msg.actions.map((a, j) => (
                    <p key={j} className="text-[10px] text-muted flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="bg-bg-alt p-3 rounded-xl text-sm text-muted flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0.2s" }} />
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1">
        {quickActions.map(action => (
          <button
            key={action}
            onClick={() => { setInput(action); }}
            className="text-[10px] px-2 py-1 rounded-lg bg-bg-alt text-muted hover:bg-accent/10 hover:text-accent transition"
          >
            {action}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <button
          onClick={listening ? stopListening : startListening}
          className={cn("p-2 rounded-lg transition",
            listening ? "bg-danger/20 text-danger animate-pulse" : "bg-bg-alt text-muted hover:text-text")}
        >
          <Mic className="w-4 h-4" />
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask Cline anything..."
          className="flex-1 px-3 py-2 rounded-lg bg-bg-alt border border-white/10 text-sm"
        />
        <button
          onClick={send}
          disabled={thinking || !input.trim()}
          className="p-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[10px] text-muted flex items-center gap-1">
        <Sparkles className="w-2.5 h-2.5" />
        Connected via incllmv2 backend · GLM 5.1 · Falls back to offline mode on deployed site
      </p>
    </div>
  );
}
