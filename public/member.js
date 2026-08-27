const PEAK_START = 7;  // 7 AM
const PEAK_END = 19;   // 7 PM
const BAYS = 5;
const TOKEN_KEY = 'gymmy_token';

let currentDate = new Date();
let selectedDate = null;
let selectedDuration = null;
let selectedTime = null;
let selectedBay = null;
let currentUser = null;
let allBookings = [];
let myBookings = [];

function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
}

async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || 'Request failed');
        err.status = res.status;
        throw err;
    }
    return data;
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatHour(h) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:00 ${ampm}`;
}

function timesOverlap(s1, d1, s2, d2) {
    return s1 < s2 + d2 && s2 < s1 + d1;
}

function isBayFree(date, bay, start, duration) {
    return !allBookings.some(b =>
        b.date === date &&
        String(b.bay) === String(bay) &&
        timesOverlap(b.start, b.duration, start, duration)
    );
}

function freeBaysForSlot(date, start, duration) {
    const free = [];
    for (let i = 1; i <= BAYS; i++) {
        if (isBayFree(date, i, start, duration)) free.push(String(i));
    }
    return free;
}

function dateHasBookings(dateStr) {
    return allBookings.some(b => b.date === dateStr);
}

function bookingsOnDate(dateStr) {
    return allBookings
        .filter(b => b.date === dateStr)
        .sort((a, b) => a.start - b.start || Number(a.bay) - Number(b.bay));
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
}

function isAdmin() {
    return currentUser && currentUser.role === 'admin';
}

function showMsg(id, text, ok) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = ok
        ? 'mt-4 p-4 rounded-xl text-center font-medium bg-gymmy-green/20 text-gymmy-green'
        : 'mt-4 p-4 rounded-xl text-center font-medium bg-red-500/20 text-red-400';
    el.classList.remove('hidden');
}

async function loadBookings() {
    const data = await api('/api/bookings');
    allBookings = data.bookings || [];
    myBookings = allBookings.filter(b => b.username === currentUser.username);
}

document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.classList.add('hidden');
    try {
        const data = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('login-username').value.trim(),
                password: document.getElementById('login-password').value
            })
        });
        localStorage.setItem(TOKEN_KEY, data.token);
        currentUser = data.user;
        await showDashboard();
    } catch (ex) {
        err.textContent = ex.message;
        err.classList.remove('hidden');
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
});

async function showDashboard() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('nav-user').classList.remove('hidden');
    document.getElementById('nav-username').textContent = currentUser.username;
    document.getElementById('welcome-text').textContent = `Welcome, ${currentUser.username}`;
    if (isAdmin()) document.getElementById('admin-tab-btn').classList.remove('hidden');
    fillProfileForm();
    const me = await api('/api/me');
    document.getElementById('hours-left').textContent = me.peakHoursLeft;
    await loadBookings();
    renderCalendar();
    renderBookingsList();
    if (isAdmin()) {
        await renderAccountsList();
        renderAdminBookings();
        await renderAdminMessages();
    }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('tab-book').classList.toggle('hidden', tab !== 'book');
        document.getElementById('tab-profile').classList.toggle('hidden', tab !== 'profile');
        document.getElementById('tab-admin').classList.toggle('hidden', tab !== 'admin');
    });
});

document.getElementById('prev-month').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
};
document.getElementById('next-month').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
};

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    document.getElementById('month-title').textContent =
        currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="calendar-day"></div>`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isPast = date < today;
        const isSelected = selectedDate === dateStr;
        const hasBookings = dateHasBookings(dateStr);

        const div = document.createElement('div');
        div.className = `calendar-day relative flex items-center justify-center rounded-xl text-sm font-medium
            ${isPast ? 'text-gray-600' : 'available cursor-pointer hover:bg-gymmy-green/20'}
            ${isSelected ? 'bg-gymmy-green text-black' : ''}`;
        const dotColor = isSelected ? 'bg-black/50' : 'bg-gymmy-green';
        div.innerHTML = `${day}${hasBookings && !isPast ? `<span class="absolute bottom-1 w-1.5 h-1.5 rounded-full ${dotColor}"></span>` : ''}`;
        if (!isPast) div.onclick = () => selectDate(dateStr, date);
        grid.appendChild(div);
    }
}

async function selectDate(dateStr, dateObj) {
    selectedDate = dateStr;
    selectedTime = null;
    selectedBay = null;
    selectedDuration = null;
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('bg-gymmy-green', 'text-black'));
    document.getElementById('selected-date-text').textContent = dateObj.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    document.getElementById('booking-panel').classList.remove('hidden');
    document.getElementById('confirm-booking').disabled = true;
    document.getElementById('booking-message').classList.add('hidden');
    document.getElementById('bay-section').classList.add('hidden');
    await loadBookings();
    renderCalendar();
    renderDayBookings();
    renderTimeSlots();
}

function renderDayBookings() {
    const list = document.getElementById('day-bookings');
    const dayList = bookingsOnDate(selectedDate);
    if (dayList.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-sm">Nothing booked yet — all 5 bays are open.</p>';
        return;
    }
    list.innerHTML = dayList.map(b => `
        <div class="flex justify-between items-center bg-black/30 border border-white/10 rounded-xl px-4 py-2.5">
            <div>
                <p class="font-medium">Bay ${b.bay} · ${formatHour(b.start)} – ${formatHour(b.start + b.duration)}</p>
                <p class="text-xs text-gray-400">${b.duration}h · booked by ${escapeHtml(b.username)}</p>
            </div>
            <span class="text-xs text-red-400 font-medium">Taken</span>
        </div>
    `).join('');
}

function renderTimeSlots() {
    const container = document.getElementById('time-slots');
    container.innerHTML = '';
    selectedTime = null;
    selectedBay = null;
    document.getElementById('bay-section').classList.add('hidden');
    document.getElementById('confirm-booking').disabled = true;

    if (!selectedDuration) {
        container.innerHTML = '<p class="col-span-full text-gray-500 text-sm">Select a duration first</p>';
        return;
    }

    let shown = 0;
    for (let h = 6; h <= 22 - selectedDuration; h++) {
        const free = freeBaysForSlot(selectedDate, h, selectedDuration);
        if (free.length === 0) continue;
        shown++;
        const isPeak = h >= PEAK_START && h < PEAK_END;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'time-slot py-2.5 px-1 rounded-xl border border-white/20 text-sm';
        btn.textContent = `${formatHour(h)} ${isPeak ? '· Peak' : '· Off'} · ${free.length} open`;
        btn.onclick = () => {
            selectedTime = h;
            selectedBay = null;
            document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            renderBayButtons(free);
            checkReady();
        };
        container.appendChild(btn);
    }

    if (shown === 0) {
        container.innerHTML = '<p class="col-span-full text-gray-500 text-sm">No open start times left for this duration.</p>';
    }
}

function renderBayButtons(freeBays) {
    const section = document.getElementById('bay-section');
    const wrap = document.getElementById('bay-buttons');
    section.classList.remove('hidden');
    wrap.innerHTML = '';
    freeBays.forEach(bay => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bay-btn py-3 rounded-xl border border-white/20';
        btn.textContent = `Bay ${bay}`;
        btn.onclick = () => {
            selectedBay = bay;
            wrap.querySelectorAll('.bay-btn').forEach(b => b.classList.remove('bg-gymmy-green', 'text-black'));
            btn.classList.add('bg-gymmy-green', 'text-black');
            checkReady();
        };
        wrap.appendChild(btn);
    });
}

document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.onclick = () => {
        selectedDuration = parseInt(btn.dataset.hours, 10);
        document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('bg-gymmy-green', 'text-black'));
        btn.classList.add('bg-gymmy-green', 'text-black');
        renderTimeSlots();
        checkReady();
    };
});

function checkReady() {
    document.getElementById('confirm-booking').disabled =
        !(selectedDate && selectedDuration && selectedTime !== null && selectedBay);
}

document.getElementById('confirm-booking').onclick = async () => {
    try {
        const data = await api('/api/bookings', {
            method: 'POST',
            body: JSON.stringify({
                date: selectedDate,
                start: selectedTime,
                duration: selectedDuration,
                bay: selectedBay
            })
        });
        document.getElementById('hours-left').textContent = data.peakHoursLeft;
        await loadBookings();
        renderBookingsList();
        renderDayBookings();
        renderCalendar();
        if (isAdmin()) renderAdminBookings();
        showMsg('booking-message', `Booked Bay ${selectedBay}. That slot is now hidden for everyone.`, true);
        renderTimeSlots();
    } catch (ex) {
        showMsg('booking-message', ex.message, false);
        await loadBookings();
        renderDayBookings();
        renderTimeSlots();
    }
};

function renderBookingsList() {
    const list = document.getElementById('bookings-list');
    const todayStr = formatDate(new Date());
    const upcoming = myBookings
        .filter(b => b.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

    if (upcoming.length === 0) {
        list.innerHTML = '<p class="text-gray-500">No upcoming bookings</p>';
        return;
    }

    list.innerHTML = upcoming.map(b => `
        <div class="flex justify-between items-center bg-gymmy-slate/50 border border-white/10 rounded-xl px-4 py-3">
            <div>
                <p class="font-medium">${b.date} · Bay ${b.bay}</p>
                <p class="text-sm text-gray-400">${formatHour(b.start)} – ${formatHour(b.start + b.duration)} (${b.duration}h)</p>
            </div>
            <button onclick="cancelBooking(${b.id})" class="text-red-400 text-sm">Cancel</button>
        </div>
    `).join('');
}

async function cancelBooking(id) {
    try {
        await api('/api/bookings/' + id, { method: 'DELETE' });
        const me = await api('/api/me');
        document.getElementById('hours-left').textContent = me.peakHoursLeft;
        await loadBookings();
        renderBookingsList();
        renderCalendar();
        if (selectedDate) {
            renderDayBookings();
            renderTimeSlots();
        }
        if (isAdmin()) renderAdminBookings();
    } catch (ex) {
        alert(ex.message);
    }
}

function fillProfileForm() {
    document.getElementById('profile-username').value = currentUser.username;
    document.getElementById('profile-email').value = currentUser.email || '';
    document.getElementById('profile-phone').value = currentUser.phone || '';
    document.getElementById('profile-address').value = currentUser.address || '';
}

document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('profile-message');
    try {
        const data = await api('/api/profile', {
            method: 'PUT',
            body: JSON.stringify({
                email: document.getElementById('profile-email').value.trim(),
                phone: document.getElementById('profile-phone').value.trim(),
                address: document.getElementById('profile-address').value.trim()
            })
        });
        currentUser = data.user;
        msg.textContent = 'Profile saved.';
        msg.className = 'text-sm text-gymmy-green';
        msg.classList.remove('hidden');
    } catch (ex) {
        msg.textContent = ex.message;
        msg.className = 'text-sm text-red-400';
        msg.classList.remove('hidden');
    }
});

document.getElementById('create-account-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('create-message');
    try {
        const username = document.getElementById('new-username').value.trim();
        await api('/api/accounts', {
            method: 'POST',
            body: JSON.stringify({
                username,
                password: document.getElementById('new-password').value,
                email: document.getElementById('new-email').value.trim(),
                phone: document.getElementById('new-phone').value.trim(),
                address: document.getElementById('new-address').value.trim()
            })
        });
        document.getElementById('create-account-form').reset();
        msg.textContent = `Account “${username}” created.`;
        msg.className = 'text-sm text-gymmy-green';
        msg.classList.remove('hidden');
        await renderAccountsList();
    } catch (ex) {
        msg.textContent = ex.message;
        msg.className = 'text-sm text-red-400';
        msg.classList.remove('hidden');
    }
});

async function renderAccountsList() {
    const list = document.getElementById('accounts-list');
    const data = await api('/api/accounts');
    list.innerHTML = data.users.map(u => `
        <div class="bg-black/30 border border-white/10 rounded-xl px-4 py-3">
            <p class="font-medium">${escapeHtml(u.username)} ${u.role === 'admin' ? '<span class="text-gymmy-gold text-xs">ADMIN</span>' : ''}</p>
            <p class="text-xs text-gray-400">${escapeHtml(u.email || 'No email')} · ${escapeHtml(u.phone || 'No phone')}</p>
            <p class="text-xs text-gray-500">${escapeHtml(u.address || 'No address')}</p>
        </div>
    `).join('');
}

function renderAdminBookings() {
    const list = document.getElementById('admin-bookings-list');
    const todayStr = formatDate(new Date());
    const upcoming = [...allBookings].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    if (upcoming.length === 0) {
        list.innerHTML = '<p class="text-gray-500">No bookings yet</p>';
        return;
    }
    list.innerHTML = upcoming.map(b => `
        <div class="flex justify-between items-center bg-black/30 border border-white/10 rounded-xl px-4 py-3">
            <div>
                <p class="font-medium">${b.date} · Bay ${b.bay} · ${escapeHtml(b.username)}</p>
                <p class="text-sm text-gray-400">${formatHour(b.start)} – ${formatHour(b.start + b.duration)} (${b.duration}h)${b.date < todayStr ? ' · past' : ''}</p>
            </div>
            <button onclick="cancelBooking(${b.id})" class="text-red-400 text-sm">Cancel</button>
        </div>
    `).join('');
}

async function renderAdminMessages() {
    const list = document.getElementById('admin-messages-list');
    try {
        const data = await api('/api/messages');
        if (!data.messages.length) {
            list.innerHTML = '<p class="text-gray-500">No messages yet</p>';
            return;
        }
        list.innerHTML = data.messages.map(m => `
            <div class="bg-black/30 border border-white/10 rounded-xl px-4 py-3">
                <p class="font-medium">${escapeHtml(m.name)} · ${escapeHtml(m.email)}</p>
                <p class="text-xs text-gray-400">${escapeHtml(m.phone || 'No phone')} · ${escapeHtml(m.createdAt || '')}</p>
                <p class="text-sm text-gray-300 mt-1">${escapeHtml(m.message)}</p>
            </div>
        `).join('');
    } catch {
        list.innerHTML = '<p class="text-gray-500">Could not load messages</p>';
    }
}

(async function init() {
    if (!token()) return;
    try {
        const me = await api('/api/me');
        currentUser = me.user;
        await showDashboard();
    } catch {
        localStorage.removeItem(TOKEN_KEY);
    }
})();
