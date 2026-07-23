import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { socialApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Search, Home, Users, Heart, ShoppingBag, Bell, MessageCircle,
  ThumbsUp, MessageSquare, Share2, MoreHorizontal, X, Image as ImageIcon,
  Video, Smile, Send, Clock, Bookmark, Calendar, ChevronDown,
} from "lucide-react";

interface Post {
  id: number;
  author_id: number;
  author_name: string;
  author_avatar?: string;
  text: string;
  image_url?: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
  liked: boolean;
  privacy: string;
}

interface Comment {
  id: number;
  author_name: string;
  author_avatar?: string;
  text: string;
  created_at: string;
}

interface Story {
  id: number;
  author_name: string;
  author_avatar?: string;
  image_url: string;
}

interface Notification {
  id: number;
  type: string;
  text: string;
  created_at: string;
  read: boolean;
}

interface Friend {
  id: number;
  name: string;
  avatar?: string;
  online: boolean;
}

const FB_BLUE = "#1877F2";

export function DashboardPage() {
  const { showAlert, setActivePage, authEmail } = useStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState("");
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [commentsCache, setCommentsCache] = useState<Record<number, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [feedData, storyData, notifData, friendData, profileData] = await Promise.all([
        socialApi.getFeed().catch(() => ({ posts: [] })),
        socialApi.getStories().catch(() => ({ stories: [] })),
        socialApi.getNotifications().catch(() => ({ notifications: [] })),
        socialApi.listFriends().catch(() => ({ friends: [] })),
        socialApi.getProfile().catch(() => ({ profile: null })),
      ]);
      setPosts(feedData.posts || []);
      setStories(storyData.stories || []);
      setNotifications(notifData.notifications || []);
      setFriends(friendData.friends || []);
      if (profileData.profile) setProfile(profileData.profile);
    } catch (e: any) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreatePost = async () => {
    if (!postText.trim() && !postImage.trim()) return;
    try {
      const data = await socialApi.createPost({ text: postText, image_url: postImage });
      setPosts([data.post, ...posts]);
      setPostText("");
      setPostImage("");
      setShowCreatePost(false);
      showAlert("success", "Posted!");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleLike = async (postId: number) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    setPosts(posts.map(p => p.id === postId ? { ...p, liked: !p.liked, likes_count: p.liked ? p.likes_count - 1 : p.likes_count + 1 } : p));
    try {
      if (post.liked) await socialApi.unlikePost(postId);
      else await socialApi.likePost(postId);
    } catch {}
  };

  const handleLoadComments = async (postId: number) => {
    if (expandedComments.has(postId)) {
      setExpandedComments(new Set([...expandedComments].filter(id => id !== postId)));
      return;
    }
    try {
      const data = await socialApi.getComments(postId);
      setCommentsCache({ ...commentsCache, [postId]: data.comments || [] });
    } catch {
      setCommentsCache({ ...commentsCache, [postId]: [] });
    }
    setExpandedComments(new Set([...expandedComments, postId]));
  };

  const handleAddComment = async (postId: number) => {
    const text = commentText[postId];
    if (!text?.trim()) return;
    try {
      await socialApi.addComment(postId, text);
      const data = await socialApi.getComments(postId);
      setCommentsCache({ ...commentsCache, [postId]: data.comments || [] });
      setPosts(posts.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
      setCommentText({ ...commentText, [postId]: "" });
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const data = await socialApi.searchUsers(q);
      setSearchResults(data.users || []);
    } catch {
      setSearchResults([]);
    }
  };

  const loadMore = async () => {
    const nextPage = page + 1;
    try {
      const data = await socialApi.getFeed(nextPage);
      if (data.posts?.length) {
        setPosts([...posts, ...data.posts]);
        setPage(nextPage);
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    }
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString();
  };

  const getAvatar = (name?: string) => (name || "U").charAt(0).toUpperCase();

  const avatarColor = (name?: string) => {
    const colors = ["#1877F2", "#42A5F5", "#66BB6A", "#FFA726", "#AB47BC", "#EF5350", "#26C6DA", "#FFCA28"];
    return colors[(name || "").charCodeAt(0) % colors.length];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${FB_BLUE} transparent transparent transparent` }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
      {/* Top Bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 h-14" style={{ background: FB_BLUE, color: "white" }}>
        <div className="flex items-center gap-2 flex-1">
          <button onClick={() => setActivePage("dashboard")} className="text-2xl font-bold tracking-tight">Soulmate</button>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => { handleSearch(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              placeholder="Search Soulmate"
              className="pl-9 pr-3 py-2 rounded-full text-sm bg-white text-gray-900 w-64 outline-none"
            />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-full bg-white rounded-lg shadow-xl py-2 max-h-80 overflow-y-auto">
                {searchResults.map((user) => (
                  <button key={user.id} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 text-left">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold" style={{ background: avatarColor(user.name) }}>
                      {getAvatar(user.name)}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{user.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-1">
          <button onClick={() => setActivePage("dashboard")} className="px-6 py-2 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <Home className="w-6 h-6" />
          </button>
          <button onClick={() => setActivePage("dating")} className="px-6 py-2 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <Heart className="w-6 h-6" />
          </button>
          <button onClick={() => setActivePage("marketplace")} className="px-6 py-2 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center relative"
            >
              <Bell className="w-5 h-5" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute top-full mt-1 right-0 w-80 bg-white rounded-lg shadow-xl py-2 max-h-96 overflow-y-auto text-gray-900">
                <div className="px-4 py-2"><h3 className="font-bold text-lg">Notifications</h3></div>
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-500 px-4 py-4 text-center">No notifications</p>
                ) : notifications.map((n) => (
                  <button key={n.id} className={cn("w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-100 text-left", !n.read && "bg-blue-50")}>
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Bell className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{n.text}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatTime(n.created_at)}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-blue-600 mt-2" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </button>

          <button className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-sm overflow-hidden">
            {profile?.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(authEmail)}
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex max-w-[1920px] mx-auto">
        {/* Left sidebar */}
        <aside className="hidden md:flex flex-col w-[360px] flex-shrink-0 p-4 gap-1 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
          <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold overflow-hidden" style={{ background: avatarColor(authEmail) }}>
              {profile?.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(authEmail)}
            </div>
            <span className="font-medium text-sm">{profile?.name || authEmail || "User"}</span>
          </button>
          <button onClick={() => setActivePage("dating")} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center"><Heart className="w-5 h-5 text-pink-500" /></div>
            <span className="font-medium text-sm">Dating</span>
          </button>
          <button onClick={() => setActivePage("marketplace")} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
            <span className="font-medium text-sm">Marketplace</span>
          </button>
          <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
            <span className="font-medium text-sm">Friends</span>
          </button>
          <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div>
            <span className="font-medium text-sm">Memories</span>
          </button>
          <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center"><Bookmark className="w-5 h-5 text-blue-600" /></div>
            <span className="font-medium text-sm">Saved</span>
          </button>
          <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center"><Calendar className="w-5 h-5 text-blue-600" /></div>
            <span className="font-medium text-sm">Events</span>
          </button>
          <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
            <div className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center"><ChevronDown className="w-5 h-5 text-gray-700" /></div>
            <span className="font-medium text-sm">See More</span>
          </button>
        </aside>

        {/* Center — Feed */}
        <main className="flex-1 max-w-[680px] mx-auto p-4 space-y-4">
          {/* Stories */}
          {stories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <div className="flex-shrink-0 w-28 h-48 rounded-xl overflow-hidden relative cursor-pointer bg-white border border-gray-200">
                <div className="h-3/4 bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center">
                  {profile?.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : <div className="text-white text-4xl font-bold">{getAvatar(authEmail)}</div>}
                </div>
                <div className="h-1/4 flex flex-col items-center justify-end pb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center -mt-4 border-4 border-white">
                    <span className="text-white text-xl">+</span>
                  </div>
                  <p className="text-xs font-medium mt-1">Create Story</p>
                </div>
              </div>
              {stories.map((story) => (
                <div key={story.id} className="flex-shrink-0 w-28 h-48 rounded-xl overflow-hidden relative cursor-pointer">
                  <img src={story.image_url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 w-8 h-8 rounded-full border-4 border-blue-500 overflow-hidden">
                    {story.author_avatar ? <img src={story.author_avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs" style={{ background: avatarColor(story.author_name) }}>{getAvatar(story.author_name)}</div>}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-white text-xs font-medium truncate">{story.author_name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create post */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden" style={{ background: avatarColor(authEmail) }}>
                {profile?.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(authEmail)}
              </div>
              <button onClick={() => setShowCreatePost(true)} className="flex-1 text-left px-4 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm">
                What's on your mind, {profile?.name?.split(" ")[0] || "User"}?
              </button>
            </div>
            <div className="border-t border-gray-200 mt-3 pt-3 flex items-center justify-around">
              <button onClick={() => setShowCreatePost(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100">
                <Video className="w-5 h-5 text-red-500" /><span className="text-sm font-medium text-gray-600">Live Video</span>
              </button>
              <button onClick={() => setShowCreatePost(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100">
                <ImageIcon className="w-5 h-5 text-green-500" /><span className="text-sm font-medium text-gray-600">Photo/Video</span>
              </button>
              <button onClick={() => setShowCreatePost(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100">
                <Smile className="w-5 h-5 text-yellow-500" /><span className="text-sm font-medium text-gray-600">Feeling</span>
              </button>
            </div>
          </div>

          {/* Posts */}
          {posts.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <p className="text-gray-500">No posts yet. Be the first to post something!</p>
            </div>
          ) : posts.map((post) => (
            <div key={post.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 p-4 pb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden" style={{ background: avatarColor(post.author_name) }}>
                  {post.author_avatar ? <img src={post.author_avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(post.author_name)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{post.author_name}</p>
                  <p className="text-xs text-gray-500">{formatTime(post.created_at)} · {post.privacy || "Public"}</p>
                </div>
                <button className="p-2 rounded-full hover:bg-gray-100"><MoreHorizontal className="w-5 h-5 text-gray-500" /></button>
              </div>
              {post.text && <p className="px-4 pb-3 text-sm whitespace-pre-wrap">{post.text}</p>}
              {post.image_url && <img src={post.image_url} alt="" className="w-full max-h-[500px] object-cover" />}
              <div className="flex items-center justify-between px-4 py-2 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><ThumbsUp className="w-3 h-3 text-white fill-white" /></div>
                  {post.likes_count > 0 && <span>{post.likes_count}</span>}
                </div>
                {post.comments_count > 0 && <button onClick={() => handleLoadComments(post.id)} className="hover:underline">{post.comments_count} comments</button>}
              </div>
              <div className="border-t border-gray-200 flex items-center justify-around px-2 py-1">
                <button onClick={() => handleLike(post.id)} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 flex-1 justify-center", post.liked && "text-blue-600")}>
                  <ThumbsUp className={cn("w-5 h-5", post.liked && "fill-current")} /><span className="text-sm font-medium">Like</span>
                </button>
                <button onClick={() => handleLoadComments(post.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 flex-1 justify-center">
                  <MessageSquare className="w-5 h-5" /><span className="text-sm font-medium">Comment</span>
                </button>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 flex-1 justify-center">
                  <Share2 className="w-5 h-5" /><span className="text-sm font-medium">Share</span>
                </button>
              </div>
              {expandedComments.has(post.id) && (
                <div className="border-t border-gray-200 p-4 space-y-3">
                  {(commentsCache[post.id] || []).map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 overflow-hidden" style={{ background: avatarColor(comment.author_name) }}>
                        {comment.author_avatar ? <img src={comment.author_avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(comment.author_name)}
                      </div>
                      <div className="bg-gray-100 rounded-2xl px-3 py-2 flex-1">
                        <p className="font-semibold text-xs">{comment.author_name}</p>
                        <p className="text-sm">{comment.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0" style={{ background: avatarColor(authEmail) }}>{getAvatar(authEmail)}</div>
                    <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1">
                      <input value={commentText[post.id] || ""} onChange={(e) => setCommentText({ ...commentText, [post.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") handleAddComment(post.id); }} placeholder="Write a comment..." className="flex-1 bg-transparent text-sm outline-none" />
                      <button onClick={() => handleAddComment(post.id)}><Send className="w-4 h-4 text-blue-600" /></button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {hasMore && posts.length > 0 && (
            <button onClick={loadMore} className="w-full py-3 bg-white rounded-lg shadow-sm text-sm font-medium text-gray-600 hover:bg-gray-50">Load More</button>
          )}
        </main>

        {/* Right sidebar */}
        <aside className="hidden xl:flex flex-col w-[300px] flex-shrink-0 p-4 gap-3 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
          <div>
            <p className="font-semibold text-sm text-gray-500 mb-2">Sponsored</p>
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 cursor-pointer">
              <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">AD</div>
              <div><p className="text-sm font-medium">Soulmate Premium</p><p className="text-xs text-gray-500">soulmate.io</p></div>
            </div>
          </div>
          <div className="border-t border-gray-300 pt-3">
            <p className="font-semibold text-sm text-gray-500 mb-2">Contacts</p>
            <div className="space-y-1">
              {friends.length === 0 ? <p className="text-xs text-gray-400">No friends yet</p> : friends.map((friend) => (
                <button key={friend.id} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-200 text-left">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold overflow-hidden" style={{ background: avatarColor(friend.name) }}>
                      {friend.avatar ? <img src={friend.avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(friend.name)}
                    </div>
                    {friend.online && <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />}
                  </div>
                  <span className="text-sm font-medium">{friend.name}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Create Post Modal */}
      {showCreatePost && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] px-4" onClick={() => setShowCreatePost(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-bold text-lg text-gray-900">Create Post</h3>
              <button onClick={() => setShowCreatePost(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><X className="w-5 h-5 text-gray-600" /></button>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: avatarColor(authEmail) }}>{getAvatar(authEmail)}</div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">{profile?.name || authEmail || "User"}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Public <ChevronDown className="w-3 h-3" /></div>
                </div>
              </div>
              <textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder={`What's on your mind, ${profile?.name?.split(" ")[0] || "User"}?`} className="w-full text-lg outline-none resize-none h-32 bg-transparent text-gray-900" autoFocus />
              {postImage && (
                <div className="relative mt-2 rounded-lg overflow-hidden border border-gray-200">
                  <img src={postImage} alt="" className="w-full max-h-64 object-cover" />
                  <button onClick={() => setPostImage("")} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 p-3 border border-gray-200 rounded-lg">
                <span className="text-sm font-medium text-gray-700 flex-1">Add to your post</span>
                <button onClick={() => { const url = prompt("Image URL:"); if (url) setPostImage(url); }} className="p-1.5 rounded-lg hover:bg-gray-100"><ImageIcon className="w-5 h-5 text-green-500" /></button>
                <button className="p-1.5 rounded-lg hover:bg-gray-100"><Smile className="w-5 h-5 text-yellow-500" /></button>
              </div>
              <button onClick={handleCreatePost} disabled={!postText.trim() && !postImage.trim()} className="w-full mt-3 py-2.5 rounded-lg font-bold text-white disabled:opacity-40" style={{ background: FB_BLUE }}>Post</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
