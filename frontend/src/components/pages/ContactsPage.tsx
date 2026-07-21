import { useState, useEffect } from "react";
import { contactsApi } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Users, Plus, Search, Mail, Phone, Wallet, Trash2, Edit3, X, Tag, Upload, Download,
} from "lucide-react";

interface Contact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  wallet_address?: string;
  notes?: string;
  group_id?: number;
  created_at?: string;
}

export function ContactsPage() {
  const { showAlert, setActivePage, walletAddress } = useStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [wallet, setWallet] = useState("");
  const [notes, setNotes] = useState("");

  const loadContacts = async () => {
    try {
      const data = await contactsApi.list();
      setContacts(data.contacts || []);
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContacts(); }, []);

  const resetForm = () => {
    setName(""); setEmail(""); setPhone(""); setWallet(""); setNotes("");
    setEditing(null);
  };

  const handleSave = async () => {
    if (!name.trim()) return showAlert("danger", "Name is required");
    try {
      if (editing) {
        await contactsApi.update(editing.id, { name, email, phone, wallet_address: wallet, notes });
        showAlert("success", "Contact updated");
      } else {
        await contactsApi.create({ name, email, phone, wallet_address: wallet, notes });
        showAlert("success", "Contact added");
      }
      resetForm();
      setShowAdd(false);
      loadContacts();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await contactsApi.delete(id);
      showAlert("info", "Contact deleted");
      loadContacts();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleEdit = (contact: Contact) => {
    setEditing(contact);
    setName(contact.name);
    setEmail(contact.email || "");
    setPhone(contact.phone || "");
    setWallet(contact.wallet_address || "");
    setNotes(contact.notes || "");
    setShowAdd(true);
  };

  const handleExport = () => {
    const csv = "Name,Email,Phone,Wallet,Notes\n" + contacts.map(c =>
      `"${c.name}","${c.email || ""}","${c.phone || ""}","${c.wallet_address || ""}","${c.notes || ""}"`
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Contacts</h2>
          <p className="text-muted text-sm mt-1">{contacts.length} contacts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-ghost p-2" title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={() => { resetForm(); setShowAdd(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="w-full pl-10"
        />
      </div>

      {/* Contact list */}
      {loading ? (
        <p className="text-muted text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-muted mx-auto mb-3" />
          <p className="text-muted">No contacts yet. Click "Add" to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((contact) => (
            <div key={contact.id} className="card flex items-center gap-3 hover:border-accent transition-all">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <span className="text-accent font-bold text-sm">
                  {contact.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{contact.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted">
                  {contact.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{contact.email}</span>}
                  {contact.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                </div>
              </div>
              <div className="flex gap-1">
                {contact.wallet_address && (
                  <button
                    onClick={() => { setActivePage("wallet"); }}
                    className="p-2 text-muted hover:text-accent"
                    title="Send crypto"
                  >
                    <Wallet className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => handleEdit(contact)} className="p-2 text-muted hover:text-accent">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(contact.id)} className="p-2 text-muted hover:text-danger">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setShowAdd(false)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editing ? "Edit Contact" : "Add Contact"}</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="label">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="w-full mb-3" />

            <label className="label">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" className="w-full mb-3" />

            <label className="label">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0000" className="w-full mb-3" />

            <label className="label">Wallet Address</label>
            <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x..." className="w-full mb-3" />

            <label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="w-full mb-4 h-20" />

            <button onClick={handleSave} className="btn-primary w-full">
              {editing ? "Update" : "Add Contact"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
