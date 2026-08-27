// ============================================
// ORIGIN — Frontend Application Logic
// ============================================

(function () {
  'use strict';

  // --- State ---
  let currentUser = null;
  let currentClassroom = null;
  let socket = null;
  let selectedRole = null;
  let paletteButtons = [];
  let fontSlider = null;

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

  function formatDate(dateString) {
    if (!dateString) return 'No date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (e) {
      return dateString;
    }
  }

  function getModalParam() {
    return new URLSearchParams(window.location.search).get('modal');
  }

  function openRequestedModal(modalId) {
    if (!modalId) return;
    var modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  function formatScheduleRange(item) {
    var parts = [formatDate(item.event_date)];
    if (item.start_time) {
      parts.push(item.start_time + (item.end_time ? ' - ' + item.end_time : ''));
    }
    if (item.location) {
      parts.push(item.location);
    }
    return parts.join(' • ');
  }

  function getNumericGradeValue(grade) {
    if (!grade) return null;
    var match = String(grade).match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  function getAverageGradeText(items) {
    var values = items
      .map(function (item) {
        return getNumericGradeValue(item.grade || item.submission_grade);
      })
      .filter(function (value) {
        return value !== null && !Number.isNaN(value);
      });

    if (!values.length) return '—';

    var total = values.reduce(function (sum, value) {
      return sum + value;
    }, 0);

    return Math.round((total / values.length) * 10) / 10 + '%';
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
    page === 'tasks' ||
    page === 'grades' ||
    page === 'schedule'
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
    // Load leaderboard data
    loadLeaderboard();

    // Setup header event listeners (modals, dropdowns, etc.)
    setupHeaderEvents();

    // Page-specific init
    if (page === 'dashboard') initDashboard();
    if (page === 'tutorials') initTutorials();
    if (page === 'discussions') initDiscussions();
    if (page === 'tasks') initTasks();
    if (page === 'grades') initGrades();
    if (page === 'schedule') initSchedule();
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

    var ddBtn = document.getElementById('classroom-dropdown-btn');
    if (ddBtn) {
      ddBtn.innerHTML = '🏫 ' + escapeHtml(classroom.name) + ' ▾';
    }

    var currentClassroomName = document.getElementById('dashboard-current-classroom');
    var currentClassroomMeta = document.getElementById('dashboard-current-meta');
    if (currentClassroomName) currentClassroomName.textContent = classroom.name;
    if (currentClassroomMeta) {
      currentClassroomMeta.textContent =
        'Classroom ID: ' + classroom.id + (classroom.otp ? ' • Join code: ' + classroom.otp : '');
    }

    if (page === 'dashboard') {
      var noState = document.getElementById('no-classroom-state');
      var content = document.getElementById('classroom-content');
      var nameEl = document.getElementById('classroom-name');
      var idBadge = document.getElementById('classroom-id-badge');

      if (noState) noState.style.display = 'none';
      if (content) content.style.display = 'block';
      if (nameEl) nameEl.textContent = classroom.name;
      if (idBadge) idBadge.textContent = 'ID: ' + classroom.id + (classroom.otp ? ' | Code: ' + classroom.otp : '');

      // Load banner
      loadBanner();
      // Load chat
      loadChat();
      // Load classroom overview panels
      loadDashboardStats();
      loadDashboardPanels();
      // Join socket room
      if (socket) socket.emit('join-classroom', classroom.id);
      // Show/hide teacher controls
      var bannerBtn = document.getElementById('banner-upload-btn');
      if (bannerBtn) {
        bannerBtn.style.display =
          currentUser.role === 'teacher' ? 'block' : 'none';
      }
      var taskBtn = document.getElementById('create-task-btn');
      if (taskBtn) {
        taskBtn.style.display =
          currentUser.role === 'teacher' ? 'inline-flex' : 'none';
      }
    }

    if (page === 'tutorials') {
      loadTutorials();
    }

    if (page === 'tasks') {
      loadTasks();
    }

    if (page === 'grades') {
      loadGrades();
    }

    if (page === 'schedule') {
      loadSchedule();
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
    socket.on('leaderboard-update', function (data) {
      renderLeaderboard(data);
    });

    // If we have a current classroom, join it
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) {
      currentClassroom = JSON.parse(stored);
      switchClassroom(currentClassroom);
    }
  }

  // --- DASHBOARD ---
  function initDashboard() {
    // Welcome banner — show user's first name
    var welcomeName = document.getElementById('welcome-name');
    console.log('initDashboard - currentUser:', currentUser);
    if (welcomeName && currentUser && currentUser.name) {
      var firstName = currentUser.name.split(' ')[0];
      console.log('Setting welcome name to:', firstName);
      welcomeName.textContent = firstName;
    } else {
      console.log('Could not set welcome name - welcomeName:', !!welcomeName, 'currentUser:', !!currentUser, 'currentUser.name:', currentUser?.name);
    }

    // Set chat user avatar
    var chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar && currentUser) {
      chatAvatar.src = currentUser.avatar || '../public/default-avatar.svg';
    }

    // Load stats
    loadDashboardStats();
    loadDashboardPanels();

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

    // Classroom task creation
    setupTaskForm();

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

    var statDue = document.getElementById('stat-due');
    var statCompleted = document.getElementById('stat-completed');
    var statGrade = document.getElementById('stat-grade');
    var statGradeBadge = document.getElementById('stat-grade-badge');

    if (!currentClassroom) {
      if (statDue) statDue.textContent = '—';
      if (statCompleted) statCompleted.textContent = '—';
      if (statGrade) statGrade.textContent = '—';
      if (statGradeBadge) statGradeBadge.textContent = '';
      return;
    }

    try {
      var tasks = await api('/api/classrooms/' + currentClassroom.id + '/tasks');
      var dueCount = tasks.filter(function (task) {
        return task.submission_status !== 'graded' && task.submission_status !== 'submitted';
      }).length;
      var completedCount = tasks.filter(function (task) {
        return task.submission_status === 'submitted' || task.submission_status === 'graded';
      }).length;

      if (statDue) statDue.textContent = dueCount;
      if (statCompleted) statCompleted.textContent = completedCount;
    } catch (e) {
      if (statDue) statDue.textContent = '—';
      if (statCompleted) statCompleted.textContent = '—';
    }

    try {
      var grades = await api('/api/classrooms/' + currentClassroom.id + '/grades');
      var averageText = getAverageGradeText(grades);
      if (statGrade) statGrade.textContent = averageText;
      if (statGradeBadge) {
        statGradeBadge.textContent = averageText === '—' ? 'No scores yet' : 'Based on recorded grades';
      }
    } catch (e) {
      if (statGrade) statGrade.textContent = '—';
      if (statGradeBadge) statGradeBadge.textContent = '';
    }
  }

  async function loadDashboardPanels() {
    var materialsList = document.getElementById('dashboard-materials-list');
    var scheduleList = document.getElementById('dashboard-schedule-list');

    if (!materialsList && !scheduleList) return;

    if (!currentClassroom) {
      if (materialsList) {
        materialsList.innerHTML = '<div class="dashboard-mini-empty">Select a classroom to see the latest materials.</div>';
      }
      if (scheduleList) {
        scheduleList.innerHTML = '<div class="dashboard-mini-empty">Select a classroom to load upcoming events.</div>';
      }
      return;
    }

    if (materialsList) {
      try {
        var materials = await api('/api/classrooms/' + currentClassroom.id + '/materials');
        materialsList.innerHTML = '';
        if (!materials.length) {
          materialsList.innerHTML = '<div class="dashboard-mini-empty">No materials yet.</div>';
        } else {
          materials.slice(0, 4).forEach(function (material) {
            var item = document.createElement('a');
            item.className = 'dashboard-mini-item';
            item.href = material.file_url || material.youtube_url || '/tutorials';
            item.target = item.href.indexOf('/uploads/') === 0 || item.href.indexOf('http') === 0 ? '_blank' : '_self';
            item.innerHTML =
              '<div class="dashboard-mini-title">' + escapeHtml(material.title) + '</div>' +
              '<div class="dashboard-mini-meta">' +
              escapeHtml(material.material_type === 'file' ? 'Handout' : 'YouTube') +
              ' • ' +
              formatTime(material.created_at) +
              '</div>';
            materialsList.appendChild(item);
          });
        }
      } catch (e) {
        materialsList.innerHTML = '<div class="dashboard-mini-empty">Could not load materials.</div>';
      }
    }

    if (scheduleList) {
      try {
        var scheduleItems = await api('/api/classrooms/' + currentClassroom.id + '/schedule');
        scheduleList.innerHTML = '';
        if (!scheduleItems.length) {
          scheduleList.innerHTML = '<div class="dashboard-mini-empty">No schedule items yet.</div>';
        } else {
          scheduleItems.slice(0, 4).forEach(function (item) {
            var card = document.createElement('div');
            card.className = 'dashboard-mini-item';
            card.innerHTML =
              '<div class="dashboard-mini-title">' + escapeHtml(item.title) + '</div>' +
              '<div class="dashboard-mini-meta">' + escapeHtml(formatScheduleRange(item)) + '</div>';
            scheduleList.appendChild(card);
          });
        }
      } catch (e) {
        scheduleList.innerHTML = '<div class="dashboard-mini-empty">Could not load schedule.</div>';
      }
    }
  }

  // --- LEADERBOARD HANDLING ---
function renderLeaderboard(data) {
  var list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '';
  data.forEach(function (item, idx) {
    var el = document.createElement('div');
    el.className = 'leaderboard-item';
    el.innerHTML =
      '<div class="leaderboard-rank">' + (idx + 1) + '</div>' +
      '<div class="leaderboard-info">' +
      '<div class="leaderboard-name">' + escapeHtml(item.name) + '</div>' +
      '<div class="leaderboard-meta">' + item.streak_count + ' streak</div>' +
      '</div>';
    list.appendChild(el);
  });
}

async function loadLeaderboard() {
  try {
    var data = await api('/api/leaderboard');
    renderLeaderboard(data);
  } catch (e) {
    // ignore errors
  }
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

  // --- MATERIALS ---
  async function initTutorials() {
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) currentClassroom = JSON.parse(stored);
    await loadTutorials();
    setupTutorialForm();
    if (getModalParam() === 'material' && currentUser && currentUser.role === 'teacher') {
      setTimeout(function () {
        openRequestedModal('add-material-modal');
      }, 50);
    }
  }

  async function loadTutorials() {
    var warning = document.getElementById('no-classroom-warning');
    var grid = document.getElementById('materials-grid');
    var emptyState = document.getElementById('no-tutorials-state');
    var toolbar = document.getElementById('materials-toolbar');
    if (!grid) return;

    if (!currentClassroom) {
      if (warning) warning.style.display = 'block';
      if (toolbar) toolbar.style.display = 'none';
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    try {
      var materials = await api(
        '/api/classrooms/' + currentClassroom.id + '/materials'
      );
      var activeFilterBtn = document.querySelector('[data-material-filter].active');
      var activeFilter = activeFilterBtn ? activeFilterBtn.dataset.materialFilter : 'all';
      var filtered = materials.filter(function (item) {
        return activeFilter === 'all' || item.material_type === activeFilter;
      });

      if (warning) warning.style.display = 'none';
      if (toolbar) toolbar.style.display = 'flex';
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = filtered.length ? 'none' : 'block';
      if (!filtered.length) {
        return;
      }

      filtered.forEach(function (material) {
        var videoId = getYouTubeId(material.youtube_url);
        var thumb = videoId
          ? 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg'
          : '';
        var card = document.createElement('div');
        card.className = 'material-card';

        var imgHtml = thumb
          ? '<img src="' +
            escapeHtml(thumb) +
            '" alt="' +
            escapeHtml(material.title) +
            '">'
          : '';

        var actionHtml =
          '<a href="' +
          escapeHtml(material.file_url || material.youtube_url || '#') +
          '" target="_blank" class="btn-primary">' +
          (material.material_type === 'file' ? 'Open File' : 'Watch Video') +
          '</a>';

        var metaBits = [
          material.material_type === 'file' ? 'Handout' : 'YouTube',
          material.added_by_name || 'Teacher',
          formatTime(material.created_at)
        ];

        if (currentUser.role === 'student') {
          actionHtml +=
            '<button class="btn-secondary mark-material-viewed" data-id="' +
            material.id +
            '" data-viewed="' +
            (material.watched ? '1' : '0') +
            '">' +
            (material.watched ? 'Viewed' : 'Mark Viewed') +
            '</button>';
        }

        if (currentUser.role === 'teacher') {
          actionHtml +=
            '<button class="btn-danger delete-material" data-id="' +
            material.id +
            '">Delete</button>';
        }

        card.innerHTML =
          imgHtml +
          '<div class="material-card-body">' +
          '<div class="material-badge">' + escapeHtml(material.material_type === 'file' ? 'Handout' : 'YouTube') + '</div>' +
          '<h3>' +
          escapeHtml(material.title) +
          '</h3>' +
          '<p>' + escapeHtml(material.description || 'Open the material to review this classroom resource.') + '</p>' +
          '<div class="material-meta">' + escapeHtml(metaBits.join(' • ')) + '</div>' +
          '<div class="tutorial-actions">' +
          actionHtml +
          '</div>' +
          '</div>';
        grid.appendChild(card);
      });

      grid.querySelectorAll('.mark-material-viewed').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await api('/api/materials/' + btn.dataset.id + '/view', {
              method: 'POST',
            });
            btn.textContent = 'Viewed';
            btn.dataset.viewed = '1';
            showToast('Marked as viewed!', 'success');
          } catch (e) {
            showToast('Failed to update material', 'error');
          }
        });
      });

      grid.querySelectorAll('.delete-material').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await api('/api/materials/' + btn.dataset.id, {
              method: 'DELETE',
            });
            loadTutorials();
            showToast('Material removed', 'success');
          } catch (e) {
            showToast('Failed to delete material', 'error');
          }
        });
      });
    } catch (e) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><p>Could not load materials.</p></div>';
    }
  }

  function setupTutorialForm() {
    var form = document.getElementById('add-material-form');
    var openBtn = document.getElementById('open-material-form-btn');
    var modal = document.getElementById('add-material-modal');

    document.querySelectorAll('[data-material-filter]').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-material-filter]').forEach(function (filterBtn) {
          filterBtn.classList.remove('active');
        });
        btn.classList.add('active');
        loadTutorials();
      });
    });

    if (openBtn) {
      openBtn.style.display = currentUser.role === 'teacher' ? 'inline-flex' : 'none';
      if (!openBtn.dataset.bound) {
        openBtn.dataset.bound = 'true';
        openBtn.addEventListener('click', function () {
          if (modal) modal.style.display = 'flex';
        });
      }
    }

    if (!form || currentUser.role !== 'teacher') {
      return;
    }

    if (form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var formData = new FormData(form);
      var url = formData.get('youtube_url');
      var file = formData.get('file');
      if (!formData.get('title') || (!url && (!file || !file.name))) {
        showToast('Add a title and either a file or YouTube URL', 'error');
        return;
      }
      try {
        var res = await fetch('/api/classrooms/' + currentClassroom.id + '/materials', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('Upload failed');
        form.reset();
        if (modal) modal.style.display = 'none';
        loadTutorials();
        loadDashboardPanels();
        showToast('Material added!', 'success');
      } catch (e) {
        showToast('Failed to add material', 'error');
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

  // --- GRADES ---
  async function initGrades() {
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) currentClassroom = JSON.parse(stored);
    await loadGrades();
  }

  async function loadGrades() {
    var warning = document.getElementById('no-classroom-warning');
    var board = document.getElementById('grades-board');
    var emptyState = document.getElementById('no-grades-state');
    var summaryGrid = document.getElementById('grades-summary-grid');
    if (!board) return;

    if (!currentClassroom) {
      if (warning) warning.style.display = 'block';
      if (summaryGrid) summaryGrid.style.display = 'none';
      board.innerHTML = '';
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    try {
      var grades = await api('/api/classrooms/' + currentClassroom.id + '/grades');
      var recordedCount = grades.filter(function (item) {
        return item.grade;
      }).length;
      var pendingCount = grades.filter(function (item) {
        return item.status && item.status !== 'graded';
      }).length;
      var averageText = getAverageGradeText(grades);

      if (warning) warning.style.display = 'none';
      if (summaryGrid) summaryGrid.style.display = 'grid';
      var recordedEl = document.getElementById('grades-recorded-count');
      var averageEl = document.getElementById('grades-average-grade');
      var pendingEl = document.getElementById('grades-pending-count');
      if (recordedEl) recordedEl.textContent = recordedCount;
      if (averageEl) averageEl.textContent = averageText;
      if (pendingEl) pendingEl.textContent = pendingCount;

      board.innerHTML = '';
      if (emptyState) emptyState.style.display = grades.length ? 'none' : 'block';
      if (!grades.length) return;

      grades.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'grade-card';
        if (currentUser.role === 'teacher') {
          card.innerHTML =
            '<div class="grade-card-top">' +
            '<div><h3>' + escapeHtml(item.task_title) + '</h3><div class="grade-card-meta">' + escapeHtml(item.student_name || 'No submission yet') + '</div></div>' +
            '<span class="task-status ' + escapeHtml(item.status || 'pending') + '">' + escapeHtml((item.status || 'pending').toUpperCase()) + '</span>' +
            '</div>' +
            '<div class="grade-card-row"><span>Due</span><strong>' + escapeHtml(formatDate(item.due_date)) + '</strong></div>' +
            '<div class="grade-card-row"><span>Grade</span><strong>' + escapeHtml(item.grade || 'Not graded') + '</strong></div>' +
            '<div class="grade-card-feedback">' + escapeHtml(item.feedback || 'No feedback yet.') + '</div>';
        } else {
          card.innerHTML =
            '<div class="grade-card-top">' +
            '<div><h3>' + escapeHtml(item.task_title) + '</h3><div class="grade-card-meta">' + escapeHtml(formatDate(item.due_date)) + '</div></div>' +
            '<span class="task-status ' + escapeHtml(item.status || 'pending') + '">' + escapeHtml((item.status || 'pending').toUpperCase()) + '</span>' +
            '</div>' +
            '<div class="grade-card-row"><span>Grade</span><strong>' + escapeHtml(item.grade || 'Waiting for grade') + '</strong></div>' +
            '<div class="grade-card-feedback">' + escapeHtml(item.feedback || 'Feedback will appear here after grading.') + '</div>';
        }
        board.appendChild(card);
      });
    } catch (e) {
      board.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>Could not load grades.</p></div>';
    }
  }

  // --- SCHEDULE ---
  async function initSchedule() {
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) currentClassroom = JSON.parse(stored);
    await loadSchedule();
    setupScheduleForm();
    if (getModalParam() === 'event' && currentUser && currentUser.role === 'teacher') {
      setTimeout(function () {
        openRequestedModal('schedule-modal');
      }, 50);
    }
  }

  async function loadSchedule() {
    var warning = document.getElementById('no-classroom-warning');
    var list = document.getElementById('schedule-list');
    var emptyState = document.getElementById('no-schedule-state');
    if (!list) return;

    if (!currentClassroom) {
      if (warning) warning.style.display = 'block';
      list.innerHTML = '';
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    try {
      var items = await api('/api/classrooms/' + currentClassroom.id + '/schedule');
      if (warning) warning.style.display = 'none';
      list.innerHTML = '';
      if (emptyState) emptyState.style.display = items.length ? 'none' : 'block';
      if (!items.length) return;

      items.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'schedule-card';
        var actions = '';
        if (currentUser.role === 'teacher') {
          actions =
            '<button class="btn-danger delete-schedule-btn" data-id="' + item.id + '">Delete</button>';
        }

        card.innerHTML =
          '<div class="schedule-card-top">' +
          '<div><h3>' + escapeHtml(item.title) + '</h3><div class="schedule-card-meta">' + escapeHtml(formatScheduleRange(item)) + '</div></div>' +
          actions +
          '</div>' +
          '<p>' + escapeHtml(item.description || 'No extra details provided.') + '</p>';
        list.appendChild(card);
      });

      list.querySelectorAll('.delete-schedule-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await api('/api/schedule/' + btn.dataset.id, { method: 'DELETE' });
            loadSchedule();
            loadDashboardPanels();
            showToast('Schedule event removed', 'success');
          } catch (e) {
            showToast('Failed to delete event', 'error');
          }
        });
      });
    } catch (e) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗓️</div><p>Could not load the schedule.</p></div>';
    }
  }

  function setupScheduleForm() {
    var openBtn = document.getElementById('open-schedule-form-btn');
    var form = document.getElementById('schedule-form');
    var modal = document.getElementById('schedule-modal');

    if (openBtn) {
      openBtn.style.display = currentUser.role === 'teacher' ? 'inline-flex' : 'none';
      if (!openBtn.dataset.bound) {
        openBtn.dataset.bound = 'true';
        openBtn.addEventListener('click', function () {
          if (modal) modal.style.display = 'flex';
        });
      }
    }

    if (!form || currentUser.role !== 'teacher' || form.dataset.bound) return;

    form.dataset.bound = 'true';
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var formData = new FormData(form);
      var payload = {
        title: formData.get('title'),
        description: formData.get('description'),
        event_date: formData.get('event_date'),
        start_time: formData.get('start_time'),
        end_time: formData.get('end_time'),
        location: formData.get('location'),
      };

      try {
        await api('/api/classrooms/' + currentClassroom.id + '/schedule', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.reset();
        if (modal) modal.style.display = 'none';
        loadSchedule();
        loadDashboardPanels();
        showToast('Schedule updated!', 'success');
      } catch (e) {
        showToast('Failed to save schedule item', 'error');
      }
    });
  }

  // --- TASKS ---
  async function initTasks() {
    var stored = sessionStorage.getItem('currentClassroom');
    if (stored) currentClassroom = JSON.parse(stored);
    await loadTasks();
    setupTaskForm();
    if (getModalParam() === 'task' && currentUser && currentUser.role === 'teacher') {
      setTimeout(function () {
        openRequestedModal('create-task-modal');
      }, 50);
    }
  }

  async function loadTasks() {
    var warning = document.getElementById('no-classroom-warning');
    var filters = document.getElementById('task-filters');
    var list = document.getElementById('tasks-list');
    var emptyState = document.getElementById('no-tasks-state');
    if (!list) return;

    if (!currentClassroom) {
      if (warning) warning.style.display = 'block';
      if (filters) filters.style.display = 'none';
      list.innerHTML = '';
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    try {
      var tasks = await api('/api/classrooms/' + currentClassroom.id + '/tasks');
      var activeFilterBtn = document.querySelector('#task-filters .filter-btn.active');
      var activeFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
      var now = new Date();

      var filteredTasks = tasks.filter(function (task) {
        var status = task.submission_status || 'pending';
        var isOverdue = status === 'pending' && task.due_date && new Date(task.due_date + 'T23:59:59') < now;
        if (activeFilter === 'all') return true;
        if (activeFilter === 'overdue') return isOverdue;
        return status === activeFilter;
      });

      if (warning) warning.style.display = 'none';
      if (filters) filters.style.display = 'flex';
      list.innerHTML = '';
      if (emptyState) emptyState.style.display = filteredTasks.length ? 'none' : 'block';
      if (!filteredTasks.length) return;

      filteredTasks.forEach(function (task) {
        var card = document.createElement('div');
        card.className = 'task-card';
        var status = task.submission_status || 'pending';
        var isOverdue = status === 'pending' && task.due_date && new Date(task.due_date + 'T23:59:59') < now;
        var displayStatus = isOverdue ? 'overdue' : status;

        var fileHtml = task.file_url
          ? '<a href="' + escapeHtml(task.file_url) + '" target="_blank">📎 Attachment</a>'
          : '';

        var actionsHtml = '';
        if (currentUser.role === 'student') {
          if (status === 'pending') {
            actionsHtml =
              '<button class="btn-primary submit-task-btn" data-id="' + task.id + '">Submit Work</button>';
          } else {
            actionsHtml =
              '<div class="student-submission-card">' +
              '<p><strong>Your submission:</strong> ' + escapeHtml(task.submission_text || 'No text provided') + '</p>' +
              (task.submission_file_url ? '<a href="' + escapeHtml(task.submission_file_url) + '" target="_blank">📎 Submitted File</a>' : '') +
              '<p><strong>Grade:</strong> ' + escapeHtml(task.grade || 'Pending review') + '</p>' +
              '<p><strong>Feedback:</strong> ' + escapeHtml(task.feedback || 'No feedback yet') + '</p>' +
              '</div>';
          }
        } else {
          actionsHtml =
            '<div class="teacher-task-actions">' +
            '<button class="btn-secondary view-subs-btn" data-id="' + task.id + '">View Submissions</button>' +
            '<button class="btn-danger delete-task-btn" data-id="' + task.id + '">Delete</button>' +
            '</div>';
        }

        card.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">' +
          '<h3>' + escapeHtml(task.title) + '</h3>' +
          '<span class="task-status ' + escapeHtml(displayStatus) + '">' + escapeHtml(displayStatus.toUpperCase()) + '</span>' +
          '</div>' +
          '<p>' + escapeHtml(task.description || '') + '</p>' +
          '<div class="task-meta">' +
          '<span>📅 Due: ' + escapeHtml(formatDate(task.due_date)) + '</span>' +
          fileHtml +
          '</div>' +
          '<div class="task-actions">' + actionsHtml + '</div>';

        list.appendChild(card);
      });

      list.querySelectorAll('.submit-task-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          showSubmitForm(btn.dataset.id);
        });
      });

      list.querySelectorAll('.view-subs-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          viewSubmissions(btn.dataset.id);
        });
      });

      list.querySelectorAll('.delete-task-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await api('/api/tasks/' + btn.dataset.id, { method: 'DELETE' });
            loadTasks();
            loadGrades();
            loadDashboardStats();
            showToast('Task deleted', 'success');
          } catch (e) {
            showToast('Failed to delete task', 'error');
          }
        });
      });
    } catch (e) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>Could not load tasks.</p></div>';
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
        list.innerHTML = '<p style="color:var(--text-muted)">No submissions yet.</p>';
        return;
      }

      subs.forEach(function (submission) {
        var div = document.createElement('div');
        div.className = 'submission-item';
        div.innerHTML =
          '<strong>' + escapeHtml(submission.student_name || 'Student') + '</strong>' +
          '<p>' + escapeHtml(submission.submission_text || 'No text submitted') + '</p>' +
          (submission.file_url ? '<a href="' + escapeHtml(submission.file_url) + '" target="_blank">📎 File</a>' : '') +
          '<p style="font-size:0.8rem;color:var(--text-muted)">Submitted: ' + formatTime(submission.submitted_at) + '</p>' +
          '<div class="grading-stack">' +
          '<input type="text" class="form-input grade-input" placeholder="Grade..." value="' + escapeHtml(submission.grade || '') + '" data-id="' + submission.id + '">' +
          '<input type="text" class="form-input feedback-input" placeholder="Feedback..." value="' + escapeHtml(submission.feedback || '') + '" data-id="' + submission.id + '">' +
          '<button class="btn-primary grade-btn" data-id="' + submission.id + '">Save Grade</button>' +
          '</div>';
        list.appendChild(div);
      });

      list.querySelectorAll('.grade-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var gradeInput = list.querySelector('.grade-input[data-id="' + btn.dataset.id + '"]');
          var feedbackInput = list.querySelector('.feedback-input[data-id="' + btn.dataset.id + '"]');
          if (!gradeInput) return;
          try {
            await api('/api/submissions/' + btn.dataset.id + '/grade', {
              method: 'PUT',
              body: JSON.stringify({
                grade: gradeInput.value,
                feedback: feedbackInput ? feedbackInput.value : '',
              }),
            });
            loadTasks();
            loadGrades();
            loadDashboardStats();
            showToast('Grade saved!', 'success');
          } catch (e) {
            showToast('Failed to save grade', 'error');
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
    var submitForm = document.getElementById('submit-task-form');

    if (toggleBtn) {
      toggleBtn.style.display = currentUser.role === 'teacher' ? 'inline-flex' : 'none';
      if (!toggleBtn.dataset.bound) {
        toggleBtn.dataset.bound = 'true';
        toggleBtn.addEventListener('click', function () {
          var modal = document.getElementById('create-task-modal');
          if (modal) modal.style.display = 'flex';
        });
      }
    }

    if (form && currentUser.role === 'teacher' && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var formData = new FormData(form);
        try {
          var res = await fetch('/api/classrooms/' + currentClassroom.id + '/tasks', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) throw new Error('Create failed');
          form.reset();
          var modal = document.getElementById('create-task-modal');
          if (modal) modal.style.display = 'none';
          loadTasks();
          loadDashboardStats();
          showToast('Task created!', 'success');
        } catch (e) {
          showToast('Failed to create task', 'error');
        }
      });
    }

    if (submitForm && !submitForm.dataset.bound) {
      submitForm.dataset.bound = 'true';
      submitForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var formData = new FormData(submitForm);
        var taskIdInput = document.getElementById('submit-task-id');
        if (!taskIdInput) return;
        try {
          var res = await fetch('/api/tasks/' + taskIdInput.value + '/submit', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) throw new Error('Submit failed');
          var submitModal = document.getElementById('submit-task-modal');
          if (submitModal) submitModal.style.display = 'none';
          submitForm.reset();
          loadTasks();
          loadGrades();
          loadDashboardStats();
          showToast('Work submitted!', 'success');
        } catch (e) {
          showToast('Failed to submit work', 'error');
        }
      });
    }

    document.querySelectorAll('#task-filters .filter-btn').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', function () {
        document.querySelectorAll('#task-filters .filter-btn').forEach(function (filterBtn) {
          filterBtn.classList.remove('active');
        });
        btn.classList.add('active');
        loadTasks();
      });
    });
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

    // Show/hide/redirect based on role
    var isTeacher = currentUser && currentUser.role === 'teacher';

    // Dropdown +Create button: teachers only (hide for students)
    var dCreateBtn = document.getElementById('create-classroom-btn');
    if (dCreateBtn) {
      if (isTeacher) {
        dCreateBtn.style.display = 'block';
        setupModal('create-classroom-btn', 'create-classroom-modal');
      } else {
        dCreateBtn.style.display = 'none';
      }
    }

    // Dropdown 🔗Join button: both teachers and students can use
    setupModal('join-classroom-btn', 'join-classroom-modal');

    // Welcome banner "+ New Course" button: opens create for teacher, join for student
    var bannerNewCourseBtn = document.getElementById('new-course-btn');
    if (bannerNewCourseBtn) {
      bannerNewCourseBtn.addEventListener('click', function () {
        var modalId = isTeacher ? 'create-classroom-modal' : 'join-classroom-modal';
        var modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'flex';
      });
    }

    // Empty state "+ Create Classroom" button: teachers only (hide for students)
    var eCreateBtn = document.getElementById('empty-create-btn');
    if (eCreateBtn) {
      if (isTeacher) {
        eCreateBtn.style.display = 'inline-block';
        setupModal('empty-create-btn', 'create-classroom-modal');
      } else {
        eCreateBtn.style.display = 'none';
      }
    }

    // Empty state "Join Classroom" button: both teachers and students can use
    setupModal('empty-join-btn', 'join-classroom-modal');

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
        if (currentUser && currentUser.role !== 'teacher') {
          showToast('Only teachers can create classrooms', 'error');
          return;
        }
        try {
          var classroom = await api('/api/classrooms', {
            method: 'POST',
            body: JSON.stringify({ name: name }),
          });
          nameInput.value = '';
          var modal = document.getElementById('create-classroom-modal');
          if (modal) modal.style.display = 'none';
          await loadClassrooms();
          if (classroom && classroom.id) {
            switchClassroom(classroom);
          }
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
          showToast('Please enter a classroom ID or Join Code (OTP)', 'error');
          return;
        }
        try {
          var res = await api('/api/classrooms/' + encodeURIComponent(id) + '/join', { method: 'POST' });
          idInput.value = '';
          var modal = document.getElementById('join-classroom-modal');
          if (modal) modal.style.display = 'none';
          await loadClassrooms();
          showToast('Joined classroom!', 'success');
          if (res && res.classroomId) {
            var newClass = await api('/api/classrooms/' + res.classroomId);
            if (newClass) {
              switchClassroom(newClass);
            }
          }
        } catch (e) {
          showToast('Failed to join classroom. Invalid ID or Code.', 'error');
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

        var themeInput = document.getElementById('pref-theme');
        var prefs = {
          accentColor: colorInput ? colorInput.value : '#4a90e2',
          themeName: themeInput ? themeInput.value : '',
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

    // Color palette swatches
    paletteButtons = Array.prototype.slice.call(document.querySelectorAll('.color-swatch'));
    paletteButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        paletteButtons.forEach(function (btn) {
          btn.classList.remove('selected');
        });
        button.classList.add('selected');
        var selectedTheme = button.getAttribute('data-theme');
        var selectedColor = button.getAttribute('data-color');
        var colorInput = document.getElementById('pref-color');
        var themeInput = document.getElementById('pref-theme');
        if (colorInput) {
          colorInput.value = selectedColor;
        }
        if (themeInput) {
          themeInput.value = selectedTheme || '';
        }
        applyPreferences({ accentColor: selectedColor, themeName: selectedTheme });
      });
    });

    function highlightSelectedPalette(color, themeName) {
      if (!color && !themeName) return;
      if (!paletteButtons || !paletteButtons.length) return;
      paletteButtons.forEach(function (btn) {
        var isSelected = false;
        if (themeName) {
          isSelected = btn.getAttribute('data-theme') === themeName;
        } else if (color) {
          isSelected = btn.getAttribute('data-color').toLowerCase() === color.toLowerCase();
        }
        btn.classList.toggle('selected', isSelected);
      });
    }

    function hexToRgb(hex) {
      var sanitized = hex.replace('#', '');
      if (sanitized.length === 3) {
        sanitized = sanitized.split('').map(function (part) {
          return part + part;
        }).join('');
      }
      var bigint = parseInt(sanitized, 16);
      return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
      };
    }

    function rgbaFromHex(hex, alpha) {
      var rgb = hexToRgb(hex);
      return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
    }

    function lightenHex(hex, amount) {
      var rgb = hexToRgb(hex);
      var lightenChannel = function (channel) {
        return Math.round(channel + (255 - channel) * amount);
      };
      var r = lightenChannel(rgb.r);
      var g = lightenChannel(rgb.g);
      var b = lightenChannel(rgb.b);
      return (
        '#' +
        [r, g, b]
          .map(function (value) {
            return value.toString(16).padStart(2, '0');
          })
          .join('')
      );
    }

    var themePalettes = {
      ocean: {
        accent: '#4a90e2',
        accentHover: '#6cacf3',
        pageBg: 'linear-gradient(135deg, #f9fbff 0%, #eaf2ff 100%)',
        surfaceStrong: '#eef6ff',
        surfaceMuted: '#eef4ff',
        radialTop: 'rgba(74, 144, 226, 0.14)',
        radialBottom: 'rgba(74, 144, 226, 0.2)',
      },
      cosmos: {
        accent: '#6f70f3',
        accentHover: '#8a78f8',
        pageBg: 'linear-gradient(135deg, #f4f1ff 0%, #e3e1ff 100%)',
        surfaceStrong: '#f3f0ff',
        surfaceMuted: '#eef0ff',
        radialTop: 'rgba(111, 112, 243, 0.14)',
        radialBottom: 'rgba(141, 140, 252, 0.2)',
      },
      neon: {
        accent: '#00c9c8',
        accentHover: '#3be3d8',
        pageBg: 'linear-gradient(135deg, #f1fffb 0%, #e5fdfb 100%)',
        surfaceStrong: '#e9fffe',
        surfaceMuted: '#ecfffd',
        radialTop: 'rgba(0, 201, 200, 0.14)',
        radialBottom: 'rgba(0, 201, 200, 0.2)',
      },
      sunset: {
        accent: '#f07f43',
        accentHover: '#ff9e66',
        pageBg: 'linear-gradient(135deg, #fff4f0 0%, #ffe8dc 100%)',
        surfaceStrong: '#fff2ea',
        surfaceMuted: '#fff4ed',
        radialTop: 'rgba(240, 127, 67, 0.14)',
        radialBottom: 'rgba(240, 127, 67, 0.2)',
      },
      monochrome: {
        accent: '#8e9abe',
        accentHover: '#a7adc9',
        pageBg: 'linear-gradient(135deg, #f4f5fb 0%, #e9ecf9 100%)',
        surfaceStrong: '#eef0fb',
        surfaceMuted: '#f2f3fc',
        radialTop: 'rgba(142, 154, 190, 0.14)',
        radialBottom: 'rgba(142, 154, 190, 0.2)',
      },
    };

    function setThemeVariables(theme) {
      if (!theme) return;
      if (theme.pageBg) document.documentElement.style.setProperty('--page-bg', theme.pageBg);
      if (theme.surfaceStrong) document.documentElement.style.setProperty('--surface-strong', theme.surfaceStrong);
      if (theme.surfaceMuted) document.documentElement.style.setProperty('--surface-muted', theme.surfaceMuted);
      if (theme.radialTop) document.documentElement.style.setProperty('--radial-top', theme.radialTop);
      if (theme.radialBottom) document.documentElement.style.setProperty('--radial-bottom', theme.radialBottom);
    }

    function setAccentVariables(color) {
      var hover = lightenHex(color, 0.22);
      var rgb = hexToRgb(color);
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-rgb', rgb.r + ', ' + rgb.g + ', ' + rgb.b);
      document.documentElement.style.setProperty('--accent-hover', hover);
      document.documentElement.style.setProperty('--accent-soft', rgbaFromHex(color, 0.08));
      document.documentElement.style.setProperty('--accent-focus', rgbaFromHex(color, 0.12));
      document.documentElement.style.setProperty('--accent-glow', rgbaFromHex(color, 0.14));
      document.documentElement.style.setProperty('--accent-glow-soft', rgbaFromHex(color, 0.05));
      document.documentElement.style.setProperty('--border-glow', rgbaFromHex(color, 0.18));
      document.documentElement.style.setProperty('--shadow-glow', '0 14px 35px ' + rgbaFromHex(color, 0.08));
      document.documentElement.style.setProperty('--shadow-glow-strong', '0 22px 48px ' + rgbaFromHex(color, 0.12));
      document.documentElement.style.setProperty('--selection-bg', rgbaFromHex(color, 0.22));
    }

    // Save preferences
    fontSlider = document.getElementById('pref-font-size');
    var savePrefs = document.getElementById('save-prefs-btn');
    var fontLabel = document.getElementById('font-size-label');
    if (fontSlider && fontLabel) {
      fontSlider.addEventListener('input', function () {
        fontLabel.textContent = fontSlider.value + 'px';
      });
    }

    // Leaderboard button
    var leaderboardBtn = document.getElementById('leaderboard-btn');
    if (leaderboardBtn) {
      leaderboardBtn.addEventListener('click', function () {
        showToast('Leaderboard updates daily 🏆');
      });
    }
  }

  function highlightSelectedPalette(color, themeName) {
    if (!color && !themeName) return;
    paletteButtons.forEach(function (btn) {
      var isSelected = false;
      if (themeName) {
        isSelected = btn.getAttribute('data-theme') === themeName;
      } else if (color) {
        isSelected = btn.getAttribute('data-color').toLowerCase() === color.toLowerCase();
      }
      btn.classList.toggle('selected', isSelected);
    });
  }

  function hexToRgb(hex) {
    var sanitized = hex.replace('#', '');
    if (sanitized.length === 3) {
      sanitized = sanitized.split('').map(function (part) {
        return part + part;
      }).join('');
    }
    var bigint = parseInt(sanitized, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  }

  function rgbaFromHex(hex, alpha) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
  }

  function lightenHex(hex, amount) {
    var rgb = hexToRgb(hex);
    var lightenChannel = function (channel) {
      return Math.round(channel + (255 - channel) * amount);
    };
    var r = lightenChannel(rgb.r);
    var g = lightenChannel(rgb.g);
    var b = lightenChannel(rgb.b);
    return (
      '#'+
      [r, g, b]
        .map(function (value) {
          return value.toString(16).padStart(2, '0');
        })
        .join('')
    );
  }

  var themePalettes = {
    ocean: {
      accent: '#4a90e2',
      accentHover: '#6cacf3',
      pageBg: 'linear-gradient(135deg, #f9fbff 0%, #eaf2ff 100%)',
      surfaceStrong: '#eef6ff',
      surfaceMuted: '#eef4ff',
      radialTop: 'rgba(74, 144, 226, 0.14)',
      radialBottom: 'rgba(74, 144, 226, 0.2)',
    },
    cosmos: {
      accent: '#6f70f3',
      accentHover: '#8a78f8',
      pageBg: 'linear-gradient(135deg, #f4f1ff 0%, #e3e1ff 100%)',
      surfaceStrong: '#f3f0ff',
      surfaceMuted: '#eef0ff',
      radialTop: 'rgba(111, 112, 243, 0.14)',
      radialBottom: 'rgba(141, 140, 252, 0.2)',
    },
    neon: {
      accent: '#00c9c8',
      accentHover: '#3be3d8',
      pageBg: 'linear-gradient(135deg, #f1fffb 0%, #e5fdfb 100%)',
      surfaceStrong: '#e9fffe',
      surfaceMuted: '#ecfffd',
      radialTop: 'rgba(0, 201, 200, 0.14)',
      radialBottom: 'rgba(0, 201, 200, 0.2)',
    },
    sunset: {
      accent: '#f07f43',
      accentHover: '#ff9e66',
      pageBg: 'linear-gradient(135deg, #fff4f0 0%, #ffe8dc 100%)',
      surfaceStrong: '#fff2ea',
      surfaceMuted: '#fff4ed',
      radialTop: 'rgba(240, 127, 67, 0.14)',
      radialBottom: 'rgba(240, 127, 67, 0.2)',
    },
    monochrome: {
      accent: '#8e9abe',
      accentHover: '#a7adc9',
      pageBg: 'linear-gradient(135deg, #f4f5fb 0%, #e9ecf9 100%)',
      surfaceStrong: '#eef0fb',
      surfaceMuted: '#f2f3fc',
      radialTop: 'rgba(142, 154, 190, 0.14)',
      radialBottom: 'rgba(142, 154, 190, 0.2)',
    },
  };

  function setThemeVariables(theme) {
    if (!theme) return;
    if (theme.pageBg) document.documentElement.style.setProperty('--page-bg', theme.pageBg);
    if (theme.surfaceStrong) document.documentElement.style.setProperty('--surface-strong', theme.surfaceStrong);
    if (theme.surfaceMuted) document.documentElement.style.setProperty('--surface-muted', theme.surfaceMuted);
    if (theme.radialTop) document.documentElement.style.setProperty('--radial-top', theme.radialTop);
    if (theme.radialBottom) document.documentElement.style.setProperty('--radial-bottom', theme.radialBottom);
  }

  function setAccentVariables(color) {
    var hover = lightenHex(color, 0.22);
    var rgb = hexToRgb(color);
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-rgb', rgb.r + ', ' + rgb.g + ', ' + rgb.b);
    document.documentElement.style.setProperty('--accent-hover', hover);
    document.documentElement.style.setProperty('--accent-soft', rgbaFromHex(color, 0.08));
    document.documentElement.style.setProperty('--accent-focus', rgbaFromHex(color, 0.12));
    document.documentElement.style.setProperty('--accent-glow', rgbaFromHex(color, 0.14));
    document.documentElement.style.setProperty('--accent-glow-soft', rgbaFromHex(color, 0.05));
    document.documentElement.style.setProperty('--border-glow', rgbaFromHex(color, 0.18));
    document.documentElement.style.setProperty('--shadow-glow', '0 14px 35px ' + rgbaFromHex(color, 0.08));
    document.documentElement.style.setProperty('--shadow-glow-strong', '0 22px 48px ' + rgbaFromHex(color, 0.12));
    document.documentElement.style.setProperty('--selection-bg', rgbaFromHex(color, 0.22));
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
      var palette = prefs.themeName ? themePalettes[prefs.themeName] : null;
      setAccentVariables(prefs.accentColor);
      if (palette) {
        setThemeVariables(palette);
      } else {
        document.documentElement.style.setProperty('--radial-top', rgbaFromHex(prefs.accentColor, 0.14));
        document.documentElement.style.setProperty('--radial-bottom', rgbaFromHex(prefs.accentColor, 0.2));
      }
    }

    var themeInput = document.getElementById('pref-theme');
    if (themeInput && prefs.themeName) {
      themeInput.value = prefs.themeName;
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
    if (colorInput && prefs.accentColor) {
      colorInput.value = prefs.accentColor;
      highlightSelectedPalette(prefs.accentColor, prefs.themeName);
    }
    var fontInput = document.getElementById('pref-font-size');
    if (fontInput && prefs.fontSize) fontInput.value = prefs.fontSize;
    var densityInput = document.getElementById('pref-density');
    if (densityInput && prefs.density) densityInput.value = prefs.density;
  }
})();
