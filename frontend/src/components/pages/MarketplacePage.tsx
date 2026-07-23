import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { marketplaceApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Search, X, Heart, MessageSquare, ShoppingCart, Plus,
  ChevronLeft, MapPin, Tag, Trash2, Edit3, DollarSign,
} from "lucide-react";

interface Listing {
  id: number;
  title: string;
  description: string;
  price: string;
  currency: string;
  image_urls: string[];
  category: string;
  condition: string;
  location: string;
  seller_name: string;
  seller_avatar?: string;
  created_at: string;
}

const FB_BLUE = "#1877F2";
const CATEGORIES = [
  "All", "Vehicles", "Property Rentals", "Apparel", "Electronics",
  "Entertainment", "Home & Garden", "Free Stuff", "Hobbies & Toys",
  "Home Goods", "Sporting Goods", "Garden & Outdoor",
];
const CURRENCIES = ["All", "USDT", "USDC", "INC"];
const CONDITIONS = ["New", "Used - Like New", "Used - Good", "Used - Fair"];

export function MarketplacePage() {
  const { showAlert, walletAddress } = useStore();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showMyListings, setShowMyListings] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterCurrency, setFilterCurrency] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCurrency, setFormCurrency] = useState("USDT");
  const [formCategory, setFormCategory] = useState("Electronics");
  const [formCondition, setFormCondition] = useState("New");
  const [formLocation, setFormLocation] = useState("");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Buy state
  const [paymentMethod, setPaymentMethod] = useState("USDT");
  const [buying, setBuying] = useState(false);

  const loadListings = useCallback(async () => {
    try {
      const data = await marketplaceApi.getListings({
        category: filterCategory !== "All" ? filterCategory : undefined,
        currency: filterCurrency !== "All" ? filterCurrency : undefined,
        search: searchQuery || undefined,
        sort: sortBy,
      });
      setListings(data.listings || []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterCurrency, searchQuery, sortBy]);

  useEffect(() => { loadListings(); }, [loadListings]);

  const loadMyListings = async () => {
    try {
      const data = await marketplaceApi.myListings();
      setMyListings(data.listings || []);
    } catch { setMyListings([]); }
  };

  const loadSaved = async () => {
    try {
      const data = await marketplaceApi.getSaved();
      setSavedListings(data.listings || []);
    } catch { setSavedListings([]); }
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formPrice.trim()) {
      showAlert("danger", "Title and price are required");
      return;
    }
    setCreating(true);
    try {
      await marketplaceApi.createListing({
        title: formTitle,
        description: formDesc,
        price: formPrice,
        currency: formCurrency,
        image_urls: formImages,
        category: formCategory,
        condition: formCondition,
        location: formLocation,
      });
      showAlert("success", "Listing created!");
      setShowCreate(false);
      setFormTitle(""); setFormDesc(""); setFormPrice(""); setFormImages([]); setFormLocation("");
      loadListings();
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleBuy = async () => {
    if (!selectedListing) return;
    setBuying(true);
    try {
      if (paymentMethod === "Google Pay") {
        await marketplaceApi.googlePay(selectedListing.id);
      } else {
        await marketplaceApi.buyListing(selectedListing.id, paymentMethod);
      }
      showAlert("success", "Purchase successful!");
      setSelectedListing(null);
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setBuying(false);
    }
  };

  const handleSave = async (id: number) => {
    try {
      await marketplaceApi.saveListing(id);
      showAlert("success", "Saved!");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await marketplaceApi.deleteListing(id);
      showAlert("success", "Listing deleted");
      setMyListings(myListings.filter(l => l.id !== id));
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const currencyBadge = (currency: string) => {
    const colors: Record<string, string> = { USDT: "#26A17B", USDC: "#2775CA", INC: "#FF6B9D" };
    return colors[currency] || "#666";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${FB_BLUE} transparent transparent transparent` }} />
      </div>
    );
  }

  // Listing detail view
  if (selectedListing) {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => setSelectedListing(null)} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg">{selectedListing.title}</h2>
        </div>
        <div className="max-w-5xl mx-auto p-4 grid md:grid-cols-2 gap-6">
          {/* Images */}
          <div>
            <div className="bg-white rounded-lg overflow-hidden shadow-sm">
              <img src={selectedListing.image_urls?.[0] || "https://via.placeholder.com/600x600?text=No+Image"} alt="" className="w-full max-h-[500px] object-cover" />
            </div>
            {selectedListing.image_urls && selectedListing.image_urls.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto">
                {selectedListing.image_urls.map((img, i) => (
                  <img key={i} src={img} alt="" className="w-20 h-20 rounded-lg object-cover border-2 border-gray-200" />
                ))}
              </div>
            )}
          </div>
          {/* Details */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h1 className="text-2xl font-bold">{selectedListing.title}</h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-3xl font-bold">${selectedListing.price}</span>
                <span className="px-2 py-1 rounded text-sm font-bold text-white" style={{ background: currencyBadge(selectedListing.currency) }}>
                  {selectedListing.currency}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium">{selectedListing.category}</span>
                <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium">{selectedListing.condition}</span>
                {selectedListing.location && (
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{selectedListing.location}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="font-bold mb-2">Description</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedListing.description || "No description provided."}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  {(selectedListing.seller_name || "U").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{selectedListing.seller_name}</p>
                  <p className="text-xs text-gray-500">Seller</p>
                </div>
              </div>
            </div>
            {/* Payment + Buy */}
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
              <h3 className="font-bold">Payment Method</h3>
              <div className="grid grid-cols-2 gap-2">
                {["USDT", "USDC", "INC", "Google Pay"].map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={cn("p-3 rounded-lg border-2 text-sm font-medium transition-all", paymentMethod === method ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")}
                  >
                    {method === "Google Pay" ? "🟢 Google Pay" : <span className="flex items-center justify-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: currencyBadge(method) }} />{method}</span>}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-3 rounded-lg border-2 border-gray-300 font-bold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-2">
                  <MessageSquare className="w-5 h-5" /> Message Seller
                </button>
                <button onClick={handleBuy} disabled={buying} className="flex-1 py-3 rounded-lg font-bold text-white hover:opacity-90 flex items-center justify-center gap-2" style={{ background: FB_BLUE }}>
                  {buying ? "Processing..." : <><ShoppingCart className="w-5 h-5" /> Buy Now</>}
                </button>
              </div>
              <button onClick={() => handleSave(selectedListing.id)} className="w-full py-2 rounded-lg border-2 border-gray-300 text-sm font-medium hover:bg-gray-100 flex items-center justify-center gap-2">
                <Heart className="w-4 h-4" /> Save Listing
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Create listing view
  if (showCreate) {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => setShowCreate(false)} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg">Create New Listing</h2>
        </div>
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Photos</label>
              <div className="grid grid-cols-3 gap-2">
                {formImages.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setFormImages(formImages.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
                <button onClick={() => { const url = prompt("Image URL:"); if (url) setFormImages([...formImages, url]); }} className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center hover:border-blue-500 hover:bg-blue-50">
                  <Plus className="w-8 h-8 text-gray-400" />
                  <span className="text-xs text-gray-500 mt-1">Add Photo</span>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="What are you selling?" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Price</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="0.00" className="flex-1 p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500" />
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} className="p-3 border border-gray-300 rounded-lg outline-none">
                    {CURRENCIES.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg outline-none">
                  {CATEGORIES.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Condition</label>
                <select value={formCondition} onChange={(e) => setFormCondition(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg outline-none">
                  {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="City, State" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Describe your item..." rows={4} className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 resize-none" />
            </div>
            <button onClick={handleCreate} disabled={creating || !formTitle.trim() || !formPrice.trim()} className="w-full py-3 rounded-lg font-bold text-white disabled:opacity-40" style={{ background: FB_BLUE }}>
              {creating ? "Posting..." : "Post Listing"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // My listings view
  if (showMyListings) {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => setShowMyListings(false)} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg">My Listings</h2>
        </div>
        <div className="max-w-4xl mx-auto p-4">
          {myListings.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">You have no listings yet.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {myListings.map((listing) => (
                <div key={listing.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                  <img src={listing.image_urls?.[0] || "https://via.placeholder.com/300x300?text=No+Image"} alt="" className="w-full aspect-square object-cover" />
                  <div className="p-3">
                    <p className="font-bold text-sm truncate">{listing.title}</p>
                    <p className="font-bold">${listing.price} <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: currencyBadge(listing.currency) }}>{listing.currency}</span></p>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setSelectedListing(listing)} className="flex-1 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200 font-medium">View</button>
                      <button onClick={() => handleDelete(listing.id)} className="p-1.5 rounded bg-red-100 hover:bg-red-200 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Saved listings view
  if (showSaved) {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => setShowSaved(false)} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg">Saved Listings</h2>
        </div>
        <div className="max-w-4xl mx-auto p-4">
          {savedListings.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">No saved listings yet.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {savedListings.map((listing) => (
                <div key={listing.id} onClick={() => setSelectedListing(listing)} className="bg-white rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all">
                  <img src={listing.image_urls?.[0] || "https://via.placeholder.com/300x300?text=No+Image"} alt="" className="w-full aspect-square object-cover" />
                  <div className="p-3">
                    <p className="font-bold text-sm truncate">{listing.title}</p>
                    <p className="font-bold">${listing.price} <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: currencyBadge(listing.currency) }}>{listing.currency}</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main browse view
  return (
    <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
        <h1 className="text-xl font-bold">Marketplace</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowMyListings(true); loadMyListings(); }} className="px-3 py-2 rounded-lg hover:bg-gray-100 text-sm font-medium">My Listings</button>
          <button onClick={() => { setShowSaved(true); loadSaved(); }} className="px-3 py-2 rounded-lg hover:bg-gray-100 text-sm font-medium">Saved</button>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg text-white font-medium text-sm flex items-center gap-1" style={{ background: FB_BLUE }}>
            <Plus className="w-4 h-4" /> Sell
          </button>
        </div>
      </div>

      <div className="flex max-w-[1920px] mx-auto">
        {/* Left sidebar — categories + filters */}
        <aside className="hidden md:flex flex-col w-[280px] flex-shrink-0 p-4 gap-1 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Marketplace" className="w-full pl-9 pr-3 py-2.5 rounded-full bg-gray-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <p className="font-bold text-sm text-gray-500 mt-2 mb-1">Categories</p>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn("flex items-center gap-2 p-2 rounded-lg text-left text-sm font-medium", filterCategory === cat ? "bg-blue-100 text-blue-700" : "hover:bg-gray-200")}
            >
              <Tag className="w-4 h-4" /> {cat}
            </button>
          ))}
          <p className="font-bold text-sm text-gray-500 mt-3 mb-1">Currency</p>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((cur) => (
              <button
                key={cur}
                onClick={() => setFilterCurrency(cur)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-medium", filterCurrency === cur ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300")}
              >
                {cur}
              </button>
            ))}
          </div>
          <p className="font-bold text-sm text-gray-500 mt-3 mb-1">Sort By</p>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm outline-none">
            <option value="newest">Newest</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
          </select>
        </aside>

        {/* Main grid */}
        <main className="flex-1 p-4">
          <div className="md:hidden mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Marketplace" className="w-full pl-9 pr-3 py-2.5 rounded-full bg-gray-100 text-sm outline-none" />
            </div>
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setFilterCategory(cat)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap", filterCategory === cat ? "bg-blue-600 text-white" : "bg-gray-200")}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {listings.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No listings found. Try creating one!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {listings.map((listing) => (
                <div key={listing.id} onClick={() => setSelectedListing(listing)} className="bg-white rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all">
                  <img src={listing.image_urls?.[0] || "https://via.placeholder.com/300x300?text=No+Image"} alt="" className="w-full aspect-square object-cover" />
                  <div className="p-3">
                    <p className="font-bold text-lg">${listing.price}</p>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs px-1.5 py-0.5 rounded text-white font-bold" style={{ background: currencyBadge(listing.currency) }}>{listing.currency}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{listing.title}</p>
                    <p className="text-xs text-gray-500 truncate">{listing.location || listing.category}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
