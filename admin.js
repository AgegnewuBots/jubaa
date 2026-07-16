// Global State
let adminPassword = sessionStorage.getItem('admin_session_pwd') || '';
let currentTab = 'overview';
let cachedUsers = [];

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  if (adminPassword) {
    // If password exists, skip login screen
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('dashboard-screen').classList.add('active');
    switchTab('overview');
  } else {
    // Show login screen
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('dashboard-screen').classList.remove('active');
  }
});

// Pass Field Toggle
function togglePassField() {
  const passInput = document.getElementById('admin-pass-input');
  const eyeIcon = document.getElementById('eye-icon');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    eyeIcon.classList.remove('fa-eye');
    eyeIcon.classList.add('fa-eye-slash');
  } else {
    passInput.type = 'password';
    eyeIcon.classList.remove('fa-eye-slash');
    eyeIcon.classList.add('fa-eye');
  }
}

// REST request wrapper
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (adminPassword) {
    headers['x-admin-password'] = adminPassword;
  }
  
  const options = {
    method,
    headers
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const res = await fetch(endpoint, options);
    if (res.status === 401) {
      logoutAdmin();
      throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    console.error(`API Error (${endpoint}):`, err);
    throw err;
  }
}

// Login authentication
async function attemptLogin() {
  const pwdInput = document.getElementById('admin-pass-input');
  const errorBox = document.getElementById('login-error');
  const pwd = pwdInput.value.trim();
  
  if (!pwd) {
    errorBox.textContent = 'Please enter the admin password';
    errorBox.style.display = 'block';
    return;
  }
  
  try {
    const res = await apiRequest('/api/admin/login', 'POST', { password: pwd });
    if (res.success) {
      adminPassword = pwd;
      sessionStorage.setItem('admin_session_pwd', pwd);
      errorBox.style.display = 'none';
      document.getElementById('login-screen').classList.remove('active');
      document.getElementById('dashboard-screen').classList.add('active');
      switchTab('overview');
    }
  } catch (err) {
    errorBox.textContent = err.message || 'Invalid password';
    errorBox.style.display = 'block';
  }
}

// Log out admin
function logoutAdmin() {
  adminPassword = '';
  sessionStorage.removeItem('admin_session_pwd');
  document.getElementById('admin-pass-input').value = '';
  document.getElementById('dashboard-screen').classList.remove('active');
  document.getElementById('login-screen').classList.add('active');
}

// Tab switcher
function switchTab(tabId) {
  currentTab = tabId;
  
  // Update sidebar active classes
  const menuBtns = document.querySelectorAll('.menu-item');
  menuBtns.forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Find menu btn associated with active tab
  const activeBtn = Array.from(menuBtns).find(btn => 
    btn.getAttribute('onclick').includes(`'${tabId}'`)
  );
  if (activeBtn) activeBtn.classList.add('active');
  
  // Update tab-pane active classes
  const panes = document.querySelectorAll('.tab-pane');
  panes.forEach(pane => {
    pane.classList.remove('active');
  });
  
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.classList.add('active');
  
  // Set headers
  const heading = document.getElementById('tab-heading');
  const subheading = document.getElementById('tab-subheading');
  
  const headers = {
    overview: { h: 'Dashboard Overview', s: 'Real-time platform diagnostics and operations' },
    users: { h: 'Users Database Management', s: 'Search, audit, adjust, or suspend player profiles' },
    deposits: { h: 'Manual Deposits Processing', s: 'Verify transaction receipts on external apps then approve' },
    withdrawals: { h: 'Withdrawal Approvals', s: 'Approve or reject manual withdrawal requests safely' },
    transactions: { h: 'Transaction Stream Ledger', s: 'Audit log of deposits, bets, wins, and withdrawals' },
    games: { h: 'Game Play History Logs', s: 'Historical activity log of all user played rounds' },
    settings: { h: 'System Configurations', s: 'Customize minimum limits, game options, or lock platform' }
  };
  
  if (headers[tabId]) {
    heading.textContent = headers[tabId].h;
    subheading.textContent = headers[tabId].s;
  }
  
  // Load content
  loadTabData(tabId);
}

// Refresh current tab data
function refreshCurrentData() {
  loadTabData(currentTab);
}

// Route data dispatcher
async function loadTabData(tabId) {
  try {
    // Always update pending badges in background
    updatePendingBadges();
    
    switch (tabId) {
      case 'overview':
        await loadOverviewData();
        break;
      case 'users':
        await loadUsersData();
        break;
      case 'deposits':
        await loadDepositsData();
        break;
      case 'withdrawals':
        await loadWithdrawalsData();
        break;
      case 'transactions':
        await loadTransactionsData();
        break;
      case 'games':
        await loadGamesData();
        break;
      case 'settings':
        await loadSettingsData();
        break;
    }
  } catch (err) {
    console.error(`Error loading tab data for: ${tabId}`, err);
  }
}

// Badge counters in menu
async function updatePendingBadges() {
  try {
    const depData = await apiRequest('/api/admin/deposits');
    const withData = await apiRequest('/api/admin/withdrawals');
    
    const depCount = depData.deposits ? depData.deposits.length : 0;
    const withCount = withData.withdrawals ? withData.withdrawals.length : 0;
    
    const depBadge = document.getElementById('badge-deposits');
    if (depBadge) {
      depBadge.textContent = depCount;
      depBadge.style.display = depCount > 0 ? 'inline-flex' : 'none';
    }
    
    const withBadge = document.getElementById('badge-withdrawals');
    if (withBadge) {
      withBadge.textContent = withCount;
      withBadge.style.display = withCount > 0 ? 'inline-flex' : 'none';
    }
  } catch (e) {
    // Quiet failure
  }
}

// --- TAB DATA LOADERS ---

// Load Overview Stats
async function loadOverviewData() {
  const stats = await apiRequest('/api/admin/stats');
  
  document.getElementById('stat-total-users').textContent = stats.total_users || 0;
  document.getElementById('stat-main-balance').textContent = (stats.total_main_balance || 0).toFixed(2) + ' Br';
  document.getElementById('stat-play-balance').textContent = (stats.total_play_balance || 0).toFixed(2) + ' Br';
  
  const activeGame = document.getElementById('stat-active-game');
  if (stats.active_game) {
    activeGame.innerHTML = `<span class="green bold">Active Game (ID: ${stats.active_game.game_id})</span>`;
  } else {
    activeGame.textContent = 'No active round';
  }
  
  // Fill quick tx stream
  const txData = await apiRequest('/api/admin/transactions');
  const rows = document.getElementById('overview-tx-rows');
  if (!txData.transactions || txData.transactions.length === 0) {
    rows.innerHTML = `<tr><td colspan="4" class="text-center muted">No recent transactions</td></tr>`;
    return;
  }
  
  rows.innerHTML = txData.transactions.slice(0, 5).map(tx => {
    const classType = (tx.type === 'deposit' || tx.type === 'bingo_win') ? 'green' : 'red';
    const classStatus = tx.status === 'Done' ? 'done' : tx.status === 'Pending' ? 'pending' : 'rejected';
    return `
      <tr>
        <td>${tx.user_id}</td>
        <td><span class="bold ${classType}">${tx.type}</span></td>
        <td>${parseFloat(tx.amount || 0).toFixed(2)} Br</td>
        <td><span class="status-pill ${classStatus}">${tx.status || 'Done'}</span></td>
      </tr>
    `;
  }).join('');
}

// Load Users Database
async function loadUsersData() {
  const uData = await apiRequest('/api/admin/users');
  cachedUsers = uData.users || [];
  displayUsersTable(cachedUsers);
}

function displayUsersTable(users) {
  const rows = document.getElementById('users-table-rows');
  if (users.length === 0) {
    rows.innerHTML = `<tr><td colspan="7" class="text-center muted">No users found</td></tr>`;
    return;
  }
  
  rows.innerHTML = users.map(u => {
    const isBanned = u.status === 'banned';
    const statusClass = isBanned ? 'banned' : 'active';
    const statusText = isBanned ? 'Banned' : 'Active';
    const banActionBtn = isBanned 
      ? `<button class="btn btn-secondary" onclick="unbanUser('${u.user_id}')"><i class="fa-solid fa-user-check green"></i> Unban</button>`
      : `<button class="btn btn-secondary" onclick="banUserPrompt('${u.user_id}')"><i class="fa-solid fa-user-slash red"></i> Ban</button>`;
      
    return `
      <tr>
        <td class="bold">${u.user_id}</td>
        <td>${u.first_name || '<span class="muted">Empty</span>'}</td>
        <td class="green bold">${parseFloat(u.main_balance || 0).toFixed(2)} Br</td>
        <td class="bold" style="color:var(--purple);">${parseFloat(u.play_balance || 0).toFixed(2)} Br</td>
        <td>${u.games_played || 0}</td>
        <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary" onclick="openEditUserModal('${u.user_id}', '${u.first_name || ''}', ${u.main_balance || 0}, ${u.play_balance || 0})"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
            ${banActionBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterUsersTable() {
  const query = document.getElementById('user-search-input').value.toLowerCase().trim();
  if (!query) {
    displayUsersTable(cachedUsers);
    return;
  }
  
  const filtered = cachedUsers.filter(u => {
    const uid = String(u.user_id || '').toLowerCase();
    const name = String(u.first_name || '').toLowerCase();
    return uid.includes(query) || name.includes(query);
  });
  displayUsersTable(filtered);
}

// Load Deposits
async function loadDepositsData() {
  const dData = await apiRequest('/api/admin/deposits');
  const rows = document.getElementById('deposits-table-rows');
  
  if (!dData.deposits || dData.deposits.length === 0) {
    rows.innerHTML = `<tr><td colspan="6" class="text-center muted">No pending manual deposits</td></tr>`;
    return;
  }
  
  rows.innerHTML = dData.deposits.map(d => {
    const dateStr = d.time ? new Date(d.time).toLocaleString() : '—';
    return `
      <tr>
        <td class="muted">${d.tx_id}</td>
        <td class="bold">${d.user_id}</td>
        <td class="green bold">${parseFloat(d.amount || 0).toFixed(2)} Br</td>
        <td>${dateStr}</td>
        <td><span class="status-pill pending">Pending</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary" onclick="approveDeposit('${d.tx_id}')" style="background:rgba(16,185,129,0.15); border-color:rgba(16,185,129,0.3); color:var(--green);"><i class="fa-solid fa-check"></i> Approve</button>
            <button class="btn btn-secondary" onclick="rejectDeposit('${d.tx_id}')" style="background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.3); color:var(--red);"><i class="fa-solid fa-times"></i> Reject</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Load Withdrawals
async function loadWithdrawalsData() {
  const wData = await apiRequest('/api/admin/withdrawals');
  const rows = document.getElementById('withdrawals-table-rows');
  
  if (!wData.withdrawals || wData.withdrawals.length === 0) {
    rows.innerHTML = `<tr><td colspan="6" class="text-center muted">No pending manual withdrawals</td></tr>`;
    return;
  }
  
  rows.innerHTML = wData.withdrawals.map(w => {
    const dateStr = w.time ? new Date(w.time).toLocaleString() : '—';
    return `
      <tr>
        <td class="muted">${w.tx_id}</td>
        <td class="bold">${w.user_id}</td>
        <td class="red bold">${parseFloat(w.amount || 0).toFixed(2)} Br</td>
        <td>${dateStr}</td>
        <td><span class="status-pill pending">Pending</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary" onclick="approveWithdrawal('${w.tx_id}')" style="background:rgba(16,185,129,0.15); border-color:rgba(16,185,129,0.3); color:var(--green);"><i class="fa-solid fa-check"></i> Approve</button>
            <button class="btn btn-secondary" onclick="rejectWithdrawalPrompt('${w.tx_id}')" style="background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.3); color:var(--red);"><i class="fa-solid fa-times"></i> Reject & Refund</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Load Transaction Stream Ledger
async function loadTransactionsData() {
  const tData = await apiRequest('/api/admin/transactions');
  const rows = document.getElementById('transactions-table-rows');
  
  if (!tData.transactions || tData.transactions.length === 0) {
    rows.innerHTML = `<tr><td colspan="6" class="text-center muted">No transactions</td></tr>`;
    return;
  }
  
  rows.innerHTML = tData.transactions.map(t => {
    const classType = (t.type === 'deposit' || t.type === 'bingo_win') ? 'green' : 'red';
    const statusClass = t.status === 'Done' ? 'done' : t.status === 'Pending' ? 'pending' : 'rejected';
    const dateStr = t.time ? new Date(t.time).toLocaleString() : '—';
    return `
      <tr>
        <td class="muted">${t.tx_id || '—'}</td>
        <td class="bold">${t.user_id}</td>
        <td><span class="bold ${classType}">${t.type}</span></td>
        <td class="bold">${parseFloat(t.amount || 0).toFixed(2)} Br</td>
        <td><span class="status-pill ${statusClass}">${t.status || 'Done'}</span></td>
        <td class="muted">${dateStr}</td>
      </tr>
    `;
  }).join('');
}

// Load Games Historic logs
async function loadGamesData() {
  const gData = await apiRequest('/api/admin/games');
  const rows = document.getElementById('games-table-rows');
  
  if (!gData.games || gData.games.length === 0) {
    rows.innerHTML = `<tr><td colspan="7" class="text-center muted">No games played yet</td></tr>`;
    return;
  }
  
  rows.innerHTML = gData.games.map(g => {
    const dateStr = g.time ? new Date(g.time).toLocaleString() : '—';
    const classOutcome = g.result.startsWith('+') ? 'green bold' : 'muted';
    return `
      <tr>
        <td class="muted">${g.id || '—'}</td>
        <td class="bold">${g.user_id}</td>
        <td>${g.game_id}</td>
        <td>${parseFloat(g.entry || 0).toFixed(2)} Br</td>
        <td><span class="status-pill done">${g.status || 'Completed'}</span></td>
        <td class="${classOutcome}">${g.result}</td>
        <td class="muted">${dateStr}</td>
      </tr>
    `;
  }).join('');
}

// Load Settings
async function loadSettingsData() {
  const data = await apiRequest('/api/admin/settings');
  if (data.settings) {
    const s = data.settings;
    document.getElementById('setting-min-withdraw').value = s.min_withdraw || 150;
    document.getElementById('setting-min-deposit').value = s.min_deposit || 50;
    document.getElementById('setting-invite-commission').value = s.invite_commission || 10;
    document.getElementById('setting-maintenance').checked = Boolean(s.maintenance);
  }
}

// Save Settings
async function saveSystemSettings() {
  const min_withdraw = parseFloat(document.getElementById('setting-min-withdraw').value);
  const min_deposit = parseFloat(document.getElementById('setting-min-deposit').value);
  const invite_commission = parseFloat(document.getElementById('setting-invite-commission').value);
  const maintenance = document.getElementById('setting-maintenance').checked;
  
  try {
    const res = await apiRequest('/api/admin/settings', 'POST', {
      min_withdraw,
      min_deposit,
      invite_commission,
      maintenance
    });
    
    if (res.success) {
      const alertBox = document.getElementById('settings-alert');
      alertBox.style.display = 'block';
      setTimeout(() => alertBox.style.display = 'none', 3000);
    }
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

// Mass User Bonus Distribution
async function distributeMassBonus() {
  const amountInput = document.getElementById('mass-bonus-amount');
  const amount = parseFloat(amountInput.value);
  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid positive bonus amount (እባክዎ ትክክለኛ የጉርሻ መጠን ያስገቡ)');
    return;
  }
  
  const confirmMsg = `Are you absolutely sure you want to grant ${amount} ETB Playable Bonus to ALL registered users? This operation will modify the database for all players.\n\nለመላው ተጠቃሚዎች ${amount} ብር የጉርሻ ክፍያ ለመስጠት እርግጠኛ ነዎት?`;
  if (!confirm(confirmMsg)) {
    return;
  }
  
  try {
    const btn = document.querySelector('button[onclick="distributeMassBonus()"]');
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    
    const res = await apiRequest('/api/admin/users/grant_bonus_all', 'POST', { amount });
    
    btn.disabled = false;
    btn.innerHTML = oldText;
    
    if (res.success) {
      const alertBox = document.getElementById('bonus-alert');
      alertBox.textContent = `Success! Credited ${amount} ETB playable bonus to all registered users.`;
      alertBox.style.display = 'block';
      setTimeout(() => alertBox.style.display = 'none', 5000);
      
      // Refresh user table and statistics automatically
      loadTabData(currentTab);
    } else {
      alert('Failed to distribute bonus: ' + (res.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Network error occurred: ' + err.message);
  }
}

// --- ACTIONS & DIALOGS ---

// Edit User Modal Controls
function openEditUserModal(userId, name, mainBal, playBal) {
  document.getElementById('edit-user-id').value = userId;
  document.getElementById('edit-user-name').value = name;
  document.getElementById('edit-user-main').value = mainBal;
  document.getElementById('edit-user-play').value = playBal;
  document.getElementById('edit-user-password').value = '';
  document.getElementById('edit-user-modal').classList.add('active');
}

function closeEditUserModal() {
  document.getElementById('edit-user-modal').classList.remove('active');
}

async function submitEditUser() {
  const userId = document.getElementById('edit-user-id').value;
  const first_name = document.getElementById('edit-user-name').value.trim();
  const main_balance = parseFloat(document.getElementById('edit-user-main').value);
  const play_balance = parseFloat(document.getElementById('edit-user-play').value);
  const password = document.getElementById('edit-user-password').value.trim();
  
  if (isNaN(main_balance) || isNaN(play_balance)) {
    alert('Please enter valid balance values');
    return;
  }
  
  try {
    const res = await apiRequest('/api/admin/users/update', 'POST', {
      userId,
      first_name,
      main_balance,
      play_balance,
      password
    });
    
    if (res.success) {
      closeEditUserModal();
      loadUsersData();
    }
  } catch (err) {
    alert('Failed to update user profile: ' + err.message);
  }
}

// Ban User
async function banUserPrompt(userId) {
  const reason = prompt(`Enter reason for banning user ${userId}:`, 'Violation of fair play (Bots detected)');
  if (reason === null) return; // cancelled
  
  try {
    const res = await apiRequest('/api/admin/users/ban', 'POST', { userId, reason });
    if (res.success) {
      loadUsersData();
    }
  } catch (err) {
    alert('Failed to ban user: ' + err.message);
  }
}

// Unban User
async function unbanUser(userId) {
  try {
    const res = await apiRequest('/api/admin/users/unban', 'POST', { userId });
    if (res.success) {
      loadUsersData();
    }
  } catch (err) {
    alert('Failed to unban user: ' + err.message);
  }
}

// Approve Deposit
async function approveDeposit(txId) {
  if (!confirm('Are you sure you want to APPROVE this deposit request? (Make sure the payment arrived!)')) return;
  
  try {
    const res = await apiRequest('/api/admin/deposits/approve', 'POST', { txId });
    if (res.success) {
      loadDepositsData();
    }
  } catch (err) {
    alert('Approval failed: ' + err.message);
  }
}

// Reject Deposit
async function rejectDeposit(txId) {
  if (!confirm('Are you sure you want to REJECT this deposit request?')) return;
  
  try {
    const res = await apiRequest('/api/admin/deposits/reject', 'POST', { txId });
    if (res.success) {
      loadDepositsData();
    }
  } catch (err) {
    alert('Rejection failed: ' + err.message);
  }
}

// Approve Withdrawal
async function approveWithdrawal(txId) {
  if (!confirm('Are you sure you want to APPROVE this withdrawal? (Ensure you completed the money transfer to their phone number first!)')) return;
  
  try {
    const res = await apiRequest('/api/admin/withdrawals/approve', 'POST', { txId });
    if (res.success) {
      loadWithdrawalsData();
    }
  } catch (err) {
    alert('Approval failed: ' + err.message);
  }
}

// Reject & Refund Withdrawal
async function rejectWithdrawalPrompt(txId) {
  const reason = prompt('Enter rejection reason (shown to user):', 'Payment failed / Incorrect phone account');
  if (reason === null) return; // cancelled
  
  const refund = confirm('Refund this amount back to player\'s main balance? (Click OK to refund, Cancel to void)');
  
  try {
    const res = await apiRequest('/api/admin/withdrawals/reject', 'POST', { 
      txId, 
      refund: Boolean(refund), 
      reason 
    });
    if (res.success) {
      loadWithdrawalsData();
    }
  } catch (err) {
    alert('Rejection failed: ' + err.message);
  }
}
