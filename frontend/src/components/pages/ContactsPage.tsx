import { useState, useEffect } from "react";
import { contactsApi } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Mail, Phone, Wallet, Trash2, Edit3, X, MessageSquare,
  ChevronLeft, Download,
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
  const { showAlert, setActivePage, setPendingTextPhone } = useStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

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
      setSelectedContact(null);
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
    setSelectedContact(null);
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

  const handleTextContact = (contact: Contact) => {
    if (contact.phone) {
      setPendingTextPhone(contact.phone);
      setActivePage("phone");
    } else {
      showAlert("info", "This contact has no phone number");
    }
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const grouped: Record<string, Contact[]> = {};
  filtered.forEach(c => {
    const letter = c.name.charAt(0).toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(c);
  });
  const sortedLetters = Object.keys(grouped).sort();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const avatarColor = (name: string) => {
    const colors = ["#1A73E8", "#EA4335", "#34A853", "#FBBC04", "#FF6D01", "#9334E6", "#00ACC1", "#E91E63"];
    return colors[name.charCodeAt(0) % colors.length];
  };

  if (selectedContact) {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F5F5F5", color: "#202124" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200">
          <button onClick={() => setSelectedContact(null)} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg flex-1">Contact Details</h2>
          <button onClick={() => handleEdit(selectedContact)} className="p-2 rounded-full hover:bg-gray-100">
            <Edit3 className="w-5 h-5" />
          </button>
          <button onClick={() => handleDelete(selectedContact.id)} className="p-2 rounded-full hover:bg-gray-100">
            <Trash2 className="w-5 h-5 text-red-500" />
          </button>
        </div>
        <div className="max-w-md mx-auto">
          <div className="flex flex-col items-center py-8 bg-white">
            <div className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-4xl mb-3" style={{ background: avatarColor(selectedContact.name) }}>
              {selectedContact.name.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold">{selectedContact.name}</h1>
          </div>
          <div className="flex justify-around py-4 bg-white border-t border-gray-100">
            <button onClick={() => handleTextContact(selectedContact)} className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#1A73E815" }}>
                <MessageSquare className="w-5 h-5" style={{ color: "#1A73E8" }} />
              </div>
              <span className="text-xs font-medium" style={{ color: "#1A73E8" }}>Text</span>
            </button>
            <button onClick={() => selectedContact.phone && window.open(`tel:${selectedContact.phone}`)} className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#1A73E815" }}>
                <Phone className="w-5 h-5" style={{ color: "#1A73E8" }} />
              </div>
              <span className="text-xs font-medium" style={{ color: "#1A73E8" }}>Call</span>
            </button>
            <button onClick={() => selectedContact.email && (window.location.href = `mailto:${selectedContact.email}`)} className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#1A73E815" }}>
                <Mail className="w-5 h-5" style={{ color: "#1A73E8" }} />
              </div>
              <span className="text-xs font-medium" style={{ color: "#1A73E8" }}>Email</span>
            </button>
            <button onClick={() => setActivePage("wallet")} className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#1A73E815" }}>
                <Wallet className="w-5 h-5" style={{ color: "#1A73E8" }} />
              </div>
              <span className="text-xs font-medium" style={{ color: "#1A73E8" }}>Send</span>
            </button>
          </div>
          <div className="mt-2 bg-white">
            {selectedContact.phone && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Phone</p>
                <p className="font-medium">{selectedContact.phone}</p>
              </div>
            )}
            {selectedContact.email && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <p className="font-medium">{selectedContact.email}</p>
              </div>
            )}
            {selectedContact.wallet_address && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Wallet</p>
                <p className="font-mono text-sm break-all">{selectedContact.wallet_address}</p>
              </div>
            )}
            {selectedContact.notes && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm">{selectedContact.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F5F5F5", color: "#202124" }}>
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-xl font-bold">Contacts</h1>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="p-2 rounded-full hover:bg-gray-100" title="Export">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={() => { resetForm(); setShowAdd(true); }} className="p-2 rounded-full hover:bg-gray-100">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts"
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-gray-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      </div>

      <div className="flex">
        <div className="flex-1 max-w-md mx-auto">
          {loading ? (
            <p className="text-center py-8 text-gray-500">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500">No contacts found</p>
              <button onClick={() => { resetForm(); setShowAdd(true); }} className="mt-4 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: "#1A73E8" }}>
                Add Contact
              </button>
            </div>
          ) : (
            sortedLetters.map((letter) => (
              <div key={letter} data-letter={letter}>
                <div className="px-4 py-2 text-sm font-bold sticky top-[112px] z-10" style={{ background: "#F5F5F5", color: "#1A73E8" }}>
                  {letter}
                </div>
                <div className="bg-white">
                  {grouped[letter].map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50"
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: avatarColor(contact.name) }}>
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        {contact.phone && <p className="text-xs text-gray-500 truncate">{contact.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {filtered.length > 0 && (
          <div className="fixed right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-20 hidden md:flex">
            {alphabet.map((letter) => (
              <button
                key={letter}
                onClick={() => {
                  const el = document.querySelector(`[data-letter="${letter}"]`);
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                className="text-[10px] font-medium hover:text-blue-600"
                style={{ color: grouped[letter] ? "#1A73E8" : "#BDBDBD" }}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => { resetForm(); setShowAdd(true); }}
        className="fixed bottom-20 md:bottom-8 right-6 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center z-40"
        style={{ background: "#1A73E8" }}
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-bold text-lg">{editing ? "Edit Contact" : "New Contact"}</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Wallet Address</label>
                <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x..." className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm resize-none" />
              </div>
              <button onClick={handleSave} className="w-full py-3 rounded-lg text-white font-bold text-sm" style={{ background: "#1A73E8" }}>
                {editing ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
