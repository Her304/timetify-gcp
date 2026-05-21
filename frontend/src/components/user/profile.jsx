import { useState, useEffect, useCallback } from "react";
import { authenticatedFetch } from "../../utils/api";
import { T, FF, MonoLabel, Avatar, PillBtn, Blob, Star, Icon, Toggle } from "@/components/shared/brand";

// One toggle row inside the notifications section.
function NotiRow({ title, hint, checked, onChange, busy }) {
  return (
    <div className="py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink lowercase">{title}</div>
        <div className="text-xs text-ink-60 mt-0.5 lowercase">{hint}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={busy} />
    </div>
  );
}

// "22:00:00" → "10pm" — lowercase 12h with no minutes when :00.
function formatHM(t) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

// Accordion section: cream header w/ chevron, body fades in when open.
function SettingsSection({ title, hint, open, onToggle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-8 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-cream/40 transition-colors"
      >
        <div className="min-w-0">
          <div className="text-lg leading-none lowercase" style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.3 }}>
            {title}
          </div>
          {hint && (
            <div className="text-xs text-ink-60 mt-1 lowercase">{hint}</div>
          )}
        </div>
        <Icon name={open ? "chevU" : "chevD"} size={18} color={T.ink60} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-ink-8 pt-4">{children}</div>}
    </div>
  );
}

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const Profile = ({ currentUser, setCurrentUser, Class_details = [], onLogout }) => {
  const [allCourses, setAllCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: currentUser?.username || "",
    email: currentUser?.email || "",
    university: currentUser?.university || "",
    major: currentUser?.major || "",
    grad_year: currentUser?.grad_year || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [courseFilter, setCourseFilter] = useState("all");
  const [blocks, setBlocks] = useState([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState(null);

  // Which accordion section is open. Only one at a time keeps the page calm;
  // the screenshot shows notifications expanded by default — matching that.
  const [openSection, setOpenSection] = useState("notifications");

  // Notification preferences — single row per user, auto-created server-side.
  const [prefs, setPrefs] = useState(null);
  const [prefsBusy, setPrefsBusy] = useState(false);

  // Snap groups + friend list (for the create-group multi-select).
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [friends, setFriends] = useState([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  const fetchBlocks = useCallback(async () => {
    setBlocksLoading(true);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/blocks/`);
      if (res.ok) {
        const data = await res.json();
        setBlocks(data.blocks || []);
      }
    } finally {
      setBlocksLoading(false);
    }
  }, []);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  // ── Notification preferences ──────────────────────────────────────────────
  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/notifications/preferences/`);
        if (res.ok) setPrefs(await res.json());
      } catch (err) { console.error("Failed to fetch prefs", err); }
    };
    fetchPrefs();
  }, []);

  const patchPrefs = async (patch) => {
    if (!prefs) return;
    // Optimistic — flip the switch immediately, revert on server error.
    const prev = prefs;
    setPrefs({ ...prefs, ...patch });
    setPrefsBusy(true);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/notifications/preferences/`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (res.ok) setPrefs(await res.json());
      else setPrefs(prev);
    } catch {
      setPrefs(prev);
    } finally {
      setPrefsBusy(false);
    }
  };

  // ── Snap groups + friend list ────────────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snap-groups/`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friends/`);
        if (res.ok) {
          const data = await res.json();
          const flat = (data || [])
            .map((row) => row.friend_details)
            .filter(Boolean);
          setFriends(flat);
        }
      } catch (err) { console.error("Failed to fetch friends", err); }
    };
    fetchFriends();
  }, []);

  const toggleNewGroupMember = (id) => {
    setNewGroupMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snap-groups/`, {
        method: "POST",
        body: JSON.stringify({ name, member_ids: Array.from(newGroupMembers) }),
      });
      if (res.ok) {
        const newGroup = await res.json();
        setGroups((prev) => [newGroup, ...prev]);
        setNewGroupName("");
        setNewGroupMembers(new Set());
        setShowNewGroup(false);
      }
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleRenameGroup = async (groupId) => {
    const name = editingGroupName.trim();
    if (!name) return;
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snap-groups/${groupId}/`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const updated = await res.json();
        setGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
        setEditingGroupId(null);
        setEditingGroupName("");
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("delete this group?")) return;
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snap-groups/${groupId}/`, {
        method: "DELETE",
      });
      if (res.ok) setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) { console.error(err); }
  };

  const handleToggleMember = async (group, friendId) => {
    const isMember = group.members.some((m) => m.id === friendId);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/snap-groups/${group.id}/members/${isMember ? friendId + "/" : ""}`,
        isMember
          ? { method: "DELETE" }
          : { method: "POST", body: JSON.stringify({ user_id: friendId }) },
      );
      if (res.ok) {
        if (isMember) {
          setGroups((prev) =>
            prev.map((g) =>
              g.id === group.id
                ? { ...g, members: g.members.filter((m) => m.id !== friendId), member_count: g.member_count - 1 }
                : g,
            ),
          );
        } else {
          const updated = await res.json();
          setGroups((prev) => prev.map((g) => (g.id === group.id ? updated : g)));
        }
      }
    } catch (err) { console.error(err); }
  };

  const handleUnblock = async (blockId) => {
    setUnblockingId(blockId);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/blocks/${blockId}/`,
        { method: "DELETE" },
      );
      if (res.ok) setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } finally {
      setUnblockingId(null);
    }
  };

  useEffect(() => {
    const fetchAllCourses = async () => {
      setLoadingCourses(true);
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/`);
        if (res.ok) setAllCourses(await res.json());
      } catch (err) {
        console.error("Failed to fetch all courses", err);
      } finally {
        setLoadingCourses(false);
      }
    };
    fetchAllCourses();
  }, []);

  const handleEdit = () => {
    setFormData({
      username: currentUser.username,
      email: currentUser.email,
      university: currentUser.university || "",
      major: currentUser.major || "",
      grad_year: currentUser.grad_year || "",
    });
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => { setIsEditing(false); setError(null); };
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/user/`, {
        method: "PATCH",
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        setIsEditing(false);
      } else {
        setError(await res.json());
      }
    } catch (err) {
      setError({ non_field_errors: ["An unexpected error occurred."] });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return "N/A";
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  };

  const inputClasses = "w-full px-3 py-2 border border-ink-15 bg-white rounded-full text-sm outline-none focus:ring-2 focus:ring-coral/20 focus:border-coral transition-all";

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse space-y-4 w-full max-w-md">
          <div className="h-8 bg-ink-8 rounded-full w-3/4" />
          <div className="h-6 bg-ink-8 rounded-full" />
          <div className="h-6 bg-ink-8 rounded-full w-5/6" />
        </div>
      </div>
    );
  }

  const filteredCourses =
    courseFilter === "past"
      ? allCourses.filter((c) => c.end_date && new Date(c.end_date) < new Date())
      : allCourses;

  const dayColors = [T.coral, T.lilac, T.lime, "#b8d8c2", "#f0c4a8", T.coral, T.lilac];

  const totalClasses = new Set(Class_details.map(c => c.base_course || c.course)).size;

  return (
    <div className="space-y-8 pb-32 md:pb-12">
      <div>
        <MonoLabel>me</MonoLabel>
        <h1 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
          settings &amp; such
        </h1>
      </div>

      {/* Profile card (dark) */}
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-5">
        <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: T.ink, color: T.cream }}>
          <Blob color={T.lime} size={140} seed={3} style={{ position: 'absolute', top: -40, right: -40, opacity: 0.85 }}/>
          <Star color={T.coral} size={24} style={{ position: 'absolute', top: 22, right: 28, transform: 'rotate(-10deg)' }}/>

          <div className="relative flex flex-col items-start gap-4">
            <Avatar
              name={currentUser.username?.charAt(0).toLowerCase()}
              bg={T.coral} fg="#fff" size={72}
            />
            <div>
              <MonoLabel color="rgba(248,244,237,.65)">@{currentUser.username}</MonoLabel>
              <div className="text-3xl leading-none mt-1.5 lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
                {currentUser.username}
              </div>
            </div>
            <div className="text-xs leading-relaxed" style={{ color: 'rgba(248,244,237,.85)' }}>
              {currentUser.university && <>{currentUser.university}<br/></>}
              {currentUser.major && <>{currentUser.major}</>}
              {currentUser.grad_year && <> · class of <b>{currentUser.grad_year}</b></>}
            </div>
            <PillBtn onClick={handleEdit} bg={T.coral} fg="#fff" size="sm">edit profile</PillBtn>
          </div>

          <div className="mt-5 pt-4 border-t grid grid-cols-3 gap-2" style={{ borderColor: 'rgba(248,244,237,.18)' }}>
            <div>
              <div className="text-2xl leading-none" style={{ fontFamily: FF.serif }}>{allCourses.length}</div>
              <MonoLabel color="rgba(248,244,237,.6)" fs={9}>classes</MonoLabel>
            </div>
            <div>
              <div className="text-2xl leading-none" style={{ fontFamily: FF.serif }}>{totalClasses}</div>
              <MonoLabel color="rgba(248,244,237,.6)" fs={9}>this week</MonoLabel>
            </div>
            <div>
              <div className="text-2xl leading-none" style={{ fontFamily: FF.serif }}>{currentUser.grad_year || '—'}</div>
              <MonoLabel color="rgba(248,244,237,.6)" fs={9}>grad</MonoLabel>
            </div>
          </div>
        </div>

        {/* Edit form column / accordion settings */}
        {isEditing ? (
          <div className="bg-white rounded-3xl border border-ink-8 p-6">
            <div className="space-y-4">
              <MonoLabel>edit details</MonoLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>username</label>
                  <input name="username" value={formData.username} onChange={handleChange} className={inputClasses} />
                  {error?.username && <p className="text-xs text-coral-dark mt-1">{error.username[0]}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>email</label>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} className={inputClasses} />
                  {error?.email && <p className="text-xs text-coral-dark mt-1">{error.email[0]}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>university</label>
                  <input name="university" value={formData.university} onChange={handleChange} className={inputClasses} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>major</label>
                  <input name="major" value={formData.major} onChange={handleChange} className={inputClasses} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>grad year</label>
                  <input name="grad_year" value={formData.grad_year} onChange={handleChange} placeholder="2027" className={inputClasses} />
                </div>
              </div>
              {error?.non_field_errors && (
                <p className="text-sm text-coral-dark">{error.non_field_errors[0]}</p>
              )}
              <div className="flex gap-3 pt-1">
                <PillBtn onClick={handleSave} disabled={saving} bg={T.coral} fg="#fff" size="md">
                  {saving ? "saving…" : "save changes"}
                </PillBtn>
                <PillBtn onClick={handleCancel} disabled={saving} bg="#fff" fg={T.ink} size="md" style={{ border: `1px solid ${T.ink15}` }}>
                  cancel
                </PillBtn>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Profile details (collapsed by default) */}
            <SettingsSection
              title="profile details"
              hint="username, email, school"
              open={openSection === "profile"}
              onToggle={() => setOpenSection(openSection === "profile" ? null : "profile")}
            >
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <MonoLabel fs={10}>username</MonoLabel>
                  <p className="text-sm font-medium text-ink mt-1">{currentUser.username}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>email</MonoLabel>
                  <p className="text-sm text-ink mt-1 truncate">{currentUser.email || '—'}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>university</MonoLabel>
                  <p className="text-sm text-ink mt-1">{currentUser.university || '—'}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>major</MonoLabel>
                  <p className="text-sm text-ink mt-1">{currentUser.major || '—'}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>grad year</MonoLabel>
                  <p className="text-sm text-ink mt-1" style={{ fontFamily: FF.mono }}>{currentUser.grad_year || '—'}</p>
                </div>
              </div>
              <div className="mt-4">
                <PillBtn onClick={handleEdit} bg={T.ink} fg="#fff" size="sm">edit profile</PillBtn>
              </div>
            </SettingsSection>

            {/* Notifications */}
            <SettingsSection
              title="notifications"
              hint="push, email, quiet hours"
              open={openSection === "notifications"}
              onToggle={() => setOpenSection(openSection === "notifications" ? null : "notifications")}
            >
              {!prefs ? (
                <div className="space-y-3">
                  <div className="h-12 bg-ink-8 animate-pulse rounded-xl" />
                  <div className="h-12 bg-ink-8 animate-pulse rounded-xl" />
                </div>
              ) : (
                <div className="divide-y divide-ink-8">
                  <NotiRow
                    title="snaps from friends"
                    hint="ping me whenever a friend snaps"
                    checked={prefs.snaps_from_friends}
                    onChange={(v) => patchPrefs({ snaps_from_friends: v })}
                    busy={prefsBusy}
                  />
                  <NotiRow
                    title="class is live"
                    hint="when 3+ friends are in a class u're in"
                    checked={prefs.class_is_live}
                    onChange={(v) => patchPrefs({ class_is_live: v })}
                    busy={prefsBusy}
                  />
                  <NotiRow
                    title="weekly recap"
                    hint="every sunday, ur week in numbers"
                    checked={prefs.weekly_recap}
                    onChange={(v) => patchPrefs({ weekly_recap: v })}
                    busy={prefsBusy}
                  />
                  <div className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink lowercase">quiet hours</div>
                        <div className="text-xs text-ink-60 mt-0.5 lowercase">
                          {prefs.quiet_hours_enabled
                            ? `${formatHM(prefs.quiet_hours_start)} – ${formatHM(prefs.quiet_hours_end)} · no pings except direct replies`
                            : "off"}
                        </div>
                      </div>
                      <Toggle
                        checked={prefs.quiet_hours_enabled}
                        onChange={(v) => patchPrefs({ quiet_hours_enabled: v })}
                        disabled={prefsBusy}
                      />
                    </div>
                    {prefs.quiet_hours_enabled && (
                      <div className="mt-3 flex items-center gap-3">
                        <label className="text-xs text-ink-60 lowercase" style={{ fontFamily: FF.mono }}>
                          from
                          <input
                            type="time"
                            value={prefs.quiet_hours_start?.slice(0, 5) || "22:00"}
                            onChange={(e) => patchPrefs({ quiet_hours_start: `${e.target.value}:00` })}
                            className="ml-2 px-2 py-1 border border-ink-15 rounded-full text-xs outline-none focus:border-coral"
                          />
                        </label>
                        <label className="text-xs text-ink-60 lowercase" style={{ fontFamily: FF.mono }}>
                          to
                          <input
                            type="time"
                            value={prefs.quiet_hours_end?.slice(0, 5) || "08:00"}
                            onChange={(e) => patchPrefs({ quiet_hours_end: `${e.target.value}:00` })}
                            className="ml-2 px-2 py-1 border border-ink-15 rounded-full text-xs outline-none focus:border-coral"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SettingsSection>

            {/* Snap groups */}
            <SettingsSection
              title="snap groups"
              hint="share snaps with a saved crew"
              open={openSection === "groups"}
              onToggle={() => setOpenSection(openSection === "groups" ? null : "groups")}
            >
              {groupsLoading ? (
                <div className="space-y-3">
                  <div className="h-12 bg-ink-8 animate-pulse rounded-xl" />
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.length === 0 && !showNewGroup && (
                    <p className="text-sm text-ink-60 lowercase">no groups yet — make one to share snaps with just a crew.</p>
                  )}
                  {groups.map((g) => (
                    <div key={g.id} className="bg-cream rounded-xl border border-ink-8 p-3">
                      <div className="flex items-center justify-between gap-3">
                        {editingGroupId === g.id ? (
                          <input
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleRenameGroup(g.id)}
                            autoFocus
                            className={inputClasses}
                            style={{ maxWidth: 220 }}
                          />
                        ) : (
                          <div className="min-w-0">
                            <div className="text-base lowercase" style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.3 }}>{g.name}</div>
                            <div className="text-[10px] text-ink-60 mt-0.5" style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}>
                              {g.member_count} {g.member_count === 1 ? "member" : "members"}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          {editingGroupId === g.id ? (
                            <>
                              <button
                                onClick={() => handleRenameGroup(g.id)}
                                className="px-2.5 py-1 rounded-full text-xs font-semibold lowercase"
                                style={{ background: T.coral, color: "#fff" }}
                              >save</button>
                              <button
                                onClick={() => { setEditingGroupId(null); setEditingGroupName(""); }}
                                className="px-2.5 py-1 rounded-full text-xs lowercase"
                                style={{ background: "#fff", color: T.ink, border: `1px solid ${T.ink15}` }}
                              >cancel</button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name); }}
                                className="p-1.5 rounded-full hover:bg-ink-8 transition-colors"
                                aria-label="rename"
                              ><Icon name="edit" size={14} color={T.ink60} /></button>
                              <button
                                onClick={() => handleDeleteGroup(g.id)}
                                className="p-1.5 rounded-full hover:bg-ink-8 transition-colors"
                                aria-label="delete"
                              ><Icon name="trash" size={14} color={T.ink60} /></button>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Member chips with toggle behavior */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {friends.map((f) => {
                          const inGroup = g.members.some((m) => m.id === f.id);
                          return (
                            <button
                              key={f.id}
                              onClick={() => handleToggleMember(g, f.id)}
                              className="px-2.5 py-1 rounded-full text-xs lowercase transition-colors"
                              style={{
                                background: inGroup ? T.coral : "#fff",
                                color: inGroup ? "#fff" : T.ink60,
                                border: `1px solid ${inGroup ? T.coral : T.ink15}`,
                              }}
                            >
                              {f.username}
                            </button>
                          );
                        })}
                        {friends.length === 0 && (
                          <p className="text-xs text-ink-40 lowercase">add friends first.</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {showNewGroup ? (
                    <div className="bg-cream rounded-xl border border-ink-8 p-3 space-y-3">
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="group name (e.g. study buddies)"
                        className={inputClasses}
                        maxLength={50}
                      />
                      {friends.length === 0 ? (
                        <p className="text-xs text-ink-40 lowercase">add friends first.</p>
                      ) : (
                        <div>
                          <div className="text-xs text-ink-60 lowercase mb-2" style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}>
                            pick members ({newGroupMembers.size})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {friends.map((f) => {
                              const picked = newGroupMembers.has(f.id);
                              return (
                                <button
                                  key={f.id}
                                  onClick={() => toggleNewGroupMember(f.id)}
                                  className="px-2.5 py-1 rounded-full text-xs lowercase transition-colors"
                                  style={{
                                    background: picked ? T.coral : "#fff",
                                    color: picked ? "#fff" : T.ink60,
                                    border: `1px solid ${picked ? T.coral : T.ink15}`,
                                  }}
                                >
                                  {f.username}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <PillBtn onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()} bg={T.coral} fg="#fff" size="sm">
                          {creatingGroup ? "creating…" : "create group"}
                        </PillBtn>
                        <PillBtn
                          onClick={() => { setShowNewGroup(false); setNewGroupName(""); setNewGroupMembers(new Set()); }}
                          bg="#fff" fg={T.ink} size="sm"
                          style={{ border: `1px solid ${T.ink15}` }}
                        >cancel</PillBtn>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewGroup(true)}
                      className="w-full py-2.5 rounded-full text-sm font-semibold lowercase hover:bg-ink-8 transition-colors"
                      style={{ background: "#fff", color: T.ink, border: `1px dashed ${T.ink15}` }}
                    >
                      + new group
                    </button>
                  )}
                </div>
              )}
            </SettingsSection>
          </div>
        )}
      </div>

      {/* My Weekly Schedule */}
      <section>
        <div className="mb-4">
          <MonoLabel>my week</MonoLabel>
          <h2 className="text-2xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
            weekly schedule
          </h2>
        </div>
        <div className="bg-white border border-ink-8 rounded-2xl p-5 w-full overflow-hidden">
          <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[200px]">
            {days.map((day, dayIdx) => {
              const dayClasses = Class_details.filter(
                (cls) =>
                  cls.day &&
                  (cls.day.toLowerCase() === day.toLowerCase() ||
                    cls.day.toLowerCase() === day.slice(0, 3).toLowerCase())
              );
              const dayColor = dayColors[dayIdx % dayColors.length];
              return (
                <div key={day} className="flex-1 min-w-[120px] flex flex-col gap-2">
                  <div className="pb-2 mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: dayColor }}/>
                    <h3 className="text-[10px] font-medium text-ink-60 uppercase tracking-widest" style={{ fontFamily: FF.mono }}>
                      {day.slice(0, 3)}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    {dayClasses.length > 0 ? (
                      dayClasses.map((cls, idx) => (
                        <div key={idx} className="bg-cream rounded-xl p-2.5 border border-ink-8">
                          <p className="text-xs font-semibold text-ink line-clamp-2 lowercase">{cls.course}</p>
                          <p className="text-[10px] text-ink-60 mt-1" style={{ fontFamily: FF.mono }}>{cls.time}</p>
                          <p className="text-[10px] text-ink-60 truncate">{cls.location}</p>
                        </div>
                      ))
                    ) : (
                      <div className="flex-1 flex items-center justify-center min-h-[60px]">
                        <p className="text-[10px] text-ink-40">—</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* All My Courses */}
      <section>
        <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
          <div>
            <MonoLabel>archive</MonoLabel>
            <h2 className="text-2xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
              all my courses
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <MonoLabel>sort</MonoLabel>
            <div className="relative">
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="appearance-none bg-white text-ink text-sm font-medium px-4 py-2 pr-8 rounded-full border border-ink-15 outline-none cursor-pointer hover:border-ink-40 transition-colors"
              >
                <option value="all">all courses</option>
                <option value="past">past courses</option>
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-60 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-white border border-ink-8 rounded-2xl p-5">
          {loadingCourses ? (
            <div className="space-y-3">
              <div className="h-12 bg-ink-8 animate-pulse rounded-xl" />
              <div className="h-12 bg-ink-8 animate-pulse rounded-xl" />
            </div>
          ) : filteredCourses.length > 0 ? (
            <div className="space-y-2">
              {filteredCourses.map((course) => (
                <div key={course.id} className="bg-cream rounded-xl p-4 flex items-center justify-between border border-ink-8">
                  <div>
                    <span className="font-semibold text-ink lowercase" style={{ fontFamily: FF.serif, fontSize: 16, letterSpacing: -0.3 }}>{course.course_id}</span>
                    {course.course_name && (
                      <span className="text-xs text-ink-60 ml-2 lowercase">{course.course_name}</span>
                    )}
                  </div>
                  <span className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>
                    {formatDate(course.start_date)} – {formatDate(course.end_date)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-ink-40 text-sm">no courses found.</p>
            </div>
          )}
        </div>
      </section>

      {/* Blocked users */}
      <section>
        <div className="mb-4">
          <MonoLabel>boundaries</MonoLabel>
          <h2 className="text-2xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
            blocked users
          </h2>
        </div>
        <div className="bg-white border border-ink-8 rounded-2xl p-5">
          {blocksLoading ? (
            <div className="space-y-3">
              <div className="h-10 bg-ink-8 animate-pulse rounded-xl" />
              <div className="h-10 bg-ink-8 animate-pulse rounded-xl" />
            </div>
          ) : blocks.length === 0 ? (
            <p className="text-ink-40 text-sm lowercase">no one blocked.</p>
          ) : (
            <div className="space-y-2">
              {blocks.map((b) => (
                <div
                  key={b.id}
                  className="bg-cream rounded-xl p-4 flex items-center justify-between border border-ink-8"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={(b.blocked_username || "?").slice(0, 2).toLowerCase()}
                      bg={T.ink08}
                      fg={T.ink}
                      size={32}
                    />
                    <div className="min-w-0">
                      <div
                        className="text-sm lowercase truncate"
                        style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.3 }}
                      >
                        {b.blocked_username}
                      </div>
                      <div
                        className="text-[10px] uppercase mt-0.5"
                        style={{ color: T.ink40, fontFamily: FF.mono, letterSpacing: 0.5 }}
                      >
                        {b.reason === "appeal_auto" ? "appeal auto-block" : "manual block"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblock(b.id)}
                    disabled={unblockingId === b.id}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold lowercase disabled:opacity-50"
                    style={{ background: "#fff", color: T.ink, border: `1px solid ${T.ink15}` }}
                  >
                    {unblockingId === b.id ? "…" : "unblock"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {blocks.length > 0 && (
            <p
              className="text-[10px] mt-3 lowercase"
              style={{ color: T.ink40, fontFamily: FF.mono, letterSpacing: 0.4 }}
            >
              unblocking only lifts your side. if the other user also blocked
              you, they'd have to unblock you separately.
            </p>
          )}
        </div>
      </section>

      {/* Mobile-only log out pill — desktop has it in the header nav. */}
      {onLogout && (
        <div className="md:hidden mt-6">
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-3 rounded-full text-sm font-semibold lowercase hover:opacity-90 transition-opacity"
            style={{ background: T.coral, color: "#fff", fontFamily: FF.sans }}
          >
            log out
          </button>
        </div>
      )}
    </div>
  );
};

export default Profile;
