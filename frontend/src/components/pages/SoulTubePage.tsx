import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { soulTubeApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Search, Play, ThumbsUp, ThumbsDown, Share2, Download,
  MessageSquare, Send, Eye, Clock, Upload, X, Home,
  TrendingUp, History, User, ChevronDown, Crown, Flame,
} from "lucide-react";

interface Video {
  id: string;
  title: string;
  description: string;
  creator_id: string;
  creator_name: string;
  duration_s: number;
  views: number;
  likes: number;
  created_at: number;
  thumbnail_url?: string;
  resolution?: string;
  tags?: string[];
}

interface Comment {
  id: string;
  user_name: string;
  text: string;
  likes: number;
  created_at: number;
  replies?: Comment[];
}

const CATEGORIES = ["All", "Music", "Gaming", "Tech", "Comedy", "Education", "News", "Sports"];

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function SoulTubePage() {
  const { isFounder } = useStore();
  const [view, setView] = useState<"home" | "watch" | "upload" | "history">("home");
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [recommendations, setRecommendations] = useState<Video[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [liked, setLiked] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [resolution, setResolution] = useState("720p");
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadTrending = useCallback(async () => {
    setLoading(true);
    try {
      const data = await soulTubeApi.getTrending(24);
      const list = data.videos || data;
      setVideos(Array.isArray(list) ? list : []);
    } catch {
      setVideos([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTrending();
  }, [loadTrending]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadTrending();
      return;
    }
    setLoading(true);
    try {
      const data = await soulTubeApi.search(searchQuery);
      const list = data.videos || data;
      setVideos(Array.isArray(list) ? list : []);
    } catch {
      setVideos([]);
    }
    setLoading(false);
  }, [searchQuery, loadTrending]);

  const openVideo = useCallback(async (video: Video) => {
    setSelectedVideo(video);
    setView("watch");
    setLiked(false);
    setSubscribed(false);
    try {
      const [recs, commentsData] = await Promise.all([
        soulTubeApi.getRecommendations(video.id),
        soulTubeApi.getComments(video.id),
      ]);
      setRecommendations(Array.isArray(recs.videos || recs) ? (recs.videos || recs) : []);
      const cmts = commentsData.comments || commentsData;
      setComments(Array.isArray(cmts) ? cmts : []);
    } catch {
      setRecommendations([]);
      setComments([]);
    }
  }, []);

  const handleLike = useCallback(async () => {
    if (!selectedVideo) return;
    setLiked(!liked);
    try {
      await soulTubeApi.likeVideo(selectedVideo.id);
    } catch {}
  }, [selectedVideo, liked]);

  const handleSubscribe = useCallback(async () => {
    if (!selectedVideo) return;
    setSubscribed(!subscribed);
    try {
      if (subscribed) {
        await soulTubeApi.unsubscribe(selectedVideo.creator_id);
      } else {
        await soulTubeApi.subscribe(selectedVideo.creator_id);
      }
    } catch {}
  }, [selectedVideo, subscribed]);

  const handleAddComment = useCallback(async () => {
    if (!selectedVideo || !newComment.trim()) return;
    try {
      await soulTubeApi.addComment(selectedVideo.id, newComment);
      setComments((prev) => [
        { id: Date.now().toString(), user_name: "You", text: newComment, likes: 0, created_at: Date.now() / 1000 },
        ...prev,
      ]);
      setNewComment("");
    } catch {}
  }, [selectedVideo, newComment]);

  return (
    <div className="pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg-card/80 backdrop-blur-md border border-border rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView("home"); setSelectedVideo(null); }}
            className="flex items-center gap-2 shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center">
              <Play className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="text-lg font-bold text-gradient hidden sm:block">SoulTube</span>
          </button>
          <div className="flex-1 max-w-2xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search videos..."
              className="w-full pl-10 pr-4 py-2 rounded-full bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={() => setView("upload")}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors shrink-0"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:block">Upload</span>
          </button>
          {isFounder && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 shrink-0">
              <Crown className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs text-accent font-medium hidden sm:block">Founder</span>
            </div>
          )}
        </div>
      </div>

      {/* Home View */}
      {view === "home" && (
        <div className="py-2">
          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                  activeCategory === cat
                    ? "bg-white text-black"
                    : "bg-bg-alt text-muted hover:bg-bg-card"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Video grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-video rounded-xl bg-bg-alt" />
                  <div className="flex gap-3 mt-3">
                    <div className="w-9 h-9 rounded-full bg-bg-alt shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-bg-alt rounded w-full mb-2" />
                      <div className="h-3 bg-bg-alt rounded w-2/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Play className="w-12 h-12 text-muted mb-3" />
              <p className="text-muted text-sm">No videos yet. Be the first to upload!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {videos.map((video) => (
                <VideoCard key={video.id} video={video} onClick={() => openVideo(video)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Watch View */}
      {view === "watch" && selectedVideo && (
        <div className="py-2">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Left: Player + info + comments */}
            <div className="flex-1 max-w-4xl">
              {/* Video player */}
              <div className="aspect-video rounded-xl overflow-hidden bg-black relative group">
                <video
                  ref={videoRef}
                  src={soulTubeApi.getStreamUrl(selectedVideo.id, resolution)}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>

              {/* Quality selector */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted">Quality:</span>
                {["240p", "480p", "720p", "1080p"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setResolution(q)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                      resolution === q ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-white"
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Title + actions */}
              <h1 className="text-lg font-bold text-white mt-3">{selectedVideo.title}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="text-sm text-muted">
                  {formatViews(selectedVideo.views)} views • {formatTimeAgo(selectedVideo.created_at)}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={handleLike}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                      liked ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted hover:text-white"
                    )}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    {formatViews(selectedVideo.likes + (liked ? 1 : 0))}
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-alt text-muted hover:text-white text-sm font-medium transition-all">
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-alt text-muted hover:text-white text-sm font-medium transition-all">
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:block">Share</span>
                  </button>
                  <a
                    href={soulTubeApi.getStreamUrl(selectedVideo.id, resolution)}
                    download
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-alt text-muted hover:text-white text-sm font-medium transition-all"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Channel info */}
              <div className="flex items-center gap-3 mt-4 p-3 rounded-xl bg-bg-card border border-border">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white font-bold">
                  {selectedVideo.creator_name[0]?.toUpperCase() || "U"}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{selectedVideo.creator_name}</p>
                  <p className="text-xs text-muted">Creator</p>
                </div>
                <button
                  onClick={handleSubscribe}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    subscribed
                      ? "bg-bg-alt text-muted"
                      : "bg-white text-black hover:bg-white/90"
                  )}
                >
                  {subscribed ? "Subscribed" : "Subscribe"}
                </button>
              </div>

              {/* Description */}
              {selectedVideo.description && (
                <div className="mt-3 p-3 rounded-xl bg-bg-card border border-border">
                  <p className="text-sm text-muted whitespace-pre-wrap">{selectedVideo.description}</p>
                </div>
              )}

              {/* Comments */}
              <div className="mt-4">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Comments ({comments.length})
                </h3>
                <div className="flex gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    You
                  </div>
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      placeholder="Add a comment..."
                      className="flex-1 px-3 py-2 rounded-full bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                    />
                    {newComment && (
                      <button
                        onClick={handleAddComment}
                        className="px-3 py-2 rounded-full bg-accent text-white text-sm font-medium"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-bg-alt flex items-center justify-center text-muted text-xs font-bold shrink-0">
                        {c.user_name[0]?.toUpperCase() || "U"}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{c.user_name}</span>
                          <span className="text-xs text-muted">{formatTimeAgo(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-muted mt-0.5">{c.text}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <button className="flex items-center gap-1 text-xs text-muted hover:text-white">
                            <ThumbsUp className="w-3 h-3" />
                            {c.likes > 0 && formatViews(c.likes)}
                          </button>
                          <button className="text-xs text-muted hover:text-white">Reply</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Recommendations */}
            <div className="lg:w-80 xl:w-96 space-y-2">
              <h3 className="text-sm font-bold text-white mb-2">Up Next</h3>
              {recommendations.map((rec) => (
                <button
                  key={rec.id}
                  onClick={() => openVideo(rec)}
                  className="flex gap-2 w-full text-left group"
                >
                  <div className="w-40 h-24 rounded-lg overflow-hidden bg-bg-alt shrink-0 relative">
                    {rec.thumbnail_url ? (
                      <img src={rec.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-6 h-6 text-muted" />
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-white text-[10px] font-medium">
                      {formatDuration(rec.duration_s)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white line-clamp-2 group-hover:text-accent transition-colors">
                      {rec.title}
                    </p>
                    <p className="text-xs text-muted mt-1">{rec.creator_name}</p>
                    <p className="text-xs text-muted">
                      {formatViews(rec.views)} views • {formatTimeAgo(rec.created_at)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload View */}
      {view === "upload" && (
        <UploadView onBack={() => setView("home")} />
      )}

      {/* History View */}
      {view === "history" && (
        <HistoryView onBack={() => setView("home")} onOpenVideo={openVideo} />
      )}
    </div>
  );
}

function VideoCard({ video, onClick }: { video: Video; onClick: () => void }) {
  return (
    <div onClick={onClick} className="cursor-pointer group">
      <div className="aspect-video rounded-xl overflow-hidden bg-bg-alt relative">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-8 h-8 text-muted group-hover:text-accent transition-colors" />
          </div>
        )}
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-xs font-medium">
          {formatDuration(video.duration_s)}
        </span>
      </div>
      <div className="flex gap-3 mt-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
          {video.creator_name[0]?.toUpperCase() || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white line-clamp-2 group-hover:text-accent transition-colors">
            {video.title}
          </h3>
          <p className="text-xs text-muted mt-1">{video.creator_name}</p>
          <p className="text-xs text-muted">
            {formatViews(video.views)} views • {formatTimeAgo(video.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

function UploadView({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = async () => {
    if (!file || !title) return;
    setUploading(true);
    setProgress(10);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("description", description);
      formData.append("tags", tags);
      setProgress(50);
      await soulTubeApi.uploadVideo(formData);
      setProgress(100);
      setTimeout(() => onBack(), 1500);
    } catch {
      setUploading(false);
    }
  };

  return (
    <div className="py-2 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-white mb-4 text-sm">
        <X className="w-4 h-4" /> Cancel
      </button>
      <h2 className="text-xl font-bold text-white mb-6">Upload Video</h2>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
          dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted"
        )}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
        <Upload className="w-10 h-10 text-muted mx-auto mb-3" />
        {file ? (
          <p className="text-sm text-white font-medium">{file.name}</p>
        ) : (
          <p className="text-sm text-muted">Drag & drop or click to browse</p>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-4 mt-6">
        <div>
          <label className="text-sm text-muted block mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white focus:outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-sm text-muted block mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white focus:outline-none focus:border-accent/50 resize-none"
          />
        </div>
        <div>
          <label className="text-sm text-muted block mb-1">Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>

      {/* Progress */}
      {uploading && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">
              {progress < 100 ? "Uploading..." : "Upload complete!"}
            </span>
            <span className="text-sm text-accent font-medium">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-bg-alt overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || !title || uploading}
        className="w-full mt-6 py-3 rounded-xl bg-gradient-to-r from-accent to-purple-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        {uploading ? "Uploading..." : "Publish Video"}
      </button>
    </div>
  );
}

function HistoryView({ onBack, onOpenVideo }: { onBack: () => void; onOpenVideo: (v: Video) => void }) {
  const [history, setHistory] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    soulTubeApi.getHistory()
      .then((data) => {
        const list = data.videos || data;
        setHistory(Array.isArray(list) ? list : []);
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="py-2 max-w-4xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-white mb-4 text-sm">
        <X className="w-4 h-4" /> Back
      </button>
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <History className="w-5 h-5" /> Watch History
      </h2>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-40 h-24 rounded-lg bg-bg-alt" />
              <div className="flex-1">
                <div className="h-4 bg-bg-alt rounded w-full mb-2" />
                <div className="h-3 bg-bg-alt rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <History className="w-12 h-12 text-muted mb-3" />
          <p className="text-muted text-sm">No watch history yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((video) => (
            <VideoCard key={video.id} video={video} onClick={() => onOpenVideo(video)} />
          ))}
        </div>
      )}
    </div>
  );
}
