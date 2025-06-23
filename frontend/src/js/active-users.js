// ...firebase/init assumed loaded...

let cachedUserDocs = {};

async function getUserDocCached(uid) {
    if (cachedUserDocs[uid]) return cachedUserDocs[uid];
    const doc = await db.collection('users').doc(uid).get();
    cachedUserDocs[uid] = doc;
    return doc;
}

async function getCurrentUserDoc() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    const doc = await db.collection('users').doc(user.uid).get();
    return { doc, data: doc.data(), uid: user.uid, email: user.email };
}

async function renderActiveUsers() {
    const section = document.getElementById('activeUsersSection');
    if (!section) return;
    section.innerHTML = '<div class="loading">Loading users...</div>';
    const usersSnap = await db.collection('users').get();
    // Cache all user docs
    usersSnap.forEach(doc => { cachedUserDocs[doc.id] = doc; });
    const current = await getCurrentUserDoc();
    if (!current) {
        section.innerHTML = '<div style="color:#aaa;">Please log in.</div>';
        return;
    }
    const connections = current?.data?.connections || [];
    const requestsSent = current?.data?.requestsSent || [];
    let html = '<div class="cart-row">';
    usersSnap.forEach(doc => {
        const user = doc.data();
        const userId = doc.id;
        if (userId === current.uid) return;
        let btnHtml = '';
        if (connections.includes(userId)) {
            // Check if mutual connection
            const userConnections = user.connections || [];
            const isMutual = connections.includes(userId) && userConnections.includes(current.uid);
            if (isMutual) {
                btnHtml = `
                    <button class="danger-btn unfriend-btn" data-userid="${userId}" style="margin-left:8px;">Unfriend</button>
                    <button class="view-tt-btn green-btn" data-userid="${userId}" data-useremail="${user.email}" style="margin-left:8px;padding:8px 18px;">View Time table</button>
                `;
            } else {
                btnHtml = `
                    <span style="color:#aaa;font-size:0.95em;">Waiting for acceptance</span>
                    <button class="danger-btn unfriend-btn" data-userid="${userId}" style="margin-left:8px;">Unfriend</button>
                `;
            }
        } else if (requestsSent.includes(userId)) {
            btnHtml = `
                <span style="color:#aaa;font-size:0.95em;">Requested</span>
                <button class="secondary-btn withdraw-req-btn" data-userid="${userId}" data-useremail="${user.email}" style="margin-left:8px;">Withdraw</button>
            `;
        } else {
            btnHtml = `<button class="primary-btn request-tt-btn" data-userid="${userId}" data-useremail="${user.email}">Request to see Timetable</button>`;
        }
        html += `
            <div class="timetable-card" style="min-width:220px;max-width:260px;">
                <h3>${user.username || user.email || 'Unknown User'}</h3>
                <div style="margin:10px 0 18px 0;">${btnHtml}</div>
            </div>
        `;
    });
    html += '</div>';
    section.innerHTML = html;

    // Attach handlers
    section.querySelectorAll('.request-tt-btn').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-userid');
            const current = await getCurrentUserDoc();
            if (userId === current.uid) return;
            await db.collection('users').doc(current.uid).set({
                requestsSent: firebase.firestore.FieldValue.arrayUnion(userId)
            }, { merge: true });
            await db.collection('users').doc(userId).set({
                requestsReceived: firebase.firestore.FieldValue.arrayUnion(current.uid)
            }, { merge: true });
            renderActiveUsers();
        };
    });
    section.querySelectorAll('.withdraw-req-btn').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-userid');
            const current = await getCurrentUserDoc();
            if (userId === current.uid) return;
            // Remove from requestsSent (current user) and requestsReceived (target user)
            await db.collection('users').doc(current.uid).set({
                requestsSent: firebase.firestore.FieldValue.arrayRemove(userId)
            }, { merge: true });
            await db.collection('users').doc(userId).set({
                requestsReceived: firebase.firestore.FieldValue.arrayRemove(current.uid)
            }, { merge: true });
            renderActiveUsers();
        };
    });
    section.querySelectorAll('.view-tt-btn').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-userid');
            const userEmail = btn.getAttribute('data-useremail');
            // Fetch target user's doc to get username and myTimeTable
            const targetDoc = await db.collection('users').doc(userId).get();
            const target = targetDoc.data();
            if (!target || !target.myTimeTable) {
                alert("This user has not pinned a timetable.");
                return;
            }
            // Fetch timetable name
            const ttDoc = await db.collection('timetables').doc(userEmail).get();
            if (!ttDoc.exists) {
                alert("Timetable not found.");
                return;
            }
            const allTTs = ttDoc.data().allTimetables || [];
            const pinned = allTTs.find(tt => tt.key === target.myTimeTable);
            if (!pinned) {
                alert("Pinned timetable not found.");
                return;
            }
            // Fetch selectedCells for the pinned timetable
            const selectedCells = (ttDoc.data().timetableData && ttDoc.data().timetableData[pinned.key])
                ? ttDoc.data().timetableData[pinned.key].selectedCells || []
                : [];
            // Render modal
            let modal = document.getElementById('activeUserPinnedTimetableModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'activeUserPinnedTimetableModal';
                modal.style.position = 'fixed';
                modal.style.top = '0';
                modal.style.left = '0';
                modal.style.width = '100vw';
                modal.style.height = '100vh';
                modal.style.background = 'rgba(0,0,0,0.4)';
                modal.style.zIndex = '9999';
                modal.style.display = 'flex';
                modal.style.alignItems = 'center';
                modal.style.justifyContent = 'center';
                modal.innerHTML = `<div id="activeUserPinnedTimetableModalContent" style="background:#fff;padding:30px 24px;border-radius:16px;max-width:800px;width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.18);position:relative;overflow:auto;"></div>`;
                document.body.appendChild(modal);
            }
            // Timetable HTML helper
            function timetableHTMLWithSelected(selectedCells) {
                const timeSlots = [
                    'I (8:30-10:00)', 'II (10:05-11:35)', 'III (11:40-13:10)', 
                    'IV (13:15-14:45)', 'V (14:45-16:20)', 'VI (16:25-17:55)', 'VII (18:00-19:30)'
                ];
                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const cellNames = [
                    ['A11', 'B11', 'C11', 'A21', 'A14', 'B21', 'C21'],
                    ['D11', 'E11', 'F11', 'D21', 'E14', 'E21', 'F21'],
                    ['A12', 'B12', 'C12', 'A22', 'B14', 'B22', 'A24'],
                    ['D12', 'E12', 'F12', 'D22', 'F14', 'E22', 'F22'],
                    ['A13', 'B13', 'C13', 'A23', 'C14', 'B23', 'B24'],
                    ['D13', 'E13', 'F13', 'D23', 'D14', 'D24', 'E23']
                ];
                let html = `<div class="timetable-container"><div class="table-wrapper"><table><tr><th style="width: 120px;">Day/Period</th>`;
                timeSlots.forEach(slot => { html += `<th>${slot}</th>`; });
                html += '</tr>';
                days.forEach((day, dayIdx) => {
                    html += `<tr><td class="day-cell">${day}</td>`;
                    timeSlots.forEach((slot, timeIdx) => {
                        const cellIdx = dayIdx * timeSlots.length + timeIdx;
                        const isSelected = selectedCells.includes(cellIdx);
                        const cellClass = isSelected ? 'timetable-cell-userA selected' : 'timetable-cell-userA';
                        const cellName = cellNames[dayIdx][timeIdx];
                        html += `<td class="${cellClass}" data-cell-idx="${cellIdx}">${cellName}</td>`;
                    });
                    html += '</tr>';
                });
                html += '</table></div></div>';
                return html;
            }
            // Modal content
            const content = document.getElementById('activeUserPinnedTimetableModalContent');
            content.innerHTML = `
                <span style="position:absolute;top:12px;right:18px;font-size:2rem;cursor:pointer;" id="closeActiveUserPinnedModalBtn">&times;</span>
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 8px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);width:auto;max-width:none;min-width:unset;position:relative;">
                    <h3 style='margin-bottom:8px;'>${target.username || userEmail}'s Pinned Timetable</h3>
                    <h4 style='margin-bottom:18px;'>${pinned.name}</h4>
                    <div style="margin-top:0;">${timetableHTMLWithSelected(selectedCells)}</div>
                    <div style="margin-top:18px;display:flex;gap:10px;">
                        <button id="copyActiveUserTTBtn" class="primary-btn green-btn">Copy Timetable</button>
                        <button id="closeActiveUserPinnedModalBtn2" class="secondary-btn">Close</button>
                    </div>
                </div>
            `;
            modal.style.display = 'flex';
            // Copy timetable logic
            document.getElementById('copyActiveUserTTBtn').onclick = async function() {
                // Add this timetable to your dashboard as a new timetable
                const importedKey = `imported_tt_${Date.now()}`;
                const importedName = `${target.username || userEmail}'s Timetable (${pinned.name})`;
                // Fetch your own timetables
                const currentUser = firebase.auth().currentUser;
                if (!currentUser) return;
                const userDoc = await db.collection('timetables').doc(currentUser.email).get();
                let allTimetables = userDoc.exists ? (userDoc.data().allTimetables || []) : [];
                let timetableData = userDoc.exists ? (userDoc.data().timetableData || {}) : {};
                allTimetables = allTimetables.filter(tt => tt.key !== importedKey);
                // Add codebase property to the imported timetable
                allTimetables.push({ 
                    key: importedKey, 
                    name: importedName, 
                    codebase: { 
                        userEmail: userEmail, 
                        timetableKey: pinned.key 
                    } 
                });
                timetableData[importedKey] = { selectedCells: [...selectedCells] };
                await db.collection('timetables').doc(currentUser.email).set({
                    timetableData,
                    allTimetables
                }, { merge: true });
                modal.style.display = 'none';
                // Show a temporary popup that disappears after 1 second (now at top)
                let toast = document.createElement('div');
                toast.textContent = "Time Table copied to Dashboard";
                toast.style.position = 'fixed';
                toast.style.top = '32px';
                toast.style.left = '50%';
                toast.style.transform = 'translateX(-50%)';
                toast.style.background = '#2563eb';
                toast.style.color = '#fff';
                toast.style.padding = '14px 32px';
                toast.style.borderRadius = '8px';
                toast.style.fontSize = '1.1rem';
                toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
                toast.style.zIndex = '10000';
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.remove();
                }, 1000);
                // Optionally show a toast or reload dashboard
                // if (typeof showToast === "function") showToast("Timetable copied!");
            };
            // Close modal logic
            document.getElementById('closeActiveUserPinnedModalBtn').onclick =
            document.getElementById('closeActiveUserPinnedModalBtn2').onclick = function() {
                modal.style.display = 'none';
            };
        };
    });
    section.querySelectorAll('.unfriend-btn').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-userid');
            const current = await getCurrentUserDoc();
            if (!current || userId === current.uid) return;
            // Remove each other from connections
            await db.collection('users').doc(current.uid).set({
                connections: firebase.firestore.FieldValue.arrayRemove(userId)
            }, { merge: true });
            await db.collection('users').doc(userId).set({
                connections: firebase.firestore.FieldValue.arrayRemove(current.uid)
            }, { merge: true });
            renderActiveUsers();
        };
    });
}

// Add minimal CSS for cart-row and timetable-card if not present
(function(){
    const style = document.createElement('style');
    style.innerHTML = `
    .cart-row {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        margin-top: 18px;
    }
    .timetable-card {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.07);
        padding: 18px 16px;
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 220px;
        max-width: 260px;
        flex: 0 1 calc(25% - 18px);
    }
    .primary-btn {
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 8px 18px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        margin-top: 8px;
    }
    .primary-btn:disabled {
        background: #bbb;
        cursor: not-allowed;
    }
    .green-btn {
        background: #22c55e !important;
        color: #fff !important;
        border: none;
        border-radius: 6px;
        padding: 8px 18px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        margin-top: 8px;
        transition: background 0.2s;
    }
    .green-btn:hover {
        background: #16a34a !important;
    }
    .secondary-btn {
        background: #f3f4fa;
        color: #333;
        border: none;
        border-radius: 6px;
        padding: 8px 18px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        margin-top: 8px;
        transition: background 0.2s;
    }
    .secondary-btn:hover {
        background: #e5e7eb;
    }
    .timetable-cell-userA.selected {
        background: #d1fae5 !important;
        color: #065f46 !important;
        font-weight: bold;
    }
    `;
    document.head.appendChild(style);
})();

// Instead, wait for auth state before rendering active users:
firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
        renderActiveUsers();
    } else {
        document.getElementById('activeUsersSection').innerHTML = '<div style="color:#aaa;">Please log in.</div>';
    }
});
