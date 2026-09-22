// The server is the authority. No UID/email allowlist or private data is embedded here.
export function installAdminEntry(auth) {
  let generation = 0;
  auth.onChange(async user => {
    const version = ++generation;
    document.getElementById('crAdminLink')?.remove();
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const result = await fetch('/api/admin/session', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!result.ok || version !== generation || auth.getUser() !== user) return;
      const session = await result.json();
      if (session.owner !== true || version !== generation || auth.getUser() !== user) return;
      const link = document.createElement('a');
      link.id = 'crAdminLink'; link.href = '/admin.html'; link.textContent = '◫ 管理者ダッシュボード';
      link.style.cssText = 'display:block;padding:12px 0;color:#dbbd83;font-size:12px;border-top:1px solid #39434f;margin-top:10px';
      document.getElementById('crMenu')?.append(link);
    } catch { /* Access remains hidden if configuration, networking or authentication fails. */ }
  });
}
