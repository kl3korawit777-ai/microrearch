// Microrearch — main app logic
const STORAGE_KEY = 'microrearch_data_v1';
const USERS_KEY = 'microrearch_users_v1';
const SESSION_KEY = 'microrearch_session_v1';

// ============ AUTH ============
async function hashPassword(pw) {
  try {
    const buf = new TextEncoder().encode(pw + '::microrearch_salt');
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // fallback (file:// อาจไม่รองรับ crypto.subtle)
    let h = 0; const s = pw + '::microrearch_salt';
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'fb_' + Math.abs(h).toString(16);
  }
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); }
  catch { return {}; }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

async function ensureDefaultAdmin() {
  const users = getUsers();
  if (!users.admin) {
    users.admin = {
      username: 'admin',
      displayName: 'ผู้ดูแลระบบ',
      passwordHash: await hashPassword('admin123'),
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);
  }
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('loginForm').hidden = tab !== 'login';
  document.getElementById('registerForm').hidden = tab !== 'register';
  document.getElementById('authError').classList.remove('show');
}

async function doLogin(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim().toLowerCase();
  const password = form.password.value;
  const users = getUsers();
  const user = users[username];
  if (!user) { showAuthError('ไม่พบบัญชีนี้'); return false; }
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) { showAuthError('รหัสผ่านไม่ถูกต้อง'); return false; }
  saveSession({ username: user.username, displayName: user.displayName, loginAt: Date.now() });
  enterApp();
  return false;
}

async function doRegister(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim().toLowerCase();
  const displayName = form.displayName.value.trim() || username;
  const pw = form.password.value;
  const pw2 = form.password2.value;
  if (!/^[a-z0-9_]+$/.test(username)) { showAuthError('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, _'); return false; }
  if (pw !== pw2) { showAuthError('รหัสผ่านไม่ตรงกัน'); return false; }
  const users = getUsers();
  if (users[username]) { showAuthError('ชื่อผู้ใช้นี้ถูกใช้แล้ว'); return false; }
  users[username] = {
    username, displayName,
    passwordHash: await hashPassword(pw),
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);
  saveSession({ username, displayName, loginAt: Date.now() });
  toast('สมัครสมาชิกสำเร็จ ยินดีต้อนรับ ' + displayName + ' ✨', 'success');
  enterApp();
  return false;
}

function doLogout() {
  if (!confirm('ออกจากระบบใช่ไหม?')) return;
  saveSession(null);
  document.getElementById('authScreen').hidden = false;
  document.getElementById('appHeader').hidden = true;
  document.getElementById('appMain').hidden = true;
  document.getElementById('loginForm').reset();
  document.getElementById('registerForm').reset();
  switchAuthTab('login');
}

function enterApp() {
  const session = getSession();
  if (!session) return;
  document.getElementById('authScreen').hidden = true;
  document.getElementById('appHeader').hidden = false;
  document.getElementById('appMain').hidden = false;
  const initials = (session.displayName || session.username).slice(0, 1).toUpperCase();
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userName').textContent = session.displayName || session.username;
  loadData();
  render();
}

window.switchAuthTab = switchAuthTab;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.doLogout = doLogout;

const state = {
  microbes: [],
  search: '',
  activeCategory: null,
  activeKingdom: null,
  openGroups: new Set(),
  editingId: null,
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ============ DATA PERSISTENCE ============
function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      state.microbes = JSON.parse(stored);
      return;
    }
  } catch (e) { console.warn('Load failed', e); }
  state.microbes = JSON.parse(JSON.stringify(MICROBES));
  saveData();
}
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.microbes));
  } catch (e) {
    toast('บันทึกไม่สำเร็จ — พื้นที่อาจเต็ม', 'error');
  }
}

// ============ HELPERS ============
function kingdomLabel(k) {
  return { bacteria: 'แบคทีเรีย', virus: 'ไวรัส', parasite: 'ปรสิต' }[k] || k;
}
function categoryLabel(id) {
  for (const king of CATEGORY_TREE) {
    for (const grp of king.groups) {
      const f = grp.items.find((i) => i.id === id);
      if (f) return f.label;
    }
  }
  return id;
}
function genId() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ============ TOAST ============
let toastTimer = null;
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2400);
}

// ============ SIDEBAR ============
function renderSidebar() {
  const nav = $('categoryNav');
  nav.innerHTML = '';
  CATEGORY_TREE.forEach((king) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'cat-group' + (state.openGroups.has(king.kingdom) ? ' open' : '');

    const titleEl = document.createElement('div');
    titleEl.className = 'cat-group-title' + (state.activeKingdom === king.kingdom && !state.activeCategory ? ' active' : '');
    titleEl.innerHTML = `
      <span class="cat-dot ${king.kingdom}"></span>
      <span>${king.label}</span>
      <span class="cat-arrow">›</span>
    `;
    titleEl.onclick = () => {
      if (state.openGroups.has(king.kingdom)) {
        state.openGroups.delete(king.kingdom);
      } else {
        state.openGroups.add(king.kingdom);
      }
      state.activeKingdom = king.kingdom;
      state.activeCategory = null;
      render();
    };
    groupEl.appendChild(titleEl);

    king.groups.forEach((sub) => {
      const subBox = document.createElement('div');
      subBox.className = 'cat-sub';
      const subTitle = document.createElement('div');
      subTitle.className = 'cat-sub-title';
      subTitle.textContent = sub.title;
      subBox.appendChild(subTitle);

      sub.items.forEach((item) => {
        const a = document.createElement('a');
        a.className = 'cat-item' + (state.activeCategory === item.id ? ' active' : '');
        a.textContent = item.label;
        a.onclick = (e) => {
          e.preventDefault();
          state.activeCategory = state.activeCategory === item.id ? null : item.id;
          state.activeKingdom = king.kingdom;
          state.openGroups.add(king.kingdom);
          render();
        };
        subBox.appendChild(a);
      });
      groupEl.appendChild(subBox);
    });
    nav.appendChild(groupEl);
  });
}

// ============ FILTER ============
function filterMicrobes() {
  const q = state.search.trim().toLowerCase();
  return state.microbes.filter((m) => {
    if (state.activeKingdom && m.kingdom !== state.activeKingdom) return false;
    if (state.activeCategory && !(m.categories || []).includes(state.activeCategory)) return false;
    if (q) {
      const hay = `${m.name} ${m.thai} ${m.characteristics} ${m.pathogenesis}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderBreadcrumb() {
  const parts = ['ทั้งหมด'];
  if (state.activeKingdom) parts.push(kingdomLabel(state.activeKingdom));
  if (state.activeCategory) parts.push(categoryLabel(state.activeCategory));
  $('breadcrumb').innerHTML = parts
    .map((p, i) => (i === parts.length - 1 ? `<strong>${p}</strong>` : p))
    .join(' › ');
}

// ============ GRID ============
function renderGrid() {
  const grid = $('grid');
  const items = filterMicrobes();
  grid.innerHTML = '';
  $('emptyState').hidden = items.length > 0;
  $('searchCount').textContent = `${items.length} รายการ`;

  items.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'card';

    const tagsHtml = (m.categories || [])
      .slice(0, 3)
      .map((c) => `<span class="tag">${escapeHtml(categoryLabel(c))}</span>`)
      .join('');

    const imgHtml = m.image
      ? `<img src="${escapeHtml(m.image)}" alt="${escapeHtml(m.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';">
         <div class="fallback" style="display:none">${m.icon || '🦠'}</div>`
      : `<div class="fallback">${m.icon || '🦠'}</div>`;

    card.innerHTML = `
      <div class="card-img ${m.kingdom}">
        ${imgHtml}
        <div class="card-actions">
          <button class="card-action-btn edit" title="แก้ไข" data-action="edit">✏️</button>
          <button class="card-action-btn delete" title="ลบ" data-action="delete">🗑</button>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-name"><em>${escapeHtml(m.name)}</em></h3>
        <p class="card-thai">${escapeHtml(m.thai || '')}</p>
        <div class="card-tags">
          <span class="tag kingdom-${m.kingdom}">${kingdomLabel(m.kingdom)}</span>
          ${tagsHtml}
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'edit') openEdit(m.id);
        else if (action === 'delete') deleteMicrobe(m.id);
        return;
      }
      openView(m.id);
    });

    grid.appendChild(card);
  });
}

// ============ VIEW MODAL ============
function openView(id) {
  const m = state.microbes.find((x) => x.id === id);
  if (!m) return;

  const tagsHtml = (m.categories || [])
    .map((c) => `<span class="tag">${escapeHtml(categoryLabel(c))}</span>`)
    .join('');

  const imgHtml = m.image
    ? `<img src="${escapeHtml(m.image)}" alt="${escapeHtml(m.name)}" onerror="this.outerHTML='<span>${m.icon || '🦠'}</span>'">`
    : (m.icon || '🦠');

  const sections = [
    ['ลักษณะของเชื้อ', m.characteristics],
    ['การก่อโรค', m.pathogenesis],
    ['พาหะ / การติดต่อ', m.vector],
    ['ข้อมูลเพิ่มเติม', m.additional],
  ].filter(([_, v]) => v && v.trim())
   .map(([title, body]) => `
      <div class="detail-section">
        <h3>${title}</h3>
        <p>${escapeHtml(body)}</p>
      </div>
    `).join('');

  $('viewModalBody').innerHTML = `
    <div class="modal-img ${m.kingdom}">${imgHtml}</div>
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h2><em>${escapeHtml(m.name)}</em></h2>
          <p class="modal-thai">${escapeHtml(m.thai || '')}</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="viewEditBtn">✏️ แก้ไข</button>
        </div>
      </div>
      <div class="card-tags">
        <span class="tag kingdom-${m.kingdom}">${kingdomLabel(m.kingdom)}</span>
        ${tagsHtml}
      </div>
      ${sections}
    </div>
  `;
  $('viewEditBtn').onclick = () => {
    closeModal('viewModal');
    openEdit(id);
  };
  showModal('viewModal');
}

// ============ EDIT/ADD MODAL ============
function openEdit(id = null) {
  state.editingId = id;
  const m = id ? state.microbes.find((x) => x.id === id) : null;
  $('editTitle').textContent = m ? 'แก้ไขข้อมูลเชื้อ' : 'เพิ่มเชื้อใหม่';
  $('deleteBtn').hidden = !m;

  const form = $('editForm');
  form.reset();
  form.name.value = m?.name || '';
  form.thai.value = m?.thai || '';
  form.kingdom.value = m?.kingdom || 'bacteria';
  form.icon.value = m?.icon || '';
  form.characteristics.value = m?.characteristics || '';
  form.pathogenesis.value = m?.pathogenesis || '';
  form.vector.value = m?.vector || '';
  form.additional.value = m?.additional || '';
  $('imageUrl').value = m?.image || '';

  const preview = $('imgPreview');
  if (m?.image) {
    preview.src = m.image;
    preview.hidden = false;
  } else {
    preview.hidden = true;
    preview.src = '';
  }

  renderCategoryCheckboxes(m?.categories || [], form.kingdom.value);
  showModal('editModal');
  setTimeout(() => form.name.focus(), 100);
}

function renderCategoryCheckboxes(selected, kingdom) {
  const box = $('categoriesBox');
  box.innerHTML = '';
  const tree = CATEGORY_TREE.find((k) => k.kingdom === kingdom);
  if (!tree) { box.innerHTML = '<span style="color:var(--muted);font-size:13px">ไม่มีหมวดย่อย</span>'; return; }
  tree.groups.forEach((grp) => {
    grp.items.forEach((item) => {
      const lbl = document.createElement('label');
      const checked = selected.includes(item.id) ? 'checked' : '';
      lbl.innerHTML = `<input type="checkbox" value="${item.id}" ${checked}> ${item.label}`;
      box.appendChild(lbl);
    });
  });
}

function collectFormData() {
  const form = $('editForm');
  const cats = Array.from($('categoriesBox').querySelectorAll('input:checked')).map((i) => i.value);
  return {
    id: state.editingId || genId(),
    name: form.name.value.trim(),
    thai: form.thai.value.trim(),
    kingdom: form.kingdom.value,
    icon: form.icon.value.trim() || '🦠',
    image: $('imageUrl').value.trim(),
    categories: cats,
    characteristics: form.characteristics.value.trim(),
    pathogenesis: form.pathogenesis.value.trim(),
    vector: form.vector.value.trim(),
    additional: form.additional.value.trim(),
  };
}

function saveMicrobe(e) {
  e.preventDefault();
  const data = collectFormData();
  if (!data.name) { toast('กรุณากรอกชื่อ', 'error'); return; }

  const idx = state.microbes.findIndex((m) => m.id === data.id);
  if (idx >= 0) {
    state.microbes[idx] = data;
    toast('แก้ไขเรียบร้อย ✓', 'success');
  } else {
    state.microbes.push(data);
    toast('เพิ่มเชื้อใหม่เรียบร้อย ✓', 'success');
  }
  saveData();
  closeModal('editModal');
  render();
}

function deleteMicrobe(id) {
  const m = state.microbes.find((x) => x.id === id);
  if (!m) return;
  if (!confirm(`ลบ "${m.name}" ใช่ไหม?\n(การลบไม่สามารถย้อนกลับได้)`)) return;
  state.microbes = state.microbes.filter((x) => x.id !== id);
  saveData();
  closeModal('editModal');
  render();
  toast('ลบแล้ว', 'success');
}

// ============ MODAL HELPERS ============
function showModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = true;
  document.body.style.overflow = '';
  if (id === 'editModal') state.editingId = null;
}
window.closeModal = closeModal;

// ============ EXPORT ============
function exportData() {
  const blob = new Blob([JSON.stringify(state.microbes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `microrearch-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`ส่งออก ${state.microbes.length} รายการแล้ว`, 'success');
}

// ============ IMAGE UPLOAD ============
function handleImageUpload(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast('ไฟล์ใหญ่เกิน 2MB', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    $('imageUrl').value = dataUrl;
    const preview = $('imgPreview');
    preview.src = dataUrl;
    preview.hidden = false;
  };
  reader.readAsDataURL(file);
}

// ============ MAIN RENDER ============
function render() {
  renderSidebar();
  renderBreadcrumb();
  renderGrid();
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  await ensureDefaultAdmin();

  // ถ้ามี session อยู่แล้ว เข้าแอปเลย
  if (getSession()) {
    enterApp();
  }

  $('search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderGrid();
  });

  $('resetBtn').onclick = () => {
    state.search = '';
    state.activeCategory = null;
    state.activeKingdom = null;
    $('search').value = '';
    render();
  };

  $('addBtn').onclick = () => openEdit(null);
  $('exportBtn').onclick = exportData;
  $('editForm').addEventListener('submit', saveMicrobe);
  $('deleteBtn').onclick = () => state.editingId && deleteMicrobe(state.editingId);

  $('kingdomSelect').addEventListener('change', (e) => {
    const cats = Array.from($('categoriesBox').querySelectorAll('input:checked')).map((i) => i.value);
    renderCategoryCheckboxes(cats, e.target.value);
  });

  $('imgInput').addEventListener('change', (e) => handleImageUpload(e.target.files[0]));
  $('imageUrl').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const preview = $('imgPreview');
    if (v) { preview.src = v; preview.hidden = false; }
    else { preview.hidden = true; }
  });

  // close buttons (event delegation — handles dynamically added too)
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) {
      e.preventDefault();
      e.stopPropagation();
      closeModal(closer.dataset.close);
      return;
    }
    // backdrop click
    const modal = e.target.classList && e.target.classList.contains('modal') ? e.target : null;
    if (modal) closeModal(modal.id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('editModal').hidden) closeModal('editModal');
      else if (!$('viewModal').hidden) closeModal('viewModal');
    }
  });
});
