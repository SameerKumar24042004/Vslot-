// ...firebase/init assumed loaded...

// Ensure db is available (imported from firebase-init.js)
if (typeof db === 'undefined') {
    console.error('Firestore db is not defined. Make sure firebase-init.js is loaded before requests.js');
}

async function getCurrentUserDoc() {
    const user = firebase.auth().currentUser;
    if (!user) {
        console.warn('No user logged in');
        return null;
    }
    const doc = await db.collection('users').doc(user.uid).get();
    console.log('Fetched current user doc:', doc.data());
    return { doc, data: doc.data(), uid: user.uid, email: user.email };
}

let cachedUserDocs = {};

async function getUserDocCached(uid) {
    if (cachedUserDocs[uid]) return cachedUserDocs[uid];
    const doc = await db.collection('users').doc(uid).get();
    cachedUserDocs[uid] = doc;
    return doc;
}

async function renderRequests() {
    const section = document.getElementById('requestsSection');
    if (!section) return;
    section.innerHTML = '<div class="loading">Loading requests...</div>';
    const current = await getCurrentUserDoc();
    if (!current) {
        section.innerHTML = '<div style="color:#aaa;">Please log in to see requests.</div>';
        return;
    }
    // Incoming
    const requestsReceived = current?.data?.requestsReceived || [];
    let html = '<h3>Requests Received</h3><div class="cart-row">';
    if (requestsReceived.length === 0) {
        html += `<div style="color:#aaa;">No requests received.</div>`;
    } else {
        // Batch fetch all user docs in parallel
        const requesterDocs = await Promise.all(requestsReceived.map(id => getUserDocCached(id)));
        requestsReceived.forEach((requesterId, i) => {
            const requester = requesterDocs[i].data();
            html += `
                <div class="timetable-card" style="min-width:220px;max-width:260px;">
                    <span class="user-name">${requester?.username || requester?.email || requesterId}</span>
                    <div style="margin-top:10px;">
                        <button class="primary-btn accept-req-btn" data-userid="${requesterId}">Accept</button>
                        <button class="danger-btn reject-req-btn" data-userid="${requesterId}">Reject</button>
                    </div>
                </div>
            `;
        });
    }
    html += '</div>';
    // Outgoing
    const requestsSent = current?.data?.requestsSent || [];
    if (requestsSent.length > 0) {
        html += `<h4 style="margin-top:18px;">Requests Sent</h4><div class="cart-row">`;
        // Batch fetch all user docs in parallel
        const sentDocs = await Promise.all(requestsSent.map(id => getUserDocCached(id)));
        requestsSent.forEach((targetId, i) => {
            const target = sentDocs[i].data();
            html += `
                <div class="timetable-card" style="min-width:220px;max-width:260px;">
                    <span class="user-name">${target?.username || target?.email || targetId}</span>
                    <span style="color:#aaa;font-size:0.95em;margin-top:10px;display:block;">Pending</span>
                </div>
            `;
        });
        html += '</div>';
    }
    section.innerHTML = html;

    // Accept/Reject handlers
    section.querySelectorAll('.accept-req-btn').forEach(btn => {
        btn.onclick = async () => {
            const requesterId = btn.getAttribute('data-userid');
            const current = await getCurrentUserDoc();
            await db.collection('users').doc(current.uid).set({
                connections: firebase.firestore.FieldValue.arrayUnion(requesterId),
                requestsReceived: firebase.firestore.FieldValue.arrayRemove(requesterId)
            }, { merge: true });
            await db.collection('users').doc(requesterId).set({
                connections: firebase.firestore.FieldValue.arrayUnion(current.uid),
                requestsSent: firebase.firestore.FieldValue.arrayRemove(current.uid)
            }, { merge: true });
            renderRequests();
            await updateRequestsBadge();
            // --- Add: update sidebar badge ---
            if (typeof renderAllUsersSidebar === "function") renderAllUsersSidebar();
        };
    });
    section.querySelectorAll('.reject-req-btn').forEach(btn => {
        btn.onclick = async () => {
            const requesterId = btn.getAttribute('data-userid');
            const current = await getCurrentUserDoc();
            await db.collection('users').doc(current.uid).set({
                requestsReceived: firebase.firestore.FieldValue.arrayRemove(requesterId)
            }, { merge: true });
            await db.collection('users').doc(requesterId).set({
                requestsSent: firebase.firestore.FieldValue.arrayRemove(current.uid)
            }, { merge: true });
            renderRequests();
            await updateRequestsBadge();
            // --- Add: update sidebar badge ---
            if (typeof renderAllUsersSidebar === "function") renderAllUsersSidebar();
        };
    });
}

async function updateRequestsBadge() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const userDoc = await db.collection('users').doc(user.uid).get();
    const reqCount = (userDoc.exists && Array.isArray(userDoc.data().requestsReceived)) ? userDoc.data().requestsReceived.length : 0;
    const badge = document.getElementById('requests-badge');
    if (badge) {
        if (reqCount > 0) {
            badge.textContent = reqCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
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
        margin-right: 8px;
    }
    .danger-btn {
        background: #e3342f;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 8px 18px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
    }
    `;
    document.head.appendChild(style);
})();

// Remove window.addEventListener('DOMContentLoaded', renderRequests);
// Instead, wait for auth state before rendering requests:
firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
        renderRequests();
        updateRequestsBadge();
    } else {
        // Optionally, redirect to login or show a message
        document.getElementById('requestsSection').innerHTML = '<div style="color:#aaa;">Please log in to see requests.</div>';
    }
});
