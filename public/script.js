// ============================================
// EDUGEN — Frontend Application Logic
// ============================================

(function () {
  'use strict';

  // --- State ---
  let currentUser = null;
  let currentClassroom = null;
  let socket = null;
  let selectedRole = null;

  // --- Utility Functions ---

  /**
   * Fetch wrapper with JSON defaults.
   * On 401, redirects to login page.
   */
  async function api(url, options = {}) {
    const defaults = {
      headers: { 'Content-Type': 'application/json' },
    };
    // Merge headers (don't override Content-Type if body is FormData)
    if (options.body && typeof options.body === 'string') {
      options.headers = { ...defaults.headers, ...options.headers };
    }
    const res = await fetch(url, { ...defaults, ...options });
    if (res.status === 401) {
      window.location.href = '/';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  /**
   * Show a toast notification.
   */
  function showToast(message, type = 'info') {
    // Remove any existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast' + (type !== 'info' ? ' toast-' + type : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Format an ISO timestamp to a readable time string.
   */
  function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return diffMins + 'm ago';
      if (diffHours < 24) return diffHours + 'h ago';
      if (diffDays < 7) return diffDays + 'd ago';

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    } catch (e) {
      return '';
    }
  }

  /**
   * Extract YouTube video ID from various URL formats.
   */
  function getYouTubeId(url) {
    if (!url) return null;
    // youtube.com/watch?v=ID
    let match = url.match(/[?&]v=([^&#]+)/);
    if (match) return match[1];
    // youtu.be/ID
    match = url.match(/youtu\.be\/([^?&#]+)/);
    if (match) return match[1];
    // youtube.com/embed/ID
    match = url.match(/youtube\.com\/embed\/([^?&#]+)/);
    if (match) return match[1];
    // youtube.com/v/ID
    match = url.match(/youtube\.com\/v\/([^?&#]+)/);
    if (match) return match[1];
    return null;
  }

  /**
   * Escape HTML to prevent XSS.
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Page Detection ---
  const page = document.body.dataset.page;

  // --- LOGIN PAGE LOGIC ---
  if (page === undefined || page === 'login') {
    initLoginPage();
  }

  function initLoginPage() {
    const stepRole = document.getElementById('step-role');
    const stepLogin = document.getElementById('step-login');
    const roleBtns = document.querySelectorAll('.role-btn');
    const selectedRoleText = document.getElementById('selected-role-text');
    const devLoginBtn = document.getElementById('dev-login-btn');
    const backBtn = document.getElementById('back-btn');
    const googleBtn = document.getElementById('google-btn');

    // Check if Google OAuth is configured
    fetch('/api/oauth-status')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.configured) {
          var warning = document.getElementById('google-not-configured');
          if (warning) warning.style.display = 'block';
          if (googleBtn) {
            googleBtn.classList.add('disabled');
            googleBtn.addEventListener('click', function (e) { e.preventDefault(); });
          }
        }
      })
      .catch(function () {
        // Silently ignore — oauth-status endpoint may not exist in dev
      });

    // Role selection
    if (roleBtns) {
      roleBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectedRole = btn.dataset.role;
          if (selectedRoleText) {
            selectedRoleText.textContent =
              selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
          }

          if (googleBtn) {
            googleBtn.href = '/auth/google?role=' + selectedRole;
          }

          // Store role on server
          fetch('/auth/set-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: selectedRole }),
          }).catch(function () {});

          // Transition steps
          if (stepRole) stepRole.classList.remove('active');
          if (stepLogin) stepLogin.classList.add('active');
        });
      });
    }

    // Dev login
    if (devLoginBtn) {
      devLoginBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = '/dev-login?role=' + (selectedRole || 'student');
      });
    }

    // Back button
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (stepLogin) stepLogin.classList.remove('active');
        if (stepRole) stepRole.classList.add('active');
      });
    }
  }

  // --- AUTHENTICATED PAGES ---
  if (
    page === 'dashboard' ||
    page === 'tutorials' ||
    page === 'discussions' ||
    page === 'tasks'
  ) {
    initApp();
  }

  async function initApp() {
    // Fetch current user
    try {
      currentUser = await api('/api/me');
    } catch (e) {
      window.location.href = '/';
      return;
    }

    // Update header UI
    updateHeaderUI();

    // Load classrooms
    await loadClassrooms();

    // Load streak
    loadStreak();

    // Apply saved preferences
    applyPreferences();

    // Init Socket.io
    initSocket();

    // Setup header event listeners (modals, dropdowns, etc.)
    setupHeaderEvents();

    // Page-specific init
    if (page === 'dashboard') initDashboard();
    if (page === 'tutorials') initTutorials();
    if (page === 'discussions') initDiscussions();
    if (page === 'tasks') initTasks();
  }

  // --- HEADER UI ---
  function updateHeaderUI() {
    // Set user name, avatar, role badge
    var nameEl = document.getElementById('user-name');
    var avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = currentUser.name;
    if (avatarEl) {
      avatarEl.src = currentUser.avatar || '../public/default-avatar.svg';
      avatarEl.alt = currentUser.name;
    }
    // Settings modal info
    var sName = document.getElementById('settings-name');
    var sEmail = document.getElementById('settings-email');
    var sRole = document.getElementById('settings-role');
    if (sName) sName.textContent = currentUser.name;
    if (sEmail) sEmail.textContent = currentUser.email;
    if (sRole) sRole.textContent = currentUser.role;
  }

  // --- CLASSROOMS ---
  async function loadClassrooms() {
    try {
      var classrooms = await api('/api/classrooms');
      var listEl = document.getElementById('classroom-list');
      if (!listEl) return;
      listEl.innerHTML = '';
      if (classrooms.length === 0) {
        listEl.innerHTML =
          '<div class="dropdown-item" style="color: var(--text-muted)">No classrooms yet</div>';
      } else {
        classrooms.forEach(function (c) {
          var item = document.createElement('button');
          item.className = 'dropdown-item';
          item.textContent = c.name;
          item.addEventListener('click', function () {
            switchClassroom(c);
          });
          listEl.appendChild(item);
        });
      }
    } catch (e) {
      // Ignore errors loading classrooms
    }
  }

  function switchClassroom(classroom) {
    currentClassroom = classroom;
    // Store in sessionStorage for sub-pages
    sessionStorage.setItem('currentClassroom', JSON.stringify(classroom));

    if (page === 'dashboard') {
      var noState = document.getElementById('no-classroom-state');
      var content = document.getElementById('classroom-content');
      var nameEl = document.getElementById('classroom-name');
      var idBadge = document.getElementById('classroom-id-badge');

      if (noState) noState.style.display = 'none';
      if (content) content.style.display = 'block';
      if (nameEl) nameEl.textContent = classroom.name;
      if (idBadge) idBadge.textContent = 'ID: ' + classroom.id;

      // Load banner
      loadBanner();
      // Load chat
      loadChat();
      // Join socket room
      if (socket) socket.emit('join-classroom', classroom.id);
      // Show/hide teacher controls
      var bannerBtn = document.getElementById('banner-upload-btn');
      if (bannerBtn) {
        bannerBtn.style.display =
          currentUser.role === 'teacher' ? 'block' : 'none';
      }
    }

    // Close dropdown
    var ddMenu = document.getElementById('classroom-dropdown-menu');
    if (ddMenu) ddMenu.classList.remove('show');
  }

  // --- SOCKET.IO ---
  function initSocket() {
    if (typeof io === 'undefined') return;
    socket = io();

    socket.on('chat-message', function (msg) {
      if (page === 'dashboard') appendChatMessage(msg);
    });

    socket.on('teacher-message', function (msg) {
      // Handle incoming DM — check sidebar thread panel
      var thread = document.getElementById('dm-thread-panel');
      if (
        thread &&
        thread.style.display !== 'none' &&
        dmCurrentContact &&
        (msg.sender_id === (dmCurrentContact.user_id || dmCurrentContact.id))
      ) {
        appendDMMessage(msg);
      } else {
        showToast('New message from ' + (msg.sender_name || 'someone'));
      }
    });

    // If we have a current classroom, join it
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) {
      currentClassroom = JSON.parse(stored);
      if (page === 'dashboard') switchClassroom(currentClassroom);
    }
  }

  // --- DASHBOARD ---
  function initDashboard() {
    // Welcome banner — show user's first name
    var welcomeName = document.getElementById('welcome-name');
    if (welcomeName && currentUser) {
      welcomeName.textContent = (currentUser.name || 'there').split(' ')[0];
    }

    // Set chat user avatar
    var chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar && currentUser) {
      chatAvatar.src = currentUser.avatar || '../public/default-avatar.svg';
    }

    // Load stats
    loadDashboardStats();

    // Chat send
    var chatInput = document.getElementById('chat-input');
    var chatSendBtn = document.getElementById('chat-send-btn');
    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', sendChatMessage);
    }
    if (chatInput) {
      chatInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendChatMessage();
      });
    }

    // Banner upload
    var bannerUploadBtn = document.getElementById('banner-upload-btn');
    var bannerFileInput = document.getElementById('banner-file-input');
    if (bannerUploadBtn) {
      bannerUploadBtn.addEventListener('click', function () {
        if (bannerFileInput) bannerFileInput.click();
      });
    }
    if (bannerFileInput) {
      bannerFileInput.addEventListener('change', uploadBanner);
    }

    // Sidebar DM panel
    setupSidebarDM();

    // AI assistant
    setupAIAssistant();

    // Restore classroom from session
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored && !currentClassroom) {
      switchClassroom(JSON.parse(stored));
    }
  }

  async function loadDashboardStats() {
    try {
      var classrooms = await api('/api/classrooms');
      var statCourses = document.getElementById('stat-courses');
      if (statCourses) statCourses.textContent = classrooms.length;
    } catch (e) {}

    // Placeholder stats (extend later with real API calls)
    var statDue = document.getElementById('stat-due');
    var statCompleted = document.getElementById('stat-completed');
    var statGrade = document.getElementById('stat-grade');
    var statGradeBadge = document.getElementById('stat-grade-badge');
    if (statDue) statDue.textContent = '—';
    if (statCompleted) statCompleted.textContent = '—';
    if (statGrade) statGrade.textContent = '—';
    if (statGradeBadge) statGradeBadge.textContent = '';
  }

  // --- SIDEBAR DM PANEL ---
  function setupSidebarDM() {
    var backBtn = document.getElementById('dm-back-btn');
    var sendBtn = document.getElementById('dm-send-btn');
    var dmInput = document.getElementById('dm-input');
    var newBtn = document.getElementById('dm-new-btn');
    var newInput = document.getElementById('dm-user-id-input');

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        var thread = document.getElementById('dm-thread-panel');
        var contacts = document.getElementById('dm-contacts-panel');
        if (thread) thread.style.display = 'none';
        if (contacts) contacts.style.display = 'flex';
        dmCurrentContact = null;
      });
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', sendSidebarDM);
    }
    if (dmInput) {
      dmInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendSidebarDM();
      });
    }
    if (newBtn && newInput) {
      newBtn.addEventListener('click', function () {
        var id = parseInt(newInput.value.trim());
        if (!id) return showToast('Enter a valid user ID', 'error');
        openSidebarDMThread({ id: id, name: 'User #' + id });
        newInput.value = '';
      });
    }

    // Load contacts into sidebar
    loadSidebarContacts();
  }

  async function loadSidebarContacts() {
    var list = document.getElementById('dm-contacts-list');
    if (!list) return;
    list.innerHTML = '<div class="dm-empty">Loading…</div>';
    try {
      var contacts = [];
      if (currentUser && currentUser.role === 'teacher') {
        contacts = await api('/api/teacher-messages');
      } else if (currentClassroom) {
        var members = await api('/api/classroom-members/' + currentClassroom.id);
        contacts = members.filter(function (m) { return m.role === 'teacher'; });
      }
      list.innerHTML = '';
      if (contacts.length === 0) {
        list.innerHTML = '<div class="dm-empty">No conversations yet.<br>Start one below!</div>';
        return;
      }
      contacts.forEach(function (c) {
        var item = document.createElement('div');
        item.className = 'dm-contact-item';
        item.innerHTML =
          '<img class="dm-contact-avatar" src="' + escapeHtml(c.avatar || '../public/default-avatar.svg') + '" alt="">' +
          '<div><div class="dm-contact-name">' + escapeHtml(c.name) + '</div>' +
          (c.last_message ? '<div class="dm-contact-preview">' + escapeHtml(c.last_message) + '</div>' : '') +
          '</div>';
        item.addEventListener('click', function () { openSidebarDMThread(c); });
        list.appendChild(item);
      });
    } catch (e) {
      list.innerHTML = '<div class="dm-empty">Could not load contacts.</div>';
    }
  }

  function openSidebarDMThread(contact) {
    dmCurrentContact = contact;
    var contacts = document.getElementById('dm-contacts-panel');
    var thread = document.getElementById('dm-thread-panel');
    var threadName = document.getElementById('dm-thread-name');
    if (contacts) contacts.style.display = 'none';
    if (thread) thread.style.display = 'flex';
    if (threadName) threadName.textContent = contact.name;

    var userId = contact.user_id || contact.id;
    api('/api/teacher-messages/' + userId).then(function (messages) {
      var container = document.getElementById('dm-messages');
      if (!container) return;
      container.innerHTML = '';
      messages.forEach(function (m) { appendDMMessage(m); });
      container.scrollTop = container.scrollHeight;
    }).catch(function () {});
  }

  async function sendSidebarDM() {
    var input = document.getElementById('dm-input');
    if (!input || !dmCurrentContact) return;
    var text = input.value.trim();
    if (!text) return;
    var userId = dmCurrentContact.user_id || dmCurrentContact.id;
    try {
      var msg = await api('/api/teacher-messages/' + userId, {
        method: 'POST',
        body: JSON.stringify({ text: text }),
      });
      appendDMMessage(msg);
      input.value = '';
      if (socket) socket.emit('teacher-message', { toUserId: userId, text: text });
    } catch (e) {
      showToast('Failed to send message', 'error');
    }
  }

  // --- AI ASSISTANT ---
  function setupAIAssistant() {
    var sendBtn = document.getElementById('ai-send-btn');
    var input = document.getElementById('ai-input');
    if (sendBtn) sendBtn.addEventListener('click', sendAIMessage);
    if (input) input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') sendAIMessage();
    });
  }

  function sendAIMessage() {
    var input = document.getElementById('ai-input');
    var msgs = document.getElementById('ai-messages');
    if (!input || !msgs) return;
    var text = input.value.trim();
    if (!text) return;
    // Show user message
    var userMsg = document.createElement('div');
    userMsg.className = 'ai-msg user';
    userMsg.textContent = text;
    msgs.appendChild(userMsg);
    msgs.scrollTop = msgs.scrollHeight;
    input.value = '';
    // Simulated AI response
    setTimeout(function () {
      var aiMsg = document.createElement('div');
      aiMsg.className = 'ai-msg ai';
      aiMsg.textContent = 'Great question! This feature will connect to an AI tutor soon. For now, check your course materials or ask your teacher.';
      msgs.appendChild(aiMsg);
      msgs.scrollTop = msgs.scrollHeight;
    }, 800);
  }

  async function loadChat() {
    if (!currentClassroom) return;
    try {
      var messages = await api(
        '/api/classrooms/' + currentClassroom.id + '/messages'
      );
      var container = document.getElementById('chat-messages');
      if (!container) return;
      container.innerHTML = '';
      messages.forEach(function (msg) {
        appendChatMessage(msg);
      });
      container.scrollTop = container.scrollHeight;
    } catch (e) {
      // Ignore chat load errors
    }
  }

  function appendChatMessage(msg) {
    var container = document.getElementById('chat-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML =
      '<img class="msg-avatar" src="' +
      escapeHtml(msg.avatar || '../public/default-avatar.svg') +
      '" alt="">' +
      '<div class="msg-content">' +
      '<span class="msg-name">' +
      escapeHtml(msg.name || 'Unknown') +
      '</span>' +
      '<span class="msg-text">' +
      escapeHtml(msg.text) +
      '</span>' +
      '<span class="msg-time">' +
      formatTime(msg.timestamp) +
      '</span>' +
      '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function sendChatMessage() {
    var input = document.getElementById('chat-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text || !currentClassroom) return;
    if (socket) {
      socket.emit('chat-message', {
        classroomId: currentClassroom.id,
        text: text,
      });
    }
    input.value = '';
  }

  async function loadBanner() {
    if (!currentClassroom) return;
    try {
      var classroom = await api(
        '/api/classrooms/' + currentClassroom.id
      );
      var img = document.getElementById('banner-image');
      var placeholder = document.getElementById('banner-placeholder');
      if (classroom.banner_url) {
        if (img) {
          img.src = classroom.banner_url;
          img.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
      } else {
        if (img) img.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
      }
    } catch (e) {
      // Ignore banner load errors
    }
  }

  async function uploadBanner() {
    var fileInput = document.getElementById('banner-file-input');
    if (!fileInput || !fileInput.files[0] || !currentClassroom) return;
    var formData = new FormData();
    formData.append('banner', fileInput.files[0]);
    try {
      var res = await fetch(
        '/api/classrooms/' + currentClassroom.id + '/banner',
        { method: 'POST', body: formData }
      );
      var data = await res.json();
      if (data.banner_url) {
        var img = document.getElementById('banner-image');
        var placeholder = document.getElementById('banner-placeholder');
        if (img) {
          img.src = data.banner_url;
          img.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        showToast('Banner updated!', 'success');
      }
    } catch (e) {
      showToast('Failed to upload banner', 'error');
    }
  }

  // --- DM SYSTEM ---
  var dmCurrentContact = null;

  function setupDM() {
    var dmBtn = document.getElementById('dm-btn');
    var dmPopup = document.getElementById('dm-popup');
    var dmCloseBtn = document.getElementById('dm-close-btn');
    var dmBackBtn = document.getElementById('dm-back-btn');
    var dmSendBtn = document.getElementById('dm-send-btn');
    var dmInput = document.getElementById('dm-input');

    if (dmBtn) {
      dmBtn.addEventListener('click', function () {
        if (!dmPopup) return;
        if (dmPopup.style.display === 'none' || dmPopup.style.display === '') {
          dmPopup.style.display = 'flex';
          loadDMContacts();
        } else {
          dmPopup.style.display = 'none';
        }
      });
    }
    if (dmCloseBtn) {
      dmCloseBtn.addEventListener('click', function () {
        if (dmPopup) dmPopup.style.display = 'none';
      });
    }
    if (dmBackBtn) {
      dmBackBtn.addEventListener('click', function () {
        var dmChat = document.getElementById('dm-chat');
        var dmContacts = document.getElementById('dm-contacts');
        if (dmChat) dmChat.style.display = 'none';
        if (dmContacts) dmContacts.style.display = 'block';
      });
    }
    if (dmSendBtn) {
      dmSendBtn.addEventListener('click', sendDM);
    }
    if (dmInput) {
      dmInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendDM();
      });
    }
  }

  async function loadDMContacts() {
    var contacts = document.getElementById('dm-contacts');
    if (!contacts) return;
    contacts.innerHTML =
      '<div style="padding:16px;color:var(--text-muted)">Loading...</div>';

    try {
      if (currentUser.role === 'teacher') {
        // Teachers see list of students who messaged them
        var convos = await api('/api/teacher-messages');
        contacts.innerHTML = '';
        if (convos.length === 0) {
          contacts.innerHTML =
            '<div style="padding:16px;color:var(--text-muted)">No messages yet</div>';
        } else {
          convos.forEach(function (c) {
            var item = document.createElement('div');
            item.className = 'dm-contact-item';
            item.innerHTML =
              '<img class="msg-avatar" src="' +
              escapeHtml(c.avatar || '../public/default-avatar.svg') +
              '" alt="">' +
              '<div><strong>' +
              escapeHtml(c.name) +
              '</strong><p style="font-size:0.8rem;color:var(--text-muted)">' +
              escapeHtml(c.last_message || '') +
              '</p></div>';
            item.addEventListener('click', function () {
              openDMChat(c);
            });
            contacts.appendChild(item);
          });
        }
      } else {
        // Students see list of teachers in their classrooms
        if (currentClassroom) {
          var members = await api(
            '/api/classroom-members/' + currentClassroom.id
          );
          contacts.innerHTML = '';
          var teachers = members.filter(function (m) {
            return m.role === 'teacher';
          });
          if (teachers.length === 0) {
            contacts.innerHTML =
              '<div style="padding:16px;color:var(--text-muted)">No teachers in this classroom</div>';
          } else {
            teachers.forEach(function (t) {
              var item = document.createElement('div');
              item.className = 'dm-contact-item';
              item.innerHTML =
                '<img class="msg-avatar" src="' +
                escapeHtml(t.avatar || '../public/default-avatar.svg') +
                '" alt="">' +
                '<div><strong>' +
                escapeHtml(t.name) +
                '</strong></div>';
              item.addEventListener('click', function () {
                openDMChat(t);
              });
              contacts.appendChild(item);
            });
          }
        } else {
          contacts.innerHTML =
            '<div style="padding:16px;color:var(--text-muted)">Select a classroom first</div>';
        }
      }
    } catch (e) {
      contacts.innerHTML =
        '<div style="padding:16px;color:var(--text-muted)">Failed to load contacts</div>';
    }
  }

  async function openDMChat(contact) {
    dmCurrentContact = contact;
    var dmContactsEl = document.getElementById('dm-contacts');
    var dmChat = document.getElementById('dm-chat');
    var dmChatName = document.getElementById('dm-chat-name');
    if (dmContactsEl) dmContactsEl.style.display = 'none';
    if (dmChat) dmChat.style.display = 'flex';
    if (dmChatName) dmChatName.textContent = contact.name;

    var userId = contact.user_id || contact.id;
    try {
      var messages = await api('/api/teacher-messages/' + userId);
      var container = document.getElementById('dm-messages');
      if (!container) return;
      container.innerHTML = '';
      messages.forEach(function (m) {
        appendDMMessage(m);
      });
      container.scrollTop = container.scrollHeight;
    } catch (e) {
      // Ignore DM load errors
    }
  }

  function appendDMMessage(msg) {
    var container = document.getElementById('dm-messages');
    if (!container) return;
    var div = document.createElement('div');
    var isMine = msg.sender_id === currentUser.id;
    div.className = 'dm-message ' + (isMine ? 'dm-mine' : 'dm-theirs');
    div.innerHTML =
      '<div class="dm-bubble">' +
      escapeHtml(msg.text) +
      '</div>' +
      '<div class="msg-time">' +
      formatTime(msg.timestamp) +
      '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function sendDM() {
    var input = document.getElementById('dm-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text || !dmCurrentContact) return;
    var userId = dmCurrentContact.user_id || dmCurrentContact.id;
    try {
      var msg = await api('/api/teacher-messages/' + userId, {
        method: 'POST',
        body: JSON.stringify({ text: text }),
      });
      appendDMMessage(msg);
      input.value = '';
      // Also emit via socket
      if (socket) {
        socket.emit('teacher-message', { toUserId: userId, text: text });
      }
    } catch (e) {
      showToast('Failed to send message', 'error');
    }
  }

  // --- TUTORIALS ---
  async function initTutorials() {
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) currentClassroom = JSON.parse(stored);
    if (!currentClassroom) {
      var pageContainer = document.querySelector('.page-container');
      if (pageContainer) {
        pageContainer.innerHTML +=
          '<div class="empty-state"><div class="empty-state-icon">📚</div><p>Please select a classroom first from the dashboard.</p></div>';
      }
      return;
    }
    await loadTutorials();
    setupTutorialForm();
  }

  async function loadTutorials() {
    try {
      var tutorials = await api(
        '/api/classrooms/' + currentClassroom.id + '/tutorials'
      );
      var grid = document.getElementById('tutorials-grid');
      if (!grid) return;
      grid.innerHTML = '';
      if (tutorials.length === 0) {
        grid.innerHTML =
          '<div class="empty-state"><div class="empty-state-icon">🎬</div><p>No tutorials yet.</p></div>';
        return;
      }
      tutorials.forEach(function (t) {
        var videoId = getYouTubeId(t.youtube_url);
        var thumb = videoId
          ? 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg'
          : '';
        var card = document.createElement('div');
        card.className = 'tutorial-card';

        var imgHtml = thumb
          ? '<img src="' +
            escapeHtml(thumb) +
            '" alt="' +
            escapeHtml(t.title) +
            '">'
          : '';

        var actionHtml = '';
        if (currentUser.role === 'student') {
          actionHtml =
            '<button class="btn-secondary watch-toggle" data-id="' +
            t.id +
            '" data-watched="' +
            (t.watched ? '1' : '0') +
            '">' +
            (t.watched ? '✓ Watched' : 'Mark Watched') +
            '</button>';
        } else {
          actionHtml =
            '<button class="btn-danger delete-tutorial" data-id="' +
            t.id +
            '">Delete</button>';
        }

        card.innerHTML =
          imgHtml +
          '<div class="tutorial-card-body">' +
          '<h3>' +
          escapeHtml(t.title) +
          '</h3>' +
          '<div class="tutorial-actions">' +
          '<a href="' +
          escapeHtml(t.youtube_url) +
          '" target="_blank" class="btn-primary">▶ Watch</a>' +
          actionHtml +
          '</div>' +
          '</div>';
        grid.appendChild(card);
      });

      // Event listeners — Watch toggle
      grid.querySelectorAll('.watch-toggle').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await api('/api/tutorials/' + btn.dataset.id + '/watch', {
              method: 'POST',
            });
            btn.textContent = '✓ Watched';
            btn.dataset.watched = '1';
            showToast('Marked as watched!', 'success');
          } catch (e) {
            showToast('Failed to mark as watched', 'error');
          }
        });
      });

      // Event listeners — Delete tutorial
      grid.querySelectorAll('.delete-tutorial').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await api('/api/tutorials/' + btn.dataset.id, {
              method: 'DELETE',
            });
            loadTutorials();
            showToast('Tutorial removed', 'success');
          } catch (e) {
            showToast('Failed to delete tutorial', 'error');
          }
        });
      });
    } catch (e) {
      // Ignore tutorial load errors
    }
  }

  function setupTutorialForm() {
    var form = document.getElementById('add-tutorial-form');
    if (!form || currentUser.role !== 'teacher') {
      if (form) form.style.display = 'none';
      return;
    }
    form.style.display = 'block';
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var urlInput = document.getElementById('tutorial-url');
      var titleInput = document.getElementById('tutorial-title');
      if (!urlInput || !titleInput) return;
      var url = urlInput.value.trim();
      var title = titleInput.value.trim();
      if (!url || !title) {
        showToast('Please fill in both fields', 'error');
        return;
      }
      try {
        await api(
          '/api/classrooms/' + currentClassroom.id + '/tutorials',
          {
            method: 'POST',
            body: JSON.stringify({ youtube_url: url, title: title }),
          }
        );
        urlInput.value = '';
        titleInput.value = '';
        loadTutorials();
        showToast('Tutorial added!', 'success');
      } catch (e) {
        showToast('Failed to add tutorial', 'error');
      }
    });
  }

  // --- DISCUSSIONS ---
  async function initDiscussions() {
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) currentClassroom = JSON.parse(stored);
    if (!currentClassroom) {
      var pageContainer = document.querySelector('.page-container');
      if (pageContainer) {
        pageContainer.innerHTML +=
          '<div class="empty-state"><div class="empty-state-icon">💬</div><p>Please select a classroom first.</p></div>';
      }
      return;
    }
    await loadPadletNotes();
    setupPadletForm();
  }

  async function loadPadletNotes() {
    try {
      var notes = await api(
        '/api/classrooms/' + currentClassroom.id + '/padlet'
      );
      var grid = document.getElementById('padlet-grid');
      if (!grid) return;
      grid.innerHTML = '';
      if (notes.length === 0) {
        grid.innerHTML =
          '<div class="empty-state"><div class="empty-state-icon">📝</div><p>No notes yet. Be the first to add one!</p></div>';
        return;
      }
      notes.forEach(function (note, i) {
        var card = document.createElement('div');
        card.className = 'padlet-card';

        var imgHtml = note.image_url
          ? '<img src="' + escapeHtml(note.image_url) + '" alt="">'
          : '';
        var linkHtml = note.link_url
          ? '<a href="' +
            escapeHtml(note.link_url) +
            '" target="_blank" class="padlet-link">🔗 ' +
            escapeHtml(note.link_url) +
            '</a>'
          : '';
        var deleteHtml =
          note.user_id === currentUser.id || currentUser.role === 'teacher'
            ? '<button class="btn-danger delete-note" data-id="' +
              note.id +
              '" style="margin-top:8px;padding:4px 10px;font-size:0.75rem">Delete</button>'
            : '';

        card.innerHTML =
          '<h3>' +
          escapeHtml(note.title) +
          '</h3>' +
          '<p>' +
          escapeHtml(note.text) +
          '</p>' +
          imgHtml +
          linkHtml +
          '<div class="card-meta">' +
          escapeHtml(note.name || 'Unknown') +
          ' · ' +
          formatTime(note.created_at) +
          '</div>' +
          deleteHtml;

        grid.appendChild(card);
      });

      grid.querySelectorAll('.delete-note').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await api('/api/padlet/' + btn.dataset.id, {
              method: 'DELETE',
            });
            loadPadletNotes();
            showToast('Note deleted', 'success');
          } catch (e) {
            showToast('Failed to delete note', 'error');
          }
        });
      });
    } catch (e) {
      // Ignore padlet load errors
    }
  }

  function setupPadletForm() {
    var form = document.getElementById('add-note-form');
    var toggleBtn = document.getElementById('add-note-btn');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        if (!form) return;
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var titleEl = document.getElementById('note-title');
        var textEl = document.getElementById('note-text');
        var imageEl = document.getElementById('note-image-url');
        var linkEl = document.getElementById('note-link-url');

        var data = {
          title: titleEl ? titleEl.value.trim() : '',
          text: textEl ? textEl.value.trim() : '',
          image_url: imageEl ? imageEl.value.trim() : '',
          link_url: linkEl ? linkEl.value.trim() : '',
        };

        if (!data.title || !data.text) {
          showToast('Title and text are required', 'error');
          return;
        }

        try {
          await api(
            '/api/classrooms/' + currentClassroom.id + '/padlet',
            {
              method: 'POST',
              body: JSON.stringify(data),
            }
          );
          form.reset();
          form.style.display = 'none';
          loadPadletNotes();
          showToast('Note added!', 'success');
        } catch (e) {
          showToast('Failed to add note', 'error');
        }
      });
    }
  }

  // --- TASKS ---
  async function initTasks() {
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) currentClassroom = JSON.parse(stored);
    if (!currentClassroom) {
      var pageContainer = document.querySelector('.page-container');
      if (pageContainer) {
        pageContainer.innerHTML +=
          '<div class="empty-state"><div class="empty-state-icon">📋</div><p>Please select a classroom first.</p></div>';
      }
      return;
    }
    await loadTasks();
    setupTaskForm();
  }

  async function loadTasks() {
    try {
      var tasks = await api(
        '/api/classrooms/' + currentClassroom.id + '/tasks'
      );
      var list = document.getElementById('tasks-list');
      if (!list) return;
      list.innerHTML = '';
      if (tasks.length === 0) {
        list.innerHTML =
          '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No tasks yet.</p></div>';
        return;
      }
      tasks.forEach(function (task) {
        var card = document.createElement('div');
        card.className = 'task-card';
        var status = task.submission_status || 'pending';

        var fileHtml = task.file_url
          ? '<a href="' +
            escapeHtml(task.file_url) +
            '" target="_blank">📎 Attachment</a>'
          : '';

        card.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:start">' +
          '<h3>' +
          escapeHtml(task.title) +
          '</h3>' +
          '<span class="task-status ' +
          status +
          '">' +
          status.toUpperCase() +
          '</span>' +
          '</div>' +
          '<p>' +
          escapeHtml(task.description || '') +
          '</p>' +
          '<div class="task-meta">' +
          '<span>📅 Due: ' +
          escapeHtml(task.due_date || 'No due date') +
          '</span>' +
          fileHtml +
          '</div>' +
          '<div class="task-actions" id="task-actions-' +
          task.id +
          '"></div>';

        list.appendChild(card);

        var actions = document.getElementById('task-actions-' + task.id);
        if (!actions) return;

        if (currentUser.role === 'student') {
          if (status === 'pending') {
            actions.innerHTML =
              '<button class="btn-primary submit-task-btn" data-id="' +
              task.id +
              '">Submit Work</button>';
          } else {
            var submissionHtml = '';
            if (task.submission_text) {
              submissionHtml =
                '<p style="color:var(--text-muted);font-size:0.85rem">Your submission: ' +
                escapeHtml(task.submission_text) +
                '</p>';
            }
            if (task.grade) {
              submissionHtml +=
                '<p style="color:#69db7c">Grade: ' +
                escapeHtml(task.grade) +
                '</p>';
            }
            actions.innerHTML = submissionHtml;
          }
        } else {
          // Teacher: view submissions
          actions.innerHTML =
            '<button class="btn-secondary view-subs-btn" data-id="' +
            task.id +
            '">View Submissions</button>';
        }
      });

      // Submit task buttons
      list.querySelectorAll('.submit-task-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          showSubmitForm(btn.dataset.id);
        });
      });

      // View submissions buttons
      list.querySelectorAll('.view-subs-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          viewSubmissions(btn.dataset.id);
        });
      });
    } catch (e) {
      // Ignore task load errors
    }
  }

  function showSubmitForm(taskId) {
    var modal = document.getElementById('submit-task-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    var taskIdInput = document.getElementById('submit-task-id');
    var submissionText = document.getElementById('submission-text');
    if (taskIdInput) taskIdInput.value = taskId;
    if (submissionText) submissionText.value = '';
  }

  async function viewSubmissions(taskId) {
    try {
      var subs = await api('/api/tasks/' + taskId + '/submissions');
      var modal = document.getElementById('submissions-modal');
      var list = document.getElementById('submissions-list');
      if (!modal || !list) return;
      modal.style.display = 'flex';
      list.innerHTML = '';

      if (subs.length === 0) {
        list.innerHTML =
          '<p style="color:var(--text-muted)">No submissions yet.</p>';
        return;
      }

      subs.forEach(function (s) {
        var div = document.createElement('div');
        div.className = 'submission-item';

        var fileHtml = s.file_url
          ? '<a href="' +
            escapeHtml(s.file_url) +
            '" target="_blank">📎 File</a>'
          : '';

        div.innerHTML =
          '<strong>' +
          escapeHtml(s.name || 'Student') +
          '</strong>' +
          '<p>' +
          escapeHtml(s.submission_text || 'No text') +
          '</p>' +
          fileHtml +
          '<p style="font-size:0.8rem;color:var(--text-muted)">Submitted: ' +
          formatTime(s.submitted_at) +
          '</p>' +
          '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<input type="text" class="form-input grade-input" placeholder="Grade..." value="' +
          escapeHtml(s.grade || '') +
          '" data-id="' +
          s.id +
          '" style="margin:0;flex:1">' +
          '<button class="btn-primary grade-btn" data-id="' +
          s.id +
          '" style="padding:8px 16px">Grade</button>' +
          '</div>';

        list.appendChild(div);
      });

      list.querySelectorAll('.grade-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var input = list.querySelector(
            '.grade-input[data-id="' + btn.dataset.id + '"]'
          );
          if (!input) return;
          try {
            await api('/api/submissions/' + btn.dataset.id + '/grade', {
              method: 'PUT',
              body: JSON.stringify({
                grade: input.value,
                status: 'graded',
              }),
            });
            showToast('Graded!', 'success');
          } catch (e) {
            showToast('Failed to grade', 'error');
          }
        });
      });
    } catch (e) {
      showToast('Failed to load submissions', 'error');
    }
  }

  function setupTaskForm() {
    var form = document.getElementById('create-task-form');
    var toggleBtn = document.getElementById('create-task-btn');

    if (currentUser.role !== 'teacher') {
      if (toggleBtn) toggleBtn.style.display = 'none';
      return;
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var modal = document.getElementById('create-task-modal');
        if (modal) modal.style.display = 'flex';
      });
    }

    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var formData = new FormData(form);
        try {
          var res = await fetch(
            '/api/classrooms/' + currentClassroom.id + '/tasks',
            { method: 'POST', body: formData }
          );
          if (res.ok) {
            form.reset();
            var modal = document.getElementById('create-task-modal');
            if (modal) modal.style.display = 'none';
            loadTasks();
            showToast('Task created!', 'success');
          } else {
            showToast('Failed to create task', 'error');
          }
        } catch (e) {
          showToast('Failed to create task', 'error');
        }
      });
    }

    // Submit task modal form
    var submitForm = document.getElementById('submit-task-form');
    if (submitForm) {
      submitForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var formData = new FormData(submitForm);
        var taskIdInput = document.getElementById('submit-task-id');
        if (!taskIdInput) return;
        var taskId = taskIdInput.value;
        try {
          var res = await fetch('/api/tasks/' + taskId + '/submit', {
            method: 'POST',
            body: formData,
          });
          if (res.ok) {
            var modal = document.getElementById('submit-task-modal');
            if (modal) modal.style.display = 'none';
            loadTasks();
            showToast('Work submitted!', 'success');
          } else {
            showToast('Failed to submit work', 'error');
          }
        } catch (e) {
          showToast('Failed to submit work', 'error');
        }
      });
    }
  }

  // --- HEADER EVENTS ---
  function setupHeaderEvents() {
    // Classroom dropdown
    var dropdownBtn = document.getElementById('classroom-dropdown-btn');
    var dropdownMenu = document.getElementById('classroom-dropdown-menu');
    if (dropdownBtn) {
      dropdownBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (dropdownMenu) dropdownMenu.classList.toggle('show');
      });
    }
    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      if (dropdownMenu && !e.target.closest('.classroom-dropdown')) {
        dropdownMenu.classList.remove('show');
      }
    });

    // Modal openers
    setupModal('settings-btn', 'settings-modal');
    setupModal('subscription-btn', 'subscription-modal');
    setupModal('personalize-btn', 'personalize-modal');
    setupModal('create-classroom-btn', 'create-classroom-modal');
    setupModal('join-classroom-btn', 'join-classroom-modal');

    // Close any modal that has close buttons or overlay clicks
    document.querySelectorAll('.modal-overlay').forEach(function (modal) {
      modal.querySelectorAll('.modal-close').forEach(function (closeBtn) {
        closeBtn.addEventListener('click', function () {
          modal.style.display = 'none';
        });
      });
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Create classroom
    var createBtn = document.getElementById('create-classroom-submit');
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        var nameInput = document.getElementById('new-classroom-name');
        if (!nameInput) return;
        var name = nameInput.value.trim();
        if (!name) {
          showToast('Please enter a classroom name', 'error');
          return;
        }
        try {
          await api('/api/classrooms', {
            method: 'POST',
            body: JSON.stringify({ name: name }),
          });
          nameInput.value = '';
          var modal = document.getElementById('create-classroom-modal');
          if (modal) modal.style.display = 'none';
          await loadClassrooms();
          showToast('Classroom created!', 'success');
        } catch (e) {
          showToast('Failed to create classroom', 'error');
        }
      });
    }

    // Join classroom
    var joinBtn = document.getElementById('join-classroom-submit');
    if (joinBtn) {
      joinBtn.addEventListener('click', async function () {
        var idInput = document.getElementById('join-classroom-id');
        if (!idInput) return;
        var id = idInput.value.trim();
        if (!id) {
          showToast('Please enter a classroom ID', 'error');
          return;
        }
        try {
          await api('/api/classrooms/' + id + '/join', { method: 'POST' });
          idInput.value = '';
          var modal = document.getElementById('join-classroom-modal');
          if (modal) modal.style.display = 'none';
          await loadClassrooms();
          showToast('Joined classroom!', 'success');
        } catch (e) {
          showToast('Failed to join classroom', 'error');
        }
      });
    }

    // Save preferences
    var savePrefs = document.getElementById('save-prefs-btn');
    if (savePrefs) {
      savePrefs.addEventListener('click', async function () {
        var colorInput = document.getElementById('pref-color');
        var fontInput = document.getElementById('pref-font-size');
        var densityInput = document.getElementById('pref-density');

        var prefs = {
          accentColor: colorInput ? colorInput.value : '#00d4ff',
          fontSize: fontInput ? fontInput.value : '16',
          density: densityInput ? densityInput.value : 'normal',
        };

        try {
          await api('/api/preferences', {
            method: 'PUT',
            body: JSON.stringify(prefs),
          });
          applyPreferences(prefs);
          showToast('Preferences saved!', 'success');
        } catch (e) {
          showToast('Failed to save preferences', 'error');
        }
      });
    }

    // Font size slider label
    var fontSlider = document.getElementById('pref-font-size');
    var fontLabel = document.getElementById('font-size-label');
    if (fontSlider && fontLabel) {
      fontSlider.addEventListener('input', function () {
        fontLabel.textContent = fontSlider.value + 'px';
      });
    }

    // Games button
    var gamesBtn = document.getElementById('games-btn');
    if (gamesBtn) {
      gamesBtn.addEventListener('click', function () {
        showToast('Games coming soon! 🎮');
      });
    }
  }

  function setupModal(btnId, modalId) {
    var btn = document.getElementById(btnId);
    var modal = document.getElementById(modalId);
    if (!btn || !modal) return;
    btn.addEventListener('click', function () {
      modal.style.display = 'flex';
    });
  }

  // --- STREAK ---
  async function loadStreak() {
    try {
      var data = await api('/api/streak');
      var el = document.getElementById('streak-count');
      if (el) el.textContent = data.streak_count || 0;
    } catch (e) {
      // Ignore streak errors
    }
  }

  // --- PREFERENCES ---
  async function applyPreferences(prefs) {
    if (!prefs) {
      try {
        prefs = await api('/api/preferences');
      } catch (e) {
        return;
      }
    }

    if (prefs.accentColor) {
      document.documentElement.style.setProperty('--accent', prefs.accentColor);
      document.documentElement.style.setProperty(
        '--accent-hover',
        prefs.accentColor + 'cc'
      );
      document.documentElement.style.setProperty(
        '--border-glow',
        prefs.accentColor + '4d'
      );
      document.documentElement.style.setProperty(
        '--shadow-glow',
        '0 0 15px ' + prefs.accentColor + '26'
      );
      document.documentElement.style.setProperty(
        '--shadow-glow-strong',
        '0 0 25px ' + prefs.accentColor + '4d'
      );
    }

    if (prefs.fontSize) {
      document.documentElement.style.setProperty(
        'font-size',
        prefs.fontSize + 'px'
      );
    }

    if (prefs.density === 'compact') {
      document.body.classList.add('compact');
    } else {
      document.body.classList.remove('compact');
    }

    // Update form controls if they exist
    var colorInput = document.getElementById('pref-color');
    if (colorInput && prefs.accentColor) colorInput.value = prefs.accentColor;
    var fontInput = document.getElementById('pref-font-size');
    if (fontInput && prefs.fontSize) fontInput.value = prefs.fontSize;
    var densityInput = document.getElementById('pref-density');
    if (densityInput && prefs.density) densityInput.value = prefs.density;
  }
})();
