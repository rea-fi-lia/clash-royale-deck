// =============================================================
//  CR Deck Builder — 認証＆ユーザーデータ共有モジュール
//  全ページ共通。各ページの </body> 直前に
//     <script type="module" src="auth.js"></script>
//  の1行を入れるだけで、ヘッダーにログインボタンが自動で付きます。
//
//  提供する機能（window.CRAuth 経由）:
//    CRAuth.signIn()              … Googleログイン
//    CRAuth.signOut()             … ログアウト
//    CRAuth.getUser()             … 現在のFirebase Userまたはnull
//    CRAuth.getProfile()          … Firestoreのプロフィール（tier等）
//    CRAuth.setCrTag(tag)         … クラロワプレイヤーIDを保存
//    CRAuth.saveDeck(name, slots) … デッキをクラウド保存
//    CRAuth.listDecks()           … 保存済みデッキ一覧
//    CRAuth.deleteDeck(id)        … デッキ削除
//    CRAuth.onChange(fn)          … ログイン状態が変わるたびfn(user, profile)
//
//  デッキ保存を使うページは、グローバルに以下を用意してください:
//    window.CRDeckBridge = { getDeck:()=>[...], setDeck:(slots)=>{}, cards:[...] }
//  （index.html には組み込み済み）
// =============================================================

import { firebaseConfig, isConfigured, crPlayerApiUrl } from "./firebase-config.js";

// ===== ダブルタップ拡大を全ページ・全要素で防止（ピンチ拡大は維持） =====
// CSSのtouch-actionだけだと動的生成要素などで効かない場合があるためJSでも防ぐ
(function preventDoubleTapZoom() {
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) {
      const t = e.target;
      // 入力欄など、文字選択が必要な要素は除外
      if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) { lastTouchEnd = now; return; }
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
})();

// Firebase SDK は動的に読み込む（CDNが遅くてもUIが先に出るように）。
// 読み込んだ関数はここに入る。
let FB = null;
async function loadFirebase(tries) {
  tries = tries || 0;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
    ]);
    return { ...appMod, ...authMod, ...fsMod };
  } catch (e) {
    // SDKの動的読み込みが一時的に失敗することがある（回線不調等）→ 数回リトライ。
    if (tries >= 4) throw e;
    await new Promise(r => setTimeout(r, 1500 * (tries + 1)));
    return loadFirebase(tries + 1);
  }
}

// ---- グレード（寄付グレード）定義 — 着せ替え解放の土台 -------------
// 寄付額に応じてここを上げていく想定。今は手動 or 後で決済連携。
export const TIERS = {
  free:   { label: "ゲスト",       color: "#6b7080" },
  bronze: { label: "ブロンズ支援", color: "#cd7f32" },
  silver: { label: "シルバー支援", color: "#c0c0c0" },
  gold:   { label: "ゴールド支援", color: "#e8a020" },
};

let app, auth, db;
let currentUser = null;
let currentProfile = null;
let _authReady = false; // Firebaseの認証状態が初回解決したか（解決前はラグ＝ログイン判定が確定しない）
let _ownedCards = null; // クラロワID連携で取得した所持カード（日本語名の配列）
let _crName = null;     // クラロワ ゲーム内の名前（プレイヤーAPIから取得）
let _tagDraft = null;   // CRID入力の下書き（保存を押すまで保持。メニュー開閉で消えない）
let _slotsCache = null; // 5スロットのキャッシュ（読み取り回数の節約）
const changeCallbacks = [];

// ---- ログイン状態のヒントをローカルに保存（ページ遷移時のチラつき防止） ----
const HINT_KEY = "cr_user_hint";
function readHint() { try { return JSON.parse(localStorage.getItem(HINT_KEY) || "null"); } catch (e) { return null; } }
function writeHint(h) { try { localStorage.setItem(HINT_KEY, JSON.stringify(h)); } catch (e) {} }
function clearHint() { try { localStorage.removeItem(HINT_KEY); } catch (e) {} }
// クラロワ ゲーム内名をタグ単位でキャッシュ（再読み込み後も即「2択」表示できるように）
function cachedName(tag) { try { return tag ? (localStorage.getItem("cr_name_" + tag) || null) : null; } catch (e) { return null; } }
function setCachedName(tag, name) { try { if (tag && name) localStorage.setItem("cr_name_" + tag, name); } catch (e) {} }
function clearCachedName(tag) { try { if (tag) localStorage.removeItem("cr_name_" + tag); } catch (e) {} }

// ライト/ダークテーマ（localStorageのみ・全ページ共通。既定=ダーク。各HTML<head>のinlineスクリプトが描画前に適用）
function _isLight() { try { return localStorage.getItem("cr_theme") === "light"; } catch (e) { return false; } }
function _setTheme(mode) {
  try { localStorage.setItem("cr_theme", mode); } catch (e) {}
  document.documentElement.classList.toggle("light", mode === "light");
}

// ---- まずUIを必ず出す（Firebaseの読み込みを待たない） ---------------
injectAccountUI();
// 設定済みなら、前回ログインのヒントがあれば即アバター表示（チラつき防止）。
// 未ログインなら最初から「ログイン」を出す。未設定のときだけ「準備中」。
if (!isConfigured) {
  setLoggedOutUI(true);
} else {
  const hint = readHint();
  if (hint && hint.displayName !== undefined) applyAvatarUI(hint);
  else setLoggedOutUI(false);
}

// ---- 設定があればFirebaseを動的ロードして起動 ----------------------
if (!isConfigured) {
  console.warn("[CRAuth] firebase-config.js が未設定です。ログインは準備中表示のままです。");
} else {
  loadFirebase().then((fb) => {
    FB = fb;
    app  = fb.initializeApp(firebaseConfig);
    auth = fb.getAuth(app);
    db   = fb.getFirestore(app);

    fb.setPersistence(auth, fb.browserLocalPersistence).catch(() => {});

    fb.onAuthStateChanged(auth, async (user) => {
      _authReady = true; // 認証の初回解決が済んだ
      currentUser = user;
      if (user) {
        currentProfile = await ensureProfile(user);
        _crName = cachedName(currentProfile && currentProfile.crTag); // 再読込でも即2択表示
        setLoggedInUI(user, currentProfile);
        writeHint({ displayName: resolveDisplayName(user, currentProfile), photoURL: user.photoURL || "", tier: (currentProfile && currentProfile.tier) || "free" });
        CRAuth.refreshOwnedCards(); // ログイン時、IDがあれば所持カードを取得（基礎）
      } else {
        currentProfile = null;
        _slotsCache = null;
        _ownedCards = null;   // ログアウトで所持カード情報を破棄（ログイン中だけ有効）
        _crName = null;
        _tagDraft = null;
        setLoggedOutUI(false); // ログイン可能状態
        clearHint();
        closeMenu();          // アカウント詳細ホバーを自動で閉じる
        window.dispatchEvent(new CustomEvent("cr-owned-cards", { detail: null })); // 「組めるデッキだけ」を解除
      }
      changeCallbacks.forEach(fn => { try { fn(user, currentProfile); } catch (e) {} });
    });

    // 長時間タブを開きっぱなしにした後など、トークンが失効していることがある。
    // タブに戻ってきたら（再表示時）トークンを強制リフレッシュ＝Firestore操作が失効で失敗するのを防ぐ。
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && auth && auth.currentUser) {
        auth.currentUser.getIdToken(true).catch(() => {});
      }
    });
  }).catch((e) => {
    console.error("[CRAuth] Firebase SDKの読み込みに失敗:", e);
    clearHint();            // 失敗時は前回アバターを残さず「ログイン」を出す（偽ログイン状態で固まらない）
    setLoggedOutUI(false);
  });

  // ウォッチドッグ：一定時間たっても認証が解決しない＝SDK読み込み失敗等で固まっている。
  // その場合は前回ヒント（アバター）を消して「ログイン」を出し、ユーザーが押し直せるようにする（無言で固まらせない）。
  setTimeout(() => {
    if (!_authReady) { clearHint(); setLoggedOutUI(false); }
  }, 10000);

  // オフラインから復帰したのに未解決なら、リロードで再初期化を促す（回線復旧時の自動回復）。
  window.addEventListener("online", () => {
    if (!_authReady) { try { location.reload(); } catch (e) {} }
  });
}

// ---- Firestore: プロフィール作成/取得 ------------------------------
async function ensureProfile(user) {
  const ref = FB.doc(db, "users", user.uid);
  const snap = await FB.getDoc(ref);
  if (!snap.exists()) {
    const data = {
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      crTag: "",
      tier: "free",
      theme: "default",
      nameMode: "account", // 表示名: "account"=Google/メール名, "game"=クラロワ ゲーム内名
      createdAt: FB.serverTimestamp(),
      updatedAt: FB.serverTimestamp(),
    };
    await FB.setDoc(ref, data);
    return data;
  }
  return snap.data();
}

// ---- 公開API ------------------------------------------------------
const CRAuth = {
  // ログインボタン → ログイン方法を選ぶモーダルを開く
  signIn() {
    if (!isConfigured || !FB || !auth) { alert("ログインはまだ準備中です（firebase-config.js を設定してください）"); return; }
    openLoginModal();
  },
  async signInGoogle() {
    try {
      await FB.signInWithPopup(auth, new FB.GoogleAuthProvider());
      closeLoginModal();
    } catch (e) { handleAuthError(e); }
  },
  async signInEmail(email, password) {
    try {
      await FB.signInWithEmailAndPassword(auth, email.trim(), password);
      closeLoginModal();
    } catch (e) { handleAuthError(e); }
  },
  async signUpEmail(email, password) {
    try {
      await FB.createUserWithEmailAndPassword(auth, email.trim(), password);
      closeLoginModal();
    } catch (e) { handleAuthError(e); }
  },
  async resetPassword(email) {
    if (!email.trim()) { setModalMsg("メールアドレスを入力してください"); return; }
    try {
      await FB.sendPasswordResetEmail(auth, email.trim());
      setModalMsg("再設定メールを送りました。メールをご確認ください", true);
    } catch (e) { handleAuthError(e); }
  },
  async signOut() { if (auth && FB) await FB.signOut(auth); },
  getUser() { return currentUser; },
  getProfile() { return currentProfile; },
  isAuthReady() { return _authReady; }, // 認証の初回解決が済んだか
  // ログイン中の可能性が高いか（解決前でも前回ログインのヒントがあればtrue）。
  // 「読み込み中なのに未ログイン扱いでログイン要求」を防ぐのに使う。
  hasSession() { return !!currentUser || (!_authReady && !!readHint()); },
  onChange(fn) { changeCallbacks.push(fn); if (currentUser !== null || currentProfile !== null) fn(currentUser, currentProfile); },

  async setCrTag(tag) {
    if (!currentUser || !FB) return;
    const clean = String(tag).trim().toUpperCase().replace(/^#/, "").replace(/[^A-Z0-9]/g, "");
    const prevTag = (currentProfile && currentProfile.crTag) || "";
    const patch = { crTag: clean, updatedAt: FB.serverTimestamp() };
    if (!clean) patch.nameMode = "account"; // ID解除時はゲーム内名が使えないのでアカウント名へ
    await FB.updateDoc(FB.doc(db, "users", currentUser.uid), patch);
    if (currentProfile) { currentProfile.crTag = clean; if (!clean) currentProfile.nameMode = "account"; }
    if (clean !== prevTag) { clearCachedName(prevTag); _crName = null; } // タグ変更/解除で旧ゲーム内名は破棄
    if (!clean) {
      // 登録抹消：所持カード・ゲーム内名をクリアし、メニュー/アバターを作り直す
      _ownedCards = null;
      window.dispatchEvent(new CustomEvent("cr-owned-cards", { detail: null }));
      setLoggedInUI(currentUser, currentProfile);
    }
  },

  // ── クラロワID連携の基礎：プレイヤータグから所持カードを取得 ──
  getCrTag() { return (currentProfile && currentProfile.crTag) || ""; },
  getCrName() { return _crName || ""; }, // クラロワ ゲーム内の名前（取得済みなら）
  getDisplayName() { return currentUser ? resolveDisplayName(currentUser, currentProfile) : ""; }, // 表示名（未ログインは空）
  getOwnedCards() { return _ownedCards; }, // 取得済みなら日本語カード名の配列、未取得はnull

  // 「あなたの環境」の対戦履歴（端末またぎ用にアカウントへ要約保存）。
  //   プロフィール取得時に一緒に読めるので追加の読み取りコストなし。書き込みは呼び出し側で間引く。
  getMeBattles() { return (currentProfile && Array.isArray(currentProfile.meBattles)) ? currentProfile.meBattles : []; },
  async saveMeBattles(arr) {
    if (!currentUser || !FB) return;
    const a = Array.isArray(arr) ? arr.slice(0, 400) : []; // ドキュメントを軽く保つ
    if (currentProfile) currentProfile.meBattles = a;
    try { await FB.updateDoc(FB.doc(db, "users", currentUser.uid), { meBattles: a, meSyncAt: FB.serverTimestamp() }); } catch (e) {}
  },

  // ★対面ログの月次集計（users/{uid}/meMonthly/{YYYY-MM}）。生ログは貯めず勝ち筋別の集計だけ＝月2KB程度。
  async getMeMonthly(month) {
    if (!currentUser || !FB) return null;
    try {
      const snap = await FB.getDoc(FB.doc(db, "users", currentUser.uid, "meMonthly", month));
      return snap.exists() ? snap.data() : null;
    } catch (e) { return null; }
  },
  async saveMeMonthly(month, data) {
    if (!currentUser || !FB) return;
    try { await FB.setDoc(FB.doc(db, "users", currentUser.uid, "meMonthly", month), data); } catch (e) {}
  },

  // メタマップの開閉状態（アカウントに保存。既定=開く）
  getMapOpen() { return !(currentProfile && currentProfile.mapOpen === false); },
  async setMapOpen(open) {
    if (!currentUser || !FB) return;
    const v = !!open;
    if (currentProfile) currentProfile.mapOpen = v;
    try { await FB.updateDoc(FB.doc(db, "users", currentUser.uid), { mapOpen: v, updatedAt: FB.serverTimestamp() }); } catch (e) {}
  },

  // ¥500特典：ドラッグ時のスパンコール軌跡 ON/OFF（アカウントに保存・既定=ON）
  getFxTrail() { return !(currentProfile && currentProfile.fxTrail === false); },
  async setFxTrail(on) {
    if (!currentUser || !FB) return;
    const v = !!on;
    if (currentProfile) currentProfile.fxTrail = v;
    try { await FB.updateDoc(FB.doc(db, "users", currentUser.uid), { fxTrail: v, updatedAt: FB.serverTimestamp() }); } catch (e) {}
  },

  // 表示名モードを切り替え（"account" or "game"）
  async setNameMode(mode) {
    if (!currentUser || !FB) return;
    const m = (mode === "game") ? "game" : "account";
    await FB.updateDoc(FB.doc(db, "users", currentUser.uid), { nameMode: m, updatedAt: FB.serverTimestamp() });
    if (currentProfile) currentProfile.nameMode = m;
    const nm = resolveDisplayName(currentUser, currentProfile);
    applyAvatarUI({ displayName: nm, photoURL: currentUser.photoURL, tier: (currentProfile && currentProfile.tier) || "free" });
    writeHint({ displayName: nm, photoURL: currentUser.photoURL || "", tier: (currentProfile && currentProfile.tier) || "free" });
    refreshNameUI();
  },
  async refreshOwnedCards() {
    const tag = CRAuth.getCrTag();
    if (!tag) { _ownedCards = null; return null; }
    if (!crPlayerApiUrl) {  // エンドポイント未設定（基礎のみ）。GASのdoGetを用意してURLを設定すると有効化
      console.info("[CRAuth] crPlayerApiUrl 未設定のため所持カード取得はスキップ（基礎のみ実装）");
      return null;
    }
    try {
      const url = crPlayerApiUrl + (crPlayerApiUrl.includes("?") ? "&" : "?") + "tag=" + encodeURIComponent(tag);
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      _ownedCards = Array.isArray(data.cards) ? data.cards : (Array.isArray(data) ? data : []);
      if (data && typeof data.name === "string" && data.name) { _crName = data.name; setCachedName(tag, _crName); } // ゲーム内名を保持＋キャッシュ
      try { localStorage.setItem("cr_owned_" + tag, JSON.stringify(_ownedCards)); } catch (e) {}
      window.dispatchEvent(new CustomEvent("cr-owned-cards", { detail: _ownedCards }));
      refreshNameUI(); // ゲーム内名が取れたら表示名の選択肢を更新（モードがgameなら名前も反映）
      return _ownedCards;
    } catch (e) { console.error("[CRAuth] 所持カード取得失敗:", e); return null; }
  },

  async saveDeck(name, slots) {
    if (!currentUser) { CRAuth.signIn(); return; }
    const avg = slots.length ? (slots.reduce((s, c) => s + (c.cost || 0), 0) / slots.length) : 0;
    await FB.addDoc(FB.collection(db, "users", currentUser.uid, "decks"), {
      name: name || "無題デッキ",
      slots: slots.map(c => c.name),
      avg: Math.round(avg * 100) / 100,
      createdAt: FB.serverTimestamp(),
    });
  },

  async listDecks() {
    if (!currentUser || !FB) return [];
    const q = FB.query(FB.collection(db, "users", currentUser.uid, "decks"), FB.orderBy("createdAt", "desc"));
    const snap = await FB.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async deleteDeck(id) {
    if (!currentUser || !FB) return;
    await FB.deleteDoc(FB.doc(db, "users", currentUser.uid, "decks", id));
  },

  // ---- 5スロット保存（クラウド・作成途中でも保存可） ----
  // スロットは users/{uid}/decks/slot1..slot5 に固定IDで保存
  async saveDeckToSlot(slot, name, cards) {
    if (!currentUser) { CRAuth.signIn(); return; }
    const s = Math.max(1, Math.min(5, slot | 0));
    const list = (cards || []).filter(Boolean);
    const avg = list.length ? (list.reduce((a, c) => a + (c.cost || 0), 0) / list.length) : 0;
    const data = {
      slot: s,
      name: name || ("デッキ" + s),
      slots: list.map(c => c.name),
      avg: Math.round(avg * 100) / 100,
      createdAt: FB.serverTimestamp(),
    };
    await FB.setDoc(FB.doc(db, "users", currentUser.uid, "decks", "slot" + s), data);
    // キャッシュも更新（再読み込み＝Firestore読み取りを増やさない）
    if (_slotsCache) {
      _slotsCache = _slotsCache.filter(x => x.slot !== s).concat([{ id: "slot" + s, ...data }]).sort((a, b) => (a.slot || 0) - (b.slot || 0));
    }
  },

  // 5スロットの現在の中身を返す（キャッシュ優先で読み取り回数を節約）
  async getSlots(force) {
    if (!currentUser || !FB) return [];
    if (_slotsCache && !force) return _slotsCache;
    const snap = await FB.getDocs(FB.collection(db, "users", currentUser.uid, "decks"));
    _slotsCache = snap.docs
      .filter(d => /^slot[1-5]$/.test(d.id))
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.slot || 0) - (b.slot || 0));
    return _slotsCache;
  },

  // ---- お気に入り（クラウド保存・端末間で維持） ----
  getCloudFavorites() { return (currentProfile && currentProfile.favorites) || []; },
  async saveFavorites(arr) {
    if (!currentUser || !FB) return;
    const list = Array.from(new Set(arr || []));
    await FB.updateDoc(FB.doc(db, "users", currentUser.uid), { favorites: list, updatedAt: FB.serverTimestamp() });
    if (currentProfile) currentProfile.favorites = list;
  },
};
window.CRAuth = CRAuth;

// =============================================================
//  ヘッダーに差し込むアカウントUI（全ページ共通・自動生成）
// =============================================================
function injectAccountUI() {
  if (document.getElementById("cr-account")) return;

  const style = document.createElement("style");
  style.textContent = `
    #cr-account { margin-left: auto; display: flex; align-items: center; }
    .cr-login-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--accent, #e8a020); color: #000; font-weight: 700;
      border: none; border-radius: 8px; padding: 7px 12px; cursor: pointer;
      font-family: inherit; font-size: 13px; white-space: nowrap;
      position: relative; z-index: 600; /* バックドロップより前面＝再タップで閉じられる */
    }
    .cr-login-btn:disabled { opacity: .5; cursor: default; }
    .cr-avatar-btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--surface2, #1e2230); border: 1px solid var(--border-hi, rgba(255,255,255,.15));
      border-radius: 999px; padding: 4px 10px 4px 4px; cursor: pointer; color: var(--text, #e8eaf0);
      font-family: inherit; font-size: 13px;
      position: relative; z-index: 600; /* バックドロップより前面＝名前を再タップで閉じられる */
    }
    .cr-avatar-btn img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; }
    .cr-tier-chip { font-size: 10px; padding: 1px 6px; border-radius: 999px; font-weight: 700; }
    .cr-menu {
      position: absolute; top: 100%; right: 12px; margin-top: 6px; z-index: 500;
      background: var(--surface, #161920); border: 1px solid var(--border-hi, rgba(255,255,255,.15));
      border-radius: 12px; padding: 12px; width: 210px; box-shadow: 0 12px 32px rgba(0,0,0,.5);
      display: none; touch-action: manipulation;
    }
    .cr-menu * { touch-action: manipulation; }
    .cr-menu.open { display: block; }
    /* メニュー外タップ用の透明な受け皿（ヘッダーの重なり内・メニューより下） */
    #crMenuBackdrop { position: fixed; inset: 0; z-index: 400; background: transparent; }
    .cr-menu .cr-hint { font-size: 11px; color: var(--text-muted, #6b7080); margin: 6px 0 2px; line-height: 1.5; }
    .cr-menu h4 { font-size: 13px; margin: 0 0 8px; color: var(--text, #e8eaf0); }
    .cr-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .cr-name-row h4 { margin: 0; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cr-name-edit { flex: none; background: none; border: none; color: var(--text-muted,#6b7080); cursor: pointer;
      font-size: 18px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
      border-radius: 8px; line-height: 1; }
    .cr-name-edit:hover { color: var(--text,#e8eaf0); background: var(--surface2,#1e2230); }
    .cr-name-picker { display: none; background: var(--surface2,#1e2230); border: 1px solid var(--border,rgba(255,255,255,.07)); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
    .cr-name-picker.open { display: block; }
    .cr-name-edit.on { color: var(--accent,#e8a020); background: var(--surface2,#1e2230); }
    .cr-name-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text,#e8eaf0); padding: 6px 2px; cursor: pointer; }
    .cr-name-opt input[type=radio] { accent-color: var(--accent,#e8a020); width:16px; height:16px; flex:none; margin:0; }
    .cr-name-opt input[type=radio]:disabled + span { color: var(--text-dim,#3a3f50); }
    .cr-menu .cr-row { display: flex; gap: 6px; align-items: center; margin: 8px 0; }
    .cr-menu input { flex: 1; min-width: 0; background: var(--surface2,#1e2230); border: 1px solid var(--border,rgba(255,255,255,.07));
      border-radius: 6px; color: var(--text,#e8eaf0); padding: 6px 8px; font-size: 16px; outline: none; }
    .cr-menu .cr-tag-prefix { color: var(--text-muted,#6b7080); font-weight: 700; font-size: 14px; }
    .cr-menu button.cr-mini { flex: none; white-space: nowrap; }
    .cr-menu button.cr-mini { background: var(--surface2,#1e2230); border: 1px solid var(--border-hi,rgba(255,255,255,.15));
      color: var(--text,#e8eaf0); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-family: inherit; }
    .cr-menu .cr-divider { height:1px; background: var(--border,rgba(255,255,255,.07)); margin: 10px 0; }
    .cr-menu .cr-logout { color: #e05050; }
    .cr-decklist { max-height: 200px; overflow-y: auto; }
    .cr-deckitem { display:flex; justify-content:space-between; align-items:center; gap:6px;
      padding:6px 4px; border-bottom:1px solid var(--border,rgba(255,255,255,.07)); font-size:12px; color:var(--text,#e8eaf0); }
    .cr-deckitem .nm { flex:1; cursor:pointer; }
    .cr-deckitem .del { color:#e05050; cursor:pointer; background:none; border:none; font-size:13px; }
    @media (max-width:720px){ .cr-menu{ right:8px; width: 220px; max-width: calc(100vw - 16px); } }
    /* タイトル副題は常時表示・1行（チラつき防止のレイアウトは各ページのCSSで先に適用） */
    header .logo { white-space: nowrap; }
    header .logo span { display: block !important; white-space: nowrap; }
    #cr-account { order: 1; }
  `;
  document.head.appendChild(style);

  const header = document.querySelector("header") || document.body;
  if (getComputedStyle(header).position === "static") header.style.position = "relative";

  const wrap = document.createElement("div");
  wrap.id = "cr-account";
  wrap.innerHTML = `
    <button class="cr-login-btn" id="crLoginBtn">🔑 ログイン</button>
    <button class="cr-avatar-btn" id="crAvatarBtn" style="display:none">
      <img id="crAvatarImg" alt="">
      <span id="crAvatarName"></span>
      <span class="cr-tier-chip" id="crTierChip"></span>
    </button>
    <div class="cr-menu" id="crMenu"></div>
  `;
  header.appendChild(wrap);

  // ログイン前にプライバシーポリシー同意（初回のみダイアログ。同意の記録はこの端末のlocalStorage）
  document.getElementById("crLoginBtn").onclick = () => {
    let ok = false; try { ok = localStorage.getItem("cr_pp_ok") === "1"; } catch (e) {}
    if (ok) { CRAuth.signIn(); return; }
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:4000;display:flex;align-items:center;justify-content:center;padding:20px;";
    ov.innerHTML = `
      <div style="background:var(--surface,#161920);border:1px solid rgba(255,255,255,.14);border-radius:14px;max-width:340px;padding:18px 18px 14px;color:var(--text,#e8eaf0);font-size:13px;line-height:1.7;">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px;">ログインの前に</div>
        <div>続行すると、<a href="privacy.html" target="_blank" style="color:#7db4ff;">プライバシーポリシー</a>（アカウント情報・対戦データの取り扱い、匿名統計への利用）に同意したものとみなされます。</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
          <button id="crPpNo" style="background:none;border:1px solid rgba(255,255,255,.2);color:var(--text,#e8eaf0);border-radius:8px;padding:7px 14px;cursor:pointer;">キャンセル</button>
          <button id="crPpYes" style="background:#e8a020;border:none;color:#14161c;font-weight:700;border-radius:8px;padding:7px 16px;cursor:pointer;">同意して続行</button>
        </div>
      </div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector("#crPpNo").onclick = () => ov.remove();
    ov.querySelector("#crPpYes").onclick = () => { try { localStorage.setItem("cr_pp_ok", "1"); } catch (e) {} ov.remove(); CRAuth.signIn(); };
    document.body.appendChild(ov);
  };
  document.getElementById("crAvatarBtn").onclick = (e) => { e.stopPropagation(); toggleMenu(); };
  document.addEventListener("click", (e) => {
    const m = document.getElementById("crMenu");
    if (m && m.classList.contains("open") && !e.target.closest("#cr-account")) closeMenu();
  });
}

function setLoggedOutUI(disabled) {
  const lb = document.getElementById("crLoginBtn");
  const ab = document.getElementById("crAvatarBtn");
  if (!lb) return;
  lb.style.display = "inline-flex";
  ab.style.display = "none";
  lb.disabled = !!disabled;
  lb.textContent = disabled ? "🔑 ログイン（準備中）" : "🔑 ログイン";
  closeMenu(); // ログアウト等でログインUIに戻したら、開いていたメニューを必ず閉じる
}

// アバター表示だけを更新（ヒントからの即時描画にも使う・メニューは作らない）
function applyAvatarUI(info) {
  const lb = document.getElementById("crLoginBtn");
  const ab = document.getElementById("crAvatarBtn");
  if (!lb) return;
  lb.style.display = "none";
  ab.style.display = "inline-flex";
  document.getElementById("crAvatarImg").src = info.photoURL || "https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png";
  document.getElementById("crAvatarName").textContent = (info.displayName || "プレイヤー").split(" ")[0];
  // tierの文字チップ（ゲスト/◯◯支援）は廃止＝出さない。ランクは将来アイコンの変化で表現する。
  const chip = document.getElementById("crTierChip");
  if (chip) chip.style.display = "none";
}

// 表示名の解決：mode="game" かつ ゲーム内名があればそれ、無ければアカウント名
function accountNameOf(user) {
  if (!user) return "プレイヤー";
  if (user.displayName) return user.displayName;
  if (user.email) return user.email.split("@")[0];
  return "プレイヤー";
}
function resolveDisplayName(user, profile) {
  const mode = (profile && profile.nameMode) || "account";
  if (mode === "game") {
    if (_crName) return _crName;
    const h = readHint(); // ゲーム内名がまだ取れてない間は直近の表示名で代用（チラつき防止）
    if (h && h.displayName) return h.displayName;
  }
  return accountNameOf(user);
}

function setLoggedInUI(user, profile) {
  applyAvatarUI({ displayName: resolveDisplayName(user, profile), photoURL: user.photoURL, tier: (profile && profile.tier) || "free" });
  buildMenu(user, profile);
}

// メニューを閉じる（ログアウト時などに使用）。名前選択ピッカーも一緒に閉じる
function closeMenu() {
  const m = document.getElementById("crMenu");
  if (m) m.classList.remove("open");
  const p = document.getElementById("crNamePicker");
  if (p) p.classList.remove("open");
  syncMenuBackdrop();
}

function esc_(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// 表示名の選択肢を描画。ゲーム内名(_crName)はID入力後に取得できたら選択肢を追加（それまではアカウント名の一択）
function renderNamePicker() {
  const p = document.getElementById("crNamePicker");
  if (!p) return;
  const user = currentUser, profile = currentProfile;
  const mode = (profile && profile.nameMode) || "account";
  let html = '<label class="cr-name-opt"><input type="radio" name="crNameMode" value="account" id="crNameAccRadio"><span>' + esc_(accountNameOf(user)) + "</span></label>";
  if (_crName) {
    html += '<label class="cr-name-opt"><input type="radio" name="crNameMode" value="game" id="crNameGameRadio"><span>' + esc_(_crName) + "</span></label>";
  }
  p.innerHTML = html;
  const accR = document.getElementById("crNameAccRadio");
  const gameR = document.getElementById("crNameGameRadio");
  if (accR) accR.checked = !(mode === "game" && _crName);
  if (gameR) gameR.checked = (mode === "game");
  [accR, gameR].forEach((r) => { if (r) r.onchange = () => { if (r.checked) CRAuth.setNameMode(r.value); }; });
  const hint = document.getElementById("crTagHint");
  if (hint) hint.textContent = _crName
    ? "「保存」で更新／空にして「保存」で登録を解除できます。"
    : "クラロワIDを入力して「保存」すると、所持カードの絞り込みやゲーム内の名前の表示に使えます。";
}

// 表示名まわりのUIだけを更新（メニューは作り直さない）
function refreshNameUI() {
  const full = resolveDisplayName(currentUser, currentProfile);
  const nm = document.getElementById("crMenuName");
  if (nm) nm.textContent = full;
  const av = document.getElementById("crAvatarName");
  if (av) av.textContent = (full || "プレイヤー").split(" ")[0];
  renderNamePicker(); // ID保存でゲーム内名が取れたら選択肢を更新
}

function buildMenu(user, profile) {
  const m = document.getElementById("crMenu");
  const mode = (profile && profile.nameMode) || "account";
  // ※このエリアは今後随時拡張していく
  m.innerHTML = `
    <div class="cr-name-row">
      <button class="cr-name-edit" id="crNameEdit" title="表示名を変更" aria-label="表示名を変更">✎</button>
      <h4 id="crMenuName">${esc_(resolveDisplayName(user, profile))}</h4>
    </div>
    <div class="cr-name-picker" id="crNamePicker"></div>
    <div class="cr-row">
      <span class="cr-tag-prefix">#</span>
      <input id="crTagInput" placeholder="ABC123" value="${esc_((profile && profile.crTag) || "")}"
        autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12"
        inputmode="text" style="text-transform:uppercase">
      <button class="cr-mini" id="crTagSave">保存</button>
    </div>
    <div class="cr-hint" id="crTagHint"></div>
    ${(profile && profile.points >= 500) ? `
    <div class="cr-divider"></div>
    <label class="cr-row" style="justify-content:space-between; cursor:pointer">
      <span style="font-size:12px">✨ ドラッグの軌跡</span>
      <input type="checkbox" id="crFxTrail" ${CRAuth.getFxTrail() ? "checked" : ""}>
    </label>` : ""}
    <div class="cr-divider"></div>
    <label class="cr-row" style="justify-content:space-between; cursor:pointer">
      <span style="font-size:12px">🌗 背景を白くする</span>
      <input type="checkbox" id="crLightTheme" ${_isLight() ? "checked" : ""}>
    </label>
    <div class="cr-divider"></div>
    <div class="cr-row"><button class="cr-mini cr-logout" id="crLogout">ログアウト</button></div>
  `;
  // 表示名ピッカー（ID未入力ならアカウント名の一択、取得後にゲーム内名を追加）。✎で開閉
  renderNamePicker();
  const editBtn = document.getElementById("crNameEdit");
  if (editBtn) editBtn.onclick = () => {
    const pk = document.getElementById("crNamePicker");
    const open = pk.classList.toggle("open");
    editBtn.classList.toggle("on", open);
  };

  // 入力は自動で大文字＋英数字のみ（#不要・小文字や記号は弾く）
  const tagInput = document.getElementById("crTagInput");
  // 入力中は見た目だけ整形（大文字・英数字）。保存を押すまで登録内容は一切書き換えない（下書きは保持しない）
  if (tagInput) tagInput.addEventListener("input", () => {
    tagInput.value = tagInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  document.getElementById("crTagSave").onclick = async () => {
    const v = document.getElementById("crTagInput").value;
    await CRAuth.setCrTag(v); // 「保存」を押した時だけ登録を更新。空なら登録抹消
    flash("crTagSave", "✓");
    if (v.trim()) CRAuth.refreshOwnedCards(); // 登録時のみ所持カード＋ゲーム内名を取得
  };
  const fxT = document.getElementById("crFxTrail");
  if (fxT) fxT.onchange = () => CRAuth.setFxTrail(fxT.checked);
  const lt = document.getElementById("crLightTheme");
  if (lt) lt.onchange = () => _setTheme(lt.checked ? "light" : "dark");
  document.getElementById("crLogout").onclick = () => CRAuth.signOut();
}

function toggleMenu() {
  const m = document.getElementById("crMenu");
  m.classList.toggle("open");
  if (m.classList.contains("open")) {
    // 開くたびに入力欄を保存済みの値へ戻す（未保存の編集は破棄。登録は「保存」時だけ変わる）
    const ti = document.getElementById("crTagInput");
    if (ti) ti.value = (currentProfile && currentProfile.crTag) || "";
    // 名前ピッカーは畳んだ状態から
    const pk = document.getElementById("crNamePicker");
    if (pk) pk.classList.remove("open");
    const eb = document.getElementById("crNameEdit");
    if (eb) eb.classList.remove("on");
  }
  syncMenuBackdrop();
}
// メニューを開いたら、画面全体に透明な受け皿を出して「外側タップで閉じる（その操作は他に波及しない）」を実現
function syncMenuBackdrop() {
  const m = document.getElementById("crMenu");
  let bd = document.getElementById("crMenuBackdrop");
  const open = m && m.classList.contains("open");
  if (open && !bd) {
    bd = document.createElement("div");
    bd.id = "crMenuBackdrop";
    bd.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); m.classList.remove("open"); syncMenuBackdrop(); }, true);
    // ヘッダーの重なり（stacking context）内に入れることで、メニューより下・他コンテンツより上に出す
    (document.getElementById("cr-account") || document.body).appendChild(bd);
  } else if (!open && bd) {
    bd.remove();
  }
}

function flash(btnId, txt) {
  const b = document.getElementById(btnId);
  if (!b) return;
  const old = b.textContent; b.textContent = txt;
  setTimeout(() => { b.textContent = old; }, 1000);
}

// =============================================================
//  ログインモーダル（Google ＋ メール/パスワード）
// =============================================================
let loginMode = "login"; // "login" | "signup"

function ensureLoginModal() {
  if (document.getElementById("crLoginModal")) return;
  const style = document.createElement("style");
  style.textContent = `
    .cr-modal-ov { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 1000;
      display: none; align-items: center; justify-content: center; }
    .cr-modal-ov.open { display: flex; }
    .cr-modal { background: var(--surface,#161920); border: 1px solid var(--border-hi,rgba(255,255,255,.15));
      border-radius: 14px; padding: 22px; width: min(360px, 92vw); box-shadow: 0 16px 40px rgba(0,0,0,.55);
      font-family: inherit; color: var(--text,#e8eaf0); }
    .cr-modal h3 { margin: 0 0 4px; font-size: 18px; text-align: center; }
    .cr-modal .sub { font-size: 12px; color: var(--text-muted,#6b7080); text-align: center; margin-bottom: 16px; }
    .cr-gbtn { width: 100%; display:flex; align-items:center; justify-content:center; gap:10px;
      background:#fff; color:#1f1f1f; border:none; border-radius:8px; padding:11px; font-size:14px; font-weight:600;
      cursor:pointer; font-family:inherit; }
    .cr-gbtn img { width:18px; height:18px; }
    .cr-or { display:flex; align-items:center; gap:8px; color:var(--text-muted,#6b7080); font-size:11px; margin:14px 0; }
    .cr-or::before,.cr-or::after { content:''; flex:1; height:1px; background:var(--border,rgba(255,255,255,.07)); }
    .cr-field { width:100%; background:var(--surface2,#1e2230); border:1px solid var(--border,rgba(255,255,255,.07));
      border-radius:8px; color:var(--text,#e8eaf0); padding:11px; font-size:15px; outline:none; margin-bottom:10px; }
    .cr-field:focus { border-color: var(--accent,#e8a020); }
    .cr-primary { width:100%; background:var(--accent,#e8a020); color:#000; font-weight:700; border:none;
      border-radius:8px; padding:12px; font-size:15px; cursor:pointer; font-family:inherit; }
    .cr-msg { font-size:12px; text-align:center; margin-top:10px; min-height:16px; color:#e05050; }
    .cr-msg.ok { color:#26c6a0; }
    .cr-switch { text-align:center; font-size:12px; margin-top:14px; color:var(--text-muted,#6b7080); }
    .cr-switch a { color:var(--accent,#e8a020); cursor:pointer; text-decoration:underline; }
    .cr-reset { text-align:center; font-size:11px; margin-top:8px; }
    .cr-reset a { color:var(--text-muted,#6b7080); cursor:pointer; }
    .cr-x { position:absolute; }
    .cr-modal .top { display:flex; justify-content:flex-end; margin:-8px -8px 0 0; }
    .cr-modal .top button { background:none; border:none; color:var(--text-muted,#6b7080); font-size:20px; cursor:pointer; }
  `;
  document.head.appendChild(style);
  const ov = document.createElement("div");
  ov.className = "cr-modal-ov";
  ov.id = "crLoginModal";
  ov.innerHTML = `<div class="cr-modal">
    <div class="top"><button id="crModalClose">✕</button></div>
    <h3 id="crModalTitle">ログイン</h3>
    <div class="sub" id="crModalSub">デッキ保存やマイページに使えます</div>
    <button class="cr-gbtn" id="crGoogleBtn">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="">Googleで続行
    </button>
    <div class="cr-or">または メールで</div>
    <input class="cr-field" id="crEmail" type="email" placeholder="メールアドレス" autocomplete="email">
    <input class="cr-field" id="crPass" type="password" placeholder="パスワード（6文字以上）" autocomplete="current-password">
    <button class="cr-primary" id="crEmailBtn">ログイン</button>
    <div class="cr-msg" id="crModalMsg"></div>
    <div class="cr-reset" id="crResetWrap"><a id="crResetLink">パスワードを忘れた場合</a></div>
    <div class="cr-switch" id="crSwitchWrap">
      アカウントがない？ <a id="crSwitchLink">新規登録</a>
    </div>
  </div>`;
  document.body.appendChild(ov);

  ov.addEventListener("click", (e) => { if (e.target === ov) closeLoginModal(); });
  document.getElementById("crModalClose").onclick = closeLoginModal;
  document.getElementById("crGoogleBtn").onclick = () => CRAuth.signInGoogle();
  document.getElementById("crEmailBtn").onclick = () => {
    const email = document.getElementById("crEmail").value;
    const pass = document.getElementById("crPass").value;
    if (!email || !pass) { setModalMsg("メールとパスワードを入力してください"); return; }
    if (loginMode === "login") CRAuth.signInEmail(email, pass);
    else CRAuth.signUpEmail(email, pass);
  };
  document.getElementById("crSwitchLink").onclick = () => {
    loginMode = loginMode === "login" ? "signup" : "login";
    applyLoginMode();
  };
  document.getElementById("crResetLink").onclick = () =>
    CRAuth.resetPassword(document.getElementById("crEmail").value);
}

function applyLoginMode() {
  const isLogin = loginMode === "login";
  document.getElementById("crModalTitle").textContent = isLogin ? "ログイン" : "新規登録";
  document.getElementById("crEmailBtn").textContent = isLogin ? "ログイン" : "登録する";
  document.getElementById("crSwitchWrap").innerHTML = isLogin
    ? `アカウントがない？ <a id="crSwitchLink">新規登録</a>`
    : `すでにアカウントがある？ <a id="crSwitchLink">ログイン</a>`;
  document.getElementById("crResetWrap").style.display = isLogin ? "block" : "none";
  document.getElementById("crSwitchLink").onclick = () => {
    loginMode = loginMode === "login" ? "signup" : "login";
    applyLoginMode();
  };
  setModalMsg("");
}

function openLoginModal() {
  ensureLoginModal();
  loginMode = "login";
  applyLoginMode();
  document.getElementById("crLoginModal").classList.add("open");
}
function closeLoginModal() {
  const m = document.getElementById("crLoginModal");
  if (m) m.classList.remove("open");
}
function setModalMsg(txt, ok) {
  const m = document.getElementById("crModalMsg");
  if (!m) return;
  m.textContent = txt || "";
  m.classList.toggle("ok", !!ok);
}
function handleAuthError(e) {
  console.error(e);
  const map = {
    "auth/invalid-email": "メールアドレスの形式が正しくありません",
    "auth/missing-password": "パスワードを入力してください",
    "auth/weak-password": "パスワードは6文字以上にしてください",
    "auth/email-already-in-use": "このメールは登録済みです。ログインしてください",
    "auth/invalid-credential": "メールまたはパスワードが違います",
    "auth/wrong-password": "メールまたはパスワードが違います",
    "auth/user-not-found": "アカウントが見つかりません。新規登録してください",
    "auth/too-many-requests": "試行回数が多すぎます。少し待って再試行してください",
    "auth/popup-closed-by-user": "",
  };
  const msg = map[e.code] !== undefined ? map[e.code] : ("エラー: " + (e.message || e.code));
  if (msg) setModalMsg(msg);
}
