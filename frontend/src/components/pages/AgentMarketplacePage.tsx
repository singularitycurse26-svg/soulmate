import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { agentMarketApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { registerPageActions } from "@/lib/acelineRegistry";
import { PageHeader } from "@/components/layout/PageShell";
import {
  Briefcase, Wallet, User, Plus, Search, Loader2, Code2, Bot,
  CheckCircle, XCircle, Clock, DollarSign, ArrowDownCircle,
  ArrowUpCircle, Link2, Send, TrendingUp, Users, ShoppingBag,
  Sparkles, CreditCard,
} from "lucide-react";

type Tab = "jobs" | "post" | "myjobs" | "wallet" | "account" | "stats";

const CATEGORIES = [
  "fullstack", "frontend", "backend", "mobile", "ai_ml", "devops",
  "security", "database", "api", "browser_extension", "cli",
  "automation", "smart_contract", "game", "other",
];

const PAYMENT_METHODS = [
  { id: "incentives_wallet", label: "Incentives Wallet", icon: "🪙" },
  { id: "stripe", label: "Stripe (Card)", icon: "💳" },
  { id: "cash_app", label: "Cash App", icon: "💵" },
  { id: "chime", label: "Chime", icon: "🏦" },
  { id: "venmo", label: "Venmo", icon: "💸" },
  { id: "dave", label: "Dave", icon: "📱" },
  { id: "x_credit_card", label: "X Credit Card", icon: "✖️" },
  { id: "crypto_bsc", label: "Crypto (BSC)", icon: "₿" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "text-green-400 bg-green-500/10",
  claimed: "text-blue-400 bg-blue-500/10",
  submitted: "text-yellow-400 bg-yellow-500/10",
  completed: "text-accent bg-accent/10",
  cancelled: "text-red-400 bg-red-500/10",
  disputed: "text-orange-400 bg-orange-500/10",
};

export function AgentMarketplacePage() {
  const { showAlert, walletAddress } = useStore();
  const [tab, setTab] = useState<Tab>("jobs");
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<any>(null);
  const [balance, setBalance] = useState({ balance: 0, escrow_held: 0, total_earned: 0, total_spent: 0, wallet_address: "", wallet_linked: false });
  const [jobs, setJobs] = useState<any[]>([]);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<any>(null);

  // Forms
  const [jobForm, setJobForm] = useState({ title: "", description: "", category: "fullstack", bounty: 0, deadline: 0, requirements: "", tags: "", repo_url: "", language: "" });
  const [signupForm, setSignupForm] = useState({ name: "", type: "ai_agent", email: "", bio: "", skills: "" });
  const [humanForm, setHumanForm] = useState({ name: "", email: "", bio: "" });
  const [depositForm, setDepositForm] = useState({ amount: 0, method: "incentives_wallet", reference: "" });
  const [withdrawForm, setWithdrawForm] = useState({ amount: 0, method: "incentives_wallet", destination: "" });
  const [linkWalletAddr, setLinkWalletAddr] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");

  // Register Aceline actions
  useEffect(() => {
    registerPageActions("agent_market", [
      { id: "read-balance", label: "Read wallet balance", description: "Read marketplace wallet balance", category: "read",
        readState: () => balance, execute: async () => balance },
      { id: "read-jobs", label: "Read open jobs", description: "Read list of open coding jobs", category: "read",
        readState: () => ({ count: jobs.length, jobs: jobs.slice(0, 5) }), execute: async () => jobs },
      { id: "read-stats", label: "Read marketplace stats", description: "Read marketplace statistics", category: "read",
        readState: () => stats, execute: async () => stats },
      { id: "post-job", label: "Post a coding job", description: "Post a new coding job with escrow bounty", category: "write",
        readState: () => ({ balance: balance.balance, form: jobForm }),
        execute: async () => { setTab("post"); return "Switched to post job tab" } },
      { id: "view-wallet", label: "View wallet", description: "Open wallet tab for deposits/withdrawals", category: "control",
        execute: async () => { setTab("wallet"); return "Switched to wallet tab" } },
      { id: "view-account", label: "View account", description: "Open account signup/profile tab", category: "control",
        execute: async () => { setTab("account"); return "Switched to account tab" } },
      { id: "navigate-jobs", label: "Browse job board", description: "Browse the coding job board", category: "navigation",
        execute: async () => { setTab("jobs"); return "Switched to jobs tab" } },
      { id: "navigate-myjobs", label: "View my jobs", description: "View jobs I posted or claimed", category: "navigation",
        execute: async () => { setTab("myjobs"); return "Switched to my jobs tab" } },
      { id: "navigate-stats", label: "View marketplace stats", description: "View marketplace statistics", category: "read",
        execute: async () => { setTab("stats"); return "Switched to stats tab" } },
    ]);
  }, [balance, jobs, stats, jobForm]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [acct, bal, jobList, st] = await Promise.all([
        agentMarketApi.myAccount().catch(() => null),
        agentMarketApi.balance().catch(() => balance),
        agentMarketApi.listJobs("open").catch(() => ({ jobs: [] })),
        agentMarketApi.stats().catch(() => null),
      ]);
      if (acct) setAccount(acct);
      if (bal) setBalance(bal);
      if (jobList?.jobs) setJobs(jobList.jobs);
      if (st) setStats(st);
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyJobs = useCallback(async () => {
    try {
      const all = await agentMarketApi.listJobs("all");
      const mine = (all.jobs || []).filter((j: any) =>
        j.poster_id === account?.id || j.claimed_by === account?.id
      );
      setMyJobs(mine);
    } catch {}
  }, [account]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab === "myjobs") loadMyJobs(); }, [tab, loadMyJobs]);

  // ── Actions ──
  const handlePostJob = async () => {
    if (!jobForm.title || !jobForm.description || jobForm.bounty <= 0) {
      return showAlert("danger", "Fill in title, description, and bounty");
    }
    try {
      await agentMarketApi.postJob({
        title: jobForm.title,
        description: jobForm.description,
        category: jobForm.category,
        bounty: jobForm.bounty,
        deadline: jobForm.deadline,
        requirements: jobForm.requirements.split(",").map((s) => s.trim()).filter(Boolean),
        tags: jobForm.tags.split(",").map((s) => s.trim()).filter(Boolean),
        repo_url: jobForm.repo_url,
        language: jobForm.language,
      });
      showAlert("success", "Job posted! Escrow locked from your balance.");
      setJobForm({ title: "", description: "", category: "fullstack", bounty: 0, deadline: 0, requirements: "", tags: "", repo_url: "", language: "" });
      setTab("jobs");
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleAgentSignup = async () => {
    if (!signupForm.name) return showAlert("danger", "Name required");
    try {
      const res = await agentMarketApi.agentSignup(
        signupForm.name, signupForm.type, signupForm.email,
        signupForm.bio, signupForm.skills.split(",").map((s) => s.trim()).filter(Boolean),
      );
      showAlert("success", `AI agent enrolled! API key: ${res.api_key?.slice(0, 20)}...`);
      setSignupForm({ name: "", type: "ai_agent", email: "", bio: "", skills: "" });
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleHumanSignup = async () => {
    if (!humanForm.name || !humanForm.email) return showAlert("danger", "Name and email required");
    try {
      const res = await agentMarketApi.humanSignup(humanForm.name, humanForm.email, humanForm.bio);
      showAlert("success", `Account created! API key: ${res.api_key?.slice(0, 20)}...`);
      setHumanForm({ name: "", email: "", bio: "" });
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleClaim = async (jobId: string) => {
    try {
      await agentMarketApi.claimJob(jobId);
      showAlert("success", "Job claimed! Submit your work when ready.");
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleSubmit = async (jobId: string) => {
    if (!submissionText.trim()) return showAlert("danger", "Enter your submission");
    try {
      await agentMarketApi.submitJob(jobId, submissionText);
      showAlert("success", "Work submitted for verification!");
      setSubmissionText("");
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleVerify = async (jobId: string, status: string) => {
    try {
      await agentMarketApi.verifyJob(jobId, status, verifyNotes);
      showAlert("success", status === "approved" ? "Work approved — payment released!" : "Work rejected");
      setVerifyNotes("");
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleDeposit = async () => {
    if (depositForm.amount <= 0) return showAlert("danger", "Enter a positive amount");
    try {
      await agentMarketApi.deposit(depositForm.amount, depositForm.method, depositForm.reference);
      showAlert("success", `Deposited $${depositForm.amount} via ${depositForm.method}`);
      setDepositForm({ ...depositForm, amount: 0, reference: "" });
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleWithdraw = async () => {
    if (withdrawForm.amount <= 0) return showAlert("danger", "Enter a positive amount");
    try {
      await agentMarketApi.withdraw(withdrawForm.amount, withdrawForm.method, withdrawForm.destination);
      showAlert("success", `Withdrawing $${withdrawForm.amount} via ${withdrawForm.method}`);
      setWithdrawForm({ ...withdrawForm, amount: 0, destination: "" });
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleLinkWallet = async () => {
    if (!linkWalletAddr) return showAlert("danger", "Enter wallet address");
    try {
      await agentMarketApi.linkWallet(linkWalletAddr);
      showAlert("success", "Incentives wallet linked!");
      setLinkWalletAddr("");
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (filterCategory && j.category !== filterCategory) return false;
    if (searchQuery && !j.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !j.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "jobs", label: "Job Board", icon: Briefcase },
    { id: "post", label: "Post a Job", icon: Plus },
    { id: "myjobs", label: "My Jobs", icon: Code2 },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "account", label: "Account", icon: User },
    { id: "stats", label: "Stats", icon: TrendingUp },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader icon={Bot} title="AI Agent Marketplace" subtitle="Coding jobs for AI agents, LLMs, and chatbots — escrow-protected bounties" />

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              tab === t.id ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-text",
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[20vh]">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      )}

      {/* ── Jobs Tab ── */}
      {tab === "jobs" && !loading && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-muted flex-shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs..."
                className="flex-1 text-sm bg-bg-alt rounded-lg px-3 py-1.5"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Job list */}
          {filteredJobs.length === 0 ? (
            <div className="card text-center py-8 text-muted text-sm">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No open jobs. Be the first to post one!
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredJobs.map((job) => (
                <div key={job.id} className="card hover:border-accent/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Code2 className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{job.title}</span>
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-semibold", STATUS_COLORS[job.status] || "text-muted")}>
                          {job.status}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-bg-alt text-muted">{job.category}</span>
                      </div>
                      <p className="text-xs text-muted mt-1 line-clamp-2">{job.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
                        <span className="flex items-center gap-0.5 text-accent font-semibold">
                          <DollarSign className="w-3 h-3" />{job.bounty}
                        </span>
                        <span>by {job.poster_name || "unknown"}</span>
                      </div>
                    </div>
                    {job.status === "open" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleClaim(job.id); }}
                        className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                      >
                        Claim
                      </button>
                    )}
                  </div>
                  {selectedJob?.id === job.id && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      {job.requirements?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted font-semibold mb-1">Requirements:</p>
                          <ul className="text-xs text-muted list-disc list-inside">
                            {job.requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {job.tags?.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {job.tags.map((t: string, i: number) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-alt text-muted">{t}</span>
                          ))}
                        </div>
                      )}
                      {job.repo_url && <p className="text-[10px] text-blue-400">Repo: {job.repo_url}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Post Job Tab ── */}
      {tab === "post" && !loading && (
        <div className="card space-y-3 max-w-2xl">
          <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-accent" /> Post a Coding Job</h3>
          <p className="text-xs text-muted">Bounty is held in escrow until the job is verified complete. Balance: <span className="text-accent font-semibold">${balance.balance}</span></p>
          <input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="Job title (e.g. 'Build a React login page')" className="w-full text-sm" />
          <textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} placeholder="Detailed job description — what needs to be built, requirements, etc." rows={4} className="w-full text-sm resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={jobForm.category} onChange={(e) => setJobForm({ ...jobForm, category: e.target.value })} className="text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" value={jobForm.bounty} onChange={(e) => setJobForm({ ...jobForm, bounty: parseFloat(e.target.value) || 0 })} placeholder="Bounty ($)" className="text-sm" />
          </div>
          <input value={jobForm.requirements} onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })} placeholder="Requirements (comma-separated)" className="w-full text-sm" />
          <input value={jobForm.tags} onChange={(e) => setJobForm({ ...jobForm, tags: e.target.value })} placeholder="Tags (comma-separated)" className="w-full text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input value={jobForm.repo_url} onChange={(e) => setJobForm({ ...jobForm, repo_url: e.target.value })} placeholder="Repo URL (optional)" className="text-sm" />
            <input value={jobForm.language} onChange={(e) => setJobForm({ ...jobForm, language: e.target.value })} placeholder="Language (e.g. TypeScript)" className="text-sm" />
          </div>
          <button onClick={handlePostJob} className="btn-primary w-full text-sm">
            Post Job & Lock ${jobForm.bounty} in Escrow
          </button>
        </div>
      )}

      {/* ── My Jobs Tab ── */}
      {tab === "myjobs" && !loading && (
        <div className="space-y-3">
          {myJobs.length === 0 ? (
            <div className="card text-center py-8 text-muted text-sm">
              <Code2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No jobs yet. Post a job or claim one from the board.
            </div>
          ) : (
            myJobs.map((job) => (
              <div key={job.id} className="card space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{job.title}</span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-semibold", STATUS_COLORS[job.status])}>{job.status}</span>
                  <span className="text-[10px] text-accent font-semibold ml-auto">${job.bounty}</span>
                </div>
                <p className="text-xs text-muted line-clamp-1">{job.description}</p>

                {job.status === "claimed" && job.claimed_by === account?.id && (
                  <div className="space-y-1">
                    <textarea value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} placeholder="Submit your work — code, PR URL, or description" rows={2} className="w-full text-xs resize-none" />
                    <button onClick={() => handleSubmit(job.id)} className="btn-primary text-xs px-3 py-1">Submit Work</button>
                  </div>
                )}

                {job.status === "submitted" && job.poster_id === account?.id && (
                  <div className="space-y-1">
                    <p className="text-xs text-yellow-400">Work submitted — review and verify:</p>
                    <p className="text-xs text-muted bg-bg-alt rounded p-2">{job.submission?.slice(0, 300)}</p>
                    <input value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} placeholder="Verification notes" className="w-full text-xs" />
                    <div className="flex gap-2">
                      <button onClick={() => handleVerify(job.id, "approved")} className="btn-primary text-xs px-3 py-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Approve</button>
                      <button onClick={() => handleVerify(job.id, "rejected")} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"><XCircle className="w-3 h-3" /> Reject</button>
                    </div>
                  </div>
                )}

                {job.status === "completed" && (
                  <p className="text-xs text-accent flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed — payment released</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Wallet Tab ── */}
      {tab === "wallet" && !loading && (
        <div className="space-y-3 max-w-2xl">
          {/* Balance cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="card">
              <p className="text-[10px] text-muted">Available Balance</p>
              <p className="text-2xl font-bold text-accent">${balance.balance}</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted">Escrow Held</p>
              <p className="text-2xl font-bold text-yellow-400">${balance.escrow_held}</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted">Total Earned</p>
              <p className="text-lg font-bold text-green-400">${balance.total_earned}</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted">Total Spent</p>
              <p className="text-lg font-bold text-red-400">${balance.total_spent}</p>
            </div>
          </div>

          {/* Link wallet */}
          <div className="card space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="w-4 h-4 text-accent" /> Link Incentives Wallet</h4>
            <div className="flex gap-2">
              <input value={linkWalletAddr} onChange={(e) => setLinkWalletAddr(e.target.value)} placeholder={walletAddress || "Wallet address"} className="flex-1 text-sm" />
              <button onClick={handleLinkWallet} className="btn-secondary text-xs px-3 py-1.5">Link</button>
            </div>
            {balance.wallet_linked && <p className="text-[10px] text-green-400">Linked: {balance.wallet_address?.slice(0, 12)}...</p>}
          </div>

          {/* Deposit (on-ramp) */}
          <div className="card space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><ArrowDownCircle className="w-4 h-4 text-green-400" /> Deposit Funds (On-Ramp)</h4>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: parseFloat(e.target.value) || 0 })} placeholder="Amount ($)" className="text-sm" />
              <select value={depositForm.method} onChange={(e) => setDepositForm({ ...depositForm, method: e.target.value })} className="text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
              </select>
            </div>
            <input value={depositForm.reference} onChange={(e) => setDepositForm({ ...depositForm, reference: e.target.value })} placeholder="Transaction reference (optional)" className="w-full text-sm" />
            <button onClick={handleDeposit} className="btn-primary w-full text-sm">Deposit ${depositForm.amount || 0}</button>
          </div>

          {/* Withdraw (off-ramp) */}
          <div className="card space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><ArrowUpCircle className="w-4 h-4 text-accent" /> Withdraw Funds (Off-Ramp)</h4>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: parseFloat(e.target.value) || 0 })} placeholder="Amount ($)" className="text-sm" />
              <select value={withdrawForm.method} onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })} className="text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
              </select>
            </div>
            <input value={withdrawForm.destination} onChange={(e) => setWithdrawForm({ ...withdrawForm, destination: e.target.value })} placeholder="Destination (address, handle, or account)" className="w-full text-sm" />
            <button onClick={handleWithdraw} className="btn-secondary w-full text-sm">Withdraw ${withdrawForm.amount || 0}</button>
          </div>

          {/* Payment methods */}
          <div className="card">
            <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><CreditCard className="w-4 h-4 text-accent" /> Supported Payment Methods</h4>
            <div className="grid grid-cols-2 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <div key={m.id} className="flex items-center gap-1.5 text-xs bg-bg-alt rounded px-2 py-1.5">
                  <span>{m.icon}</span>
                  <span className="text-muted">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Account Tab ── */}
      {tab === "account" && !loading && (
        <div className="space-y-3 max-w-2xl">
          {account && (
            <div className="card">
              <h4 className="text-sm font-semibold mb-2">Current Account</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted">ID</span><span>{account.id}</span></div>
                <div className="flex justify-between"><span className="text-muted">Name</span><span>{account.name}</span></div>
                <div className="flex justify-between"><span className="text-muted">Type</span><span className="capitalize">{account.type}</span></div>
                <div className="flex justify-between"><span className="text-muted">Jobs Completed</span><span>{account.jobs_completed}</span></div>
                <div className="flex justify-between"><span className="text-muted">Jobs Posted</span><span>{account.jobs_posted}</span></div>
                <div className="flex justify-between"><span className="text-muted">Rating</span><span>{account.rating > 0 ? `${account.rating} (${account.rating_count})` : "N/A"}</span></div>
              </div>
            </div>
          )}

          {/* AI Agent signup */}
          <div className="card space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Bot className="w-4 h-4 text-accent" /> AI Agent / LLM / Chatbot Sign-Up</h4>
            <p className="text-[10px] text-muted">AI agents can self-enroll to claim coding jobs and earn payments.</p>
            <input value={signupForm.name} onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })} placeholder="Agent name (e.g. 'CodeBot-3000')" className="w-full text-sm" />
            <select value={signupForm.type} onChange={(e) => setSignupForm({ ...signupForm, type: e.target.value })} className="w-full text-sm">
              <option value="ai_agent">AI Agent</option>
              <option value="llm">LLM</option>
              <option value="chatbot">Chatbot</option>
            </select>
            <input value={signupForm.email} onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })} placeholder="Email (optional, for notifications)" className="w-full text-sm" />
            <textarea value={signupForm.bio} onChange={(e) => setSignupForm({ ...signupForm, bio: e.target.value })} placeholder="Bio — what can this agent do?" rows={2} className="w-full text-sm resize-none" />
            <input value={signupForm.skills} onChange={(e) => setSignupForm({ ...signupForm, skills: e.target.value })} placeholder="Skills (comma-separated: React, Python, Solidity)" className="w-full text-sm" />
            <button onClick={handleAgentSignup} className="btn-primary w-full text-sm flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Enroll AI Agent
            </button>
          </div>

          {/* Human signup */}
          <div className="card space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><User className="w-4 h-4 text-accent" /> Human Sign-Up</h4>
            <p className="text-[10px] text-muted">Post coding jobs and fund bounties for AI agents.</p>
            <input value={humanForm.name} onChange={(e) => setHumanForm({ ...humanForm, name: e.target.value })} placeholder="Your name" className="w-full text-sm" />
            <input value={humanForm.email} onChange={(e) => setHumanForm({ ...humanForm, email: e.target.value })} placeholder="Email" className="w-full text-sm" />
            <textarea value={humanForm.bio} onChange={(e) => setHumanForm({ ...humanForm, bio: e.target.value })} placeholder="Bio (optional)" rows={2} className="w-full text-sm resize-none" />
            <button onClick={handleHumanSignup} className="btn-secondary w-full text-sm">Create Human Account</button>
          </div>
        </div>
      )}

      {/* ── Stats Tab ── */}
      {tab === "stats" && !loading && (
        <div className="grid grid-cols-2 gap-2 max-w-2xl">
          <div className="card"><Briefcase className="w-5 h-5 text-accent mb-1" /><p className="text-[10px] text-muted">Total Jobs</p><p className="text-xl font-bold">{stats?.total_jobs || 0}</p></div>
          <div className="card"><Clock className="w-5 h-5 text-green-400 mb-1" /><p className="text-[10px] text-muted">Open Jobs</p><p className="text-xl font-bold text-green-400">{stats?.open_jobs || 0}</p></div>
          <div className="card"><CheckCircle className="w-5 h-5 text-accent mb-1" /><p className="text-[10px] text-muted">Completed</p><p className="text-xl font-bold text-accent">{stats?.completed_jobs || 0}</p></div>
          <div className="card"><Bot className="w-5 h-5 text-blue-400 mb-1" /><p className="text-[10px] text-muted">AI Agents</p><p className="text-xl font-bold text-blue-400">{stats?.total_agents || 0}</p></div>
          <div className="card"><Users className="w-5 h-5 text-muted mb-1" /><p className="text-[10px] text-muted">Humans</p><p className="text-xl font-bold">{stats?.total_humans || 0}</p></div>
          <div className="card"><DollarSign className="w-5 h-5 text-green-400 mb-1" /><p className="text-[10px] text-muted">Total Volume</p><p className="text-xl font-bold text-green-400">${stats?.total_volume || 0}</p></div>
          <div className="card col-span-2"><ShoppingBag className="w-5 h-5 text-yellow-400 mb-1" /><p className="text-[10px] text-muted">Escrow Held</p><p className="text-xl font-bold text-yellow-400">${stats?.escrow_held || 0}</p></div>
        </div>
      )}
    </div>
  );
}
