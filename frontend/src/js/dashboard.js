// dashboard.js

const timeSlots = [
    'I (8:30-10:00)', 'II (10:05-11:35)', 'III (11:40-13:10)', 
    'IV (13:15-14:45)', 'V (14:45-16:20)', 'VI (16:25-17:55)', 'VII (18:00-19:30)'
];

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let allTimetables = [];
let timetableData = {};
let compareSelection = [];
let compareMode = false;

// Get current user's email from Firebase Auth
let currentUserEmail = null;

firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
        currentUserEmail = user.email;
        loadUserTimetables(currentUserEmail);
    } else {
        // Not logged in, redirect to login
        window.location.href = 'login.html';
    }
});

// Fetch the user's pinned timetable key on load
let currentUserPinnedTableKey = null;
firebase.auth().onAuthStateChanged(async function(user) {
    if (user) {
        const userDoc = await db.collection('users').doc(user.uid).get();
        currentUserPinnedTableKey = userDoc.exists ? userDoc.data().myTimeTable : null;
        renderCarts();
        renderUserDropdown(); // <-- moved here so flash card logic works correctly
    }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    renderCarts();
    setupCompareButtons();
    setupModalEvents();
});

let cachedUserDocs = {};
let cachedTimetableDocs = {};

async function getUserDocCached(uid) {
    if (cachedUserDocs[uid]) return cachedUserDocs[uid];
    const doc = await db.collection('users').doc(uid).get();
    cachedUserDocs[uid] = doc;
    return doc;
}

async function getTimetableDocCached(email) {
    if (cachedTimetableDocs[email]) return cachedTimetableDocs[email];
    const doc = await db.collection('timetables').doc(email).get();
    cachedTimetableDocs[email] = doc;
    return doc;
}

// Render timetable cards
function renderCarts() {
    const timetableSection = document.getElementById('timetableSection');
    if (!timetableSection) return;
    timetableSection.innerHTML = '<div class="loading">Loading timetables...</div>';
    let html = '<div class="cart-row">';
    // Move pinned timetable to the front
    let timetables = [...allTimetables];
    if (currentUserPinnedTableKey) {
        const idx = timetables.findIndex(tt => tt.key === currentUserPinnedTableKey);
        if (idx > 0) {
            const [pinned] = timetables.splice(idx, 1);
            timetables.unshift(pinned);
        }
    }
    timetables.forEach((tt, idx) => {
        const selectedCount = timetableData[tt.key]?.selectedCells?.length || 0;
        const isPinned = tt.key === currentUserPinnedTableKey;
        html += `
            <div class="timetable-card ${isPinned ? 'pinned-timetable-card' : ''} ${compareSelection.includes(tt.key) ? 'selected-compare' : ''}" data-ttkey="${tt.key}">
                <h3>${tt.name}</h3>
                <div class="timetable-card-preview">
                    <span>${selectedCount} slots selected</span><br>
                    <span style="font-size: 14px; color: #666;">Click to ${compareMode ? 'select for comparison' : 'view/edit'}</span>
                </div>
                ${isPinned 
                    ? `<button class="primary-btn unpin-btn">Unpin</button><div class="pinned-badge">My Time Table</div>`
                    : (!currentUserPinnedTableKey ? `<button class="primary-btn pin-btn">Pin as My Time Table</button>` : '')
                }
            </div>
        `;
    });
    html += `
        <div class="timetable-card add-friend-card" id="addFriendCard">
            <h3>+ Add A Timetable</h3>
            <div class="timetable-card-preview">
                <span>Click to add a new timetable</span>
            </div>
        </div>
    </div>
    `;

    timetableSection.innerHTML = html;
    attachCardEventListeners();
    attachPinEventListeners();
    attachUnpinEventListeners();
}

// Attach event listeners to cards
function attachCardEventListeners() {
    document.querySelectorAll('.timetable-card:not(.add-friend-card)').forEach(card => {
        const ttkey = card.getAttribute('data-ttkey');
        card.onclick = function() {
            if (compareMode) {
                toggleCompareSelection(ttkey, card);
            } else {
                showExpandedTimetable(ttkey);
            }
        };
    });

    document.getElementById('addFriendCard').onclick = showFriendNameModal;
}

// Attach pin button event listeners
function attachPinEventListeners() {
    document.querySelectorAll('.pin-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const card = btn.closest('.timetable-card');
            const ttkey = card.getAttribute('data-ttkey');
            pinAsMyTimeTable(ttkey);
        };
    });
}

function attachUnpinEventListeners() {
    document.querySelectorAll('.unpin-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            unpinMyTimeTable();
        };
    });
}

// Toggle cell selection
function toggleCellSelection(cellElement, cellIdx, ttkey) {
    console.log('Toggling cell:', cellIdx, 'for timetable:', ttkey);
    
    // Toggle visual feedback
    cellElement.classList.toggle('selected');
    
    // Ensure timetableData structure exists
    if (!timetableData[ttkey]) {
        timetableData[ttkey] = { selectedCells: [] };
    }
    
    // Toggle selection in data
    const index = timetableData[ttkey].selectedCells.indexOf(cellIdx);
    if (index === -1) {
        // Cell wasn't selected, add it
        timetableData[ttkey].selectedCells.push(cellIdx);
        console.log('Added cell', cellIdx, 'to selection');
    } else {
        // Cell was selected, remove it
        timetableData[ttkey].selectedCells.splice(index, 1);
        console.log('Removed cell', cellIdx, 'from selection');
    }
    
    console.log('Updated selectedCells:', timetableData[ttkey].selectedCells);
}

// Generate timetable HTML with named cells
function timetableHTML(editable, ttkey) {
    const selectedCells = timetableData[ttkey]?.selectedCells || [];
    
    // Cell naming pattern: A11, B11, C11, A21, A14, B21, C21 (Monday)
    //                    D11, E11, F11, D21, E14, E21, F21 (Tuesday)
    //                    A12, B12, C12, A22, B14, B22, A24 (Wednesday)
    //                    etc.
    const cellNames = [
        // Monday
        ['A11', 'B11', 'C11', 'A21', 'A14', 'B21', 'C21'],
        // Tuesday
        ['D11', 'E11', 'F11', 'D21', 'E14', 'E21', 'F21'],
        // Wednesday
        ['A12', 'B12', 'C12', 'A22', 'B14', 'B22', 'A24'],
        // Thursday
        ['D12', 'E12', 'F12', 'D22', 'F14', 'E22', 'F22'],
        // Friday
        ['A13', 'B13', 'C13', 'A23', 'C14', 'B23', 'B24'],
        // Saturday
        ['D13', 'E13', 'F13', 'D23', 'D14', 'D24', 'E23']
    ];
    
    let html = `
        <div class="timetable-container">
            <div class="table-wrapper">
                <table>
                    <tr>
                        <th style="width: 120px;">Day/Period</th>
    `;
    
    // Add time slot headers
    timeSlots.forEach(slot => {
        html += `<th>${slot}</th>`;
    });
    html += '</tr>';
    
    // Add rows for each day
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

// Show expanded timetable for editing
function showExpandedTimetable(ttkey) {
    const expanded = document.getElementById('expandedTimetable');
    const ttObj = allTimetables.find(tt => tt.key === ttkey);
    expanded.innerHTML = `
        <div class="timetable-expanded-content">
            <span class="close-btn" onclick="closeExpandedTimetable()">&times;</span>
            <h3>${ttObj.name}</h3>
            ${timetableHTML(true, ttkey)}
            <div class="dashboard-btns">
                <button onclick="saveCurrentTimetable('${ttkey}')" class="primary-btn">Save Timetable</button>
                <button onclick="deleteTimetable('${ttkey}')" class="danger-btn">Delete Timetable</button>
            </div>
        </div>
    `;
    expanded.style.display = 'flex';
    // Attach cell click handlers for selection using data-cell-idx
    document.querySelectorAll('.timetable-cell-userA').forEach(cell => {
        const cellIdx = parseInt(cell.getAttribute('data-cell-idx'));
        cell.onclick = function() {
            toggleCellSelection(cell, cellIdx, ttkey);
        };
    });
}


// Save current timetable to Firestore
async function saveCurrentTimetable(ttkey) {
    try {
        // Check if user is authenticated
        if (!currentUserEmail) {
            alert('Error: User not authenticated. Please log in again.');
            return;
        }

        // Check if Firebase is initialized
        if (!db) {
            alert('Error: Database not initialized.');
            return;
        }

        // Validate timetable data exists
        if (!timetableData[ttkey]) {
            console.warn('No timetable data found for key:', ttkey);
            timetableData[ttkey] = { selectedCells: [] };
        }

        console.log('Saving timetable data:', { timetableData, allTimetables });

        // Save to Firestore with merge option to avoid overwriting
        await db.collection('timetables').doc(currentUserEmail).set({
            timetableData: timetableData,
            allTimetables: allTimetables,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Show custom toast instead of alert
        showToast('Timetable saved successfully!');
        closeExpandedTimetable();
        renderCarts();

    } catch (error) {
        console.error('Error saving timetable:', error);
        alert('Error saving timetable: ' + error.message);
    }
}


// Close expanded timetable
function closeExpandedTimetable() {
    document.getElementById('expandedTimetable').style.display = 'none';
}

// Delete timetable
async function deleteTimetable(ttkey) {
    if (ttkey === 'timetable_sam') {
        alert('Cannot delete your main timetable!');
        return;
    }

    if (confirm('Are you sure you want to delete this timetable?')) {
        allTimetables = allTimetables.filter(tt => tt.key !== ttkey);
        delete timetableData[ttkey];
        
        // Update Firestore
        await db.collection('timetables').doc(currentUserEmail).set({
            timetableData,
            allTimetables
        });
        
        closeExpandedTimetable();
        renderCarts();
        // If all timetables deleted, show modal again
        if (allTimetables.length === 0) {
            setTimeout(() => {
                showFriendNameModal();
                const modal = document.getElementById('friendNameModal');
                if (modal) {
                    modal.classList.add('force-add-timetable');
                    const cancelBtn = document.getElementById('cancelFriendBtn');
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    // Set modal title and placeholder for new user
                    modal.querySelector('h3').textContent = 'Add Your Timetable';
                    document.getElementById('friendNameInput').placeholder = 'Enter your name (required)';
                }
            }, 300);
        }
        // --- If the deleted timetable was pinned, unpin it ---
        if (ttkey === currentUserPinnedTableKey) {
            const user = firebase.auth().currentUser;
            if (user) {
                await db.collection('users').doc(user.uid).set({
                    myTimeTable: null
                }, { merge: true });
                currentUserPinnedTableKey = null;
                renderUserDropdown();
            }
        }
    }
}

// Store selected cells for the "add timetable" modal
let addTimetableSelectedCells = [];

// Show friend name modal (now also shows timetable layout for selection)
function showFriendNameModal() {
    const modal = document.getElementById('friendNameModal');
    const input = document.getElementById('friendNameInput');
    modal.classList.add('active');
    input.value = '';
    input.focus();
    // Reset selection for new timetable
    addTimetableSelectedCells = [];
    // Render timetable layout for selection
    renderAddTimetableTable();
    // Prevent closing modal if it's the first time (no timetables)
    if (allTimetables.length === 0) {
        modal.classList.add('force-add-timetable');
        // Hide cancel button
        const cancelBtn = document.getElementById('cancelFriendBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        // Change modal title and input placeholder for new users
        modal.querySelector('h3').textContent = 'Add Your Timetable';
        input.placeholder = 'Enter your name (required)';
    } else {
        modal.classList.remove('force-add-timetable');
        const cancelBtn = document.getElementById('cancelFriendBtn');
        if (cancelBtn) cancelBtn.style.display = '';
        // Restore modal title and input placeholder for existing users
        modal.querySelector('h3').textContent = 'Add A Timetable';
        input.placeholder = 'Enter Your friend\'s name (whose timetable you want to add)';
    }
}

// Render timetable layout in the add timetable modal
function renderAddTimetableTable() {
    const container = document.getElementById('addTimetableTablePreview');
    if (!container) return;
    // Use the same cellNames as timetableHTML
    const cellNames = [
        ['A11', 'B11', 'C11', 'A21', 'A14', 'B21', 'C21'],
        ['D11', 'E11', 'F11', 'D21', 'E14', 'E21', 'F21'],
        ['A12', 'B12', 'C12', 'A22', 'B14', 'B22', 'A24'],
        ['D12', 'E12', 'F12', 'D22', 'F14', 'E22', 'F22'],
        ['A13', 'B13', 'C13', 'A23', 'C14', 'B23', 'B24'],
        ['D13', 'E13', 'F13', 'D23', 'D14', 'D24', 'E23']
    ];
    let html = `<div class="timetable-container"><div class="table-wrapper"><table><tr><th style="width: 100px;">Day/Period</th>`;
    timeSlots.forEach(slot => { html += `<th>${slot}</th>`; });
    html += '</tr>';
    days.forEach((day, dayIdx) => {
        html += `<tr><td class="day-cell">${day}</td>`;
        timeSlots.forEach((slot, timeIdx) => {
            const cellIdx = dayIdx * timeSlots.length + timeIdx;
            const isSelected = addTimetableSelectedCells.includes(cellIdx);
            const cellClass = isSelected ? 'timetable-cell-userA selected' : 'timetable-cell-userA';
            const cellName = cellNames[dayIdx][timeIdx];
            html += `<td class="${cellClass}" data-add-cell-idx="${cellIdx}">${cellName}</td>`;
        });
        html += '</tr>';
    });
    html += '</table></div></div>';
    container.innerHTML = html;
    // Attach click handlers for selection
    container.querySelectorAll('td[data-add-cell-idx]').forEach(cell => {
        const cellIdx = parseInt(cell.getAttribute('data-add-cell-idx'));
        cell.onclick = function() {
            if (addTimetableSelectedCells.includes(cellIdx)) {
                addTimetableSelectedCells = addTimetableSelectedCells.filter(idx => idx !== cellIdx);
                cell.classList.remove('selected');
            } else {
                addTimetableSelectedCells.push(cellIdx);
                cell.classList.add('selected');
            }
        };
    });
}

// Add friend timetable (now uses selected cells from modal)
async function addFriendTimetable() {
    const input = document.getElementById('friendNameInput');
    const name = input.value.trim();
    // For new users, require name as their own name
    if (!name) {
        if (allTimetables.length === 0) {
            alert("Please enter your name.");
        } else {
            alert("Please enter a timetable name.");
        }
        return;
    }
    const friendKey = `friend_tt_${Date.now()}`;
    allTimetables.push({ key: friendKey, name });
    timetableData[friendKey] = { selectedCells: [...addTimetableSelectedCells] };
    // Update Firestore
    await db.collection('timetables').doc(currentUserEmail).set({
        timetableData,
        allTimetables
    });
    closeFriendModal();
    renderCarts();

    // --- Automatically pin the first timetable if user has only one timetable now ---
    if (allTimetables.length === 1) {
        // Pin this timetable as myTimeTable
        const user = firebase.auth().currentUser;
        if (user) {
            await db.collection('users').doc(user.uid).set({
                myTimeTable: friendKey
            }, { merge: true });
            currentUserPinnedTableKey = friendKey;
            showToast('Pinned as My Time Table!');
            renderCarts();
            renderUserDropdown();
        }
    }
}

// FIXED: Show compared timetables - now uses actual selected timetables
async function showComparedTables(ttkey1, ttkey2) {
    // Get the timetable objects
    const tt1 = allTimetables.find(tt => tt.key === ttkey1);
    const tt2 = allTimetables.find(tt => tt.key === ttkey2);
    
    // Get selected cells for both timetables from current user's data
    const selectedCells1 = timetableData[ttkey1]?.selectedCells || [];
    const selectedCells2 = timetableData[ttkey2]?.selectedCells || [];

    // Calculate clashing and free slots
    const clashingSlots = [];
    const freeSlots = [];

    for (let i = 0; i < days.length; i++) {
        for (let j = 0; j < timeSlots.length; j++) {
            const cellIdx = i * timeSlots.length + j;
            if (selectedCells1.includes(cellIdx) && selectedCells2.includes(cellIdx)) {
                clashingSlots.push({day: i, time: j});
            } else if (!selectedCells1.includes(cellIdx) && !selectedCells2.includes(cellIdx)) {
                freeSlots.push({day: i, time: j});
            }
        }
    }

    // Render the comparison
    let html = `
        <div class="compare-tables-row">
            <div>
                <h3 style="color: #fff;">${tt1.name}</h3>
                ${timetableHTML(false, ttkey1)}
            </div>
            <div>
                <h3 style="color: #fff;">${tt2.name}</h3>
                ${timetableHTML(false, ttkey2)}
            </div>
        </div>
        
        <div class="compared-table-row">
            <div >
                <h3 style="color: #fff;">Comparison Result</h3>
                ${generateComparisonTable(selectedCells1, selectedCells2, clashingSlots, freeSlots)}
            </div>
        </div>
    `;

    document.getElementById('comparisonContent').innerHTML = html;
    document.getElementById('compareResults').style.display = 'block';
    // Auto-scroll to the result area
    scrollToCompareResults();
    // Add event for Cancel button
    // const closeBtn = document.getElementById('closeCompareBtn');
    // if (closeBtn) {
    //     closeBtn.onclick = function() {
    //         document.getElementById('compareResults').style.display = 'none';
    //         compareMode = false;
    //         compareSelection = [];
    //         renderCarts();
    //         updateCompareButtons();
    //     };
    // }
}

// Scroll smoothly to the comparison results area
function scrollToCompareResults() {
    const results = document.getElementById('compareResults');
    if (results) {
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Generate comparison table
function generateComparisonTable(selected1, selected2, clashing, free) {
    let html = `
        <div class="timetable-container">
            <div class="table-wrapper">
                <table>
                    <tr>
                        <th style="width: 120px;">Day/Period</th>
    `;

    // Add time slot headers
    timeSlots.forEach(slot => {
        html += `<th>${slot}</th>`;
    });
    html += '</tr>';

    // Add rows for each day
    days.forEach((day, dayIdx) => {
        html += `<tr><td class="day-cell">${day}</td>`;
        timeSlots.forEach((slot, timeIdx) => {
            let cellClass = 'compared-table-cell';
            let cellContent = '';

            // Get the cell name (A11, B11, etc.)
            const cellNames = [
                // Monday
                ['A11', 'B11', 'C11', 'A21', 'A14', 'B21', 'C21'],
                // Tuesday
                ['D11', 'E11', 'F11', 'D21', 'E14', 'E21', 'F21'],
                // Wednesday
                ['A12', 'B12', 'C12', 'A22', 'B14', 'B22', 'A24'],
                // Thursday
                ['D12', 'E12', 'F12', 'D22', 'F14', 'E22', 'F22'],
                // Friday
                ['A13', 'B13', 'C13', 'A23', 'C14', 'B23', 'B24'],
                // Saturday
                ['D13', 'E13', 'F13', 'D23', 'D14', 'D24', 'E23']
            ];
            const cellName = cellNames[dayIdx][timeIdx];

            // Check if this cell is in clashing or free slots
            const isClash = clashing.some(s => s.day === dayIdx && s.time === timeIdx);
            const isFree = free.some(s => s.day === dayIdx && s.time === timeIdx);

            const cellIdx = dayIdx * timeSlots.length + timeIdx;
            const isUser1 = selected1.includes(cellIdx);
            const isUser2 = selected2.includes(cellIdx);

            if (isClash) {
                cellClass += ' clash';
                cellContent = `${cellName}<br>CLASH`;
            } else if (isFree) {
                cellClass += ' free';
                cellContent = `${cellName}<br>FREE`;
            } else if (isUser1) {
                cellContent = `${cellName}<br>User 1`;
            } else if (isUser2) {
                cellContent = `${cellName}<br>User 2`;
            } else {
                cellContent = cellName;
            }

            html += `<td class="${cellClass}">${cellContent}</td>`;
        });
        html += '</tr>';
    });

    html += '</table></div></div>';
    return html;
}

// Setup compare buttons
function setupCompareButtons() {
    const showCompareBtn = document.getElementById('showCompareBtn');
    const cancelCompareBtn = document.getElementById('cancelCompareBtn');
    const compareBtn = document.getElementById('compareBtn');
    const compareResults = document.getElementById('compareResults');

    // --- Add: compare popup ---
    let comparePopup = null;
    function showComparePopup() {
        if (!comparePopup) {
            comparePopup = document.createElement('div');
            comparePopup.id = 'compare-popup';
            comparePopup.textContent = 'Select 2 timetables to compare';
            comparePopup.style.position = 'fixed';
            comparePopup.style.top = '32px';
            comparePopup.style.left = '50%';
            comparePopup.style.transform = 'translateX(-50%)';
            comparePopup.style.background = '#2563eb';
            comparePopup.style.color = '#fff';
            comparePopup.style.padding = '14px 32px';
            comparePopup.style.borderRadius = '8px';
            comparePopup.style.fontSize = '1.1rem';
            comparePopup.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
            comparePopup.style.zIndex = '10000';
            comparePopup.style.transition = 'opacity 0.3s';
            comparePopup.style.opacity = '0';
            document.body.appendChild(comparePopup);
            setTimeout(() => { comparePopup.style.opacity = '1'; }, 10);
        } else {
            comparePopup.style.display = 'block';
            comparePopup.style.opacity = '1';
        }
    }
    function hideComparePopup() {
        if (comparePopup) {
            comparePopup.style.opacity = '0';
            setTimeout(() => {
                if (comparePopup) comparePopup.style.display = 'none';
            }, 300);
        }
    }

    showCompareBtn.onclick = function() {
        compareMode = true;
        compareSelection = [];
        showCompareBtn.style.display = 'none';
        cancelCompareBtn.style.display = 'inline-block';
        compareBtn.style.display = 'none';
        compareResults.style.display = 'none';
        renderCarts();
        showComparePopup(); // Show popup on entering compare mode
    };

    cancelCompareBtn.onclick = function() {
        compareMode = false;
        compareSelection = [];
        showCompareBtn.style.display = 'inline-block';
        cancelCompareBtn.style.display = 'none';
        compareBtn.style.display = 'none';
        compareResults.style.display = 'none';
        renderCarts();
        hideComparePopup(); // Hide popup if cancelling
    };

    compareBtn.onclick = function() {
        if (compareSelection.length === 2) {
            showComparedTables(compareSelection[0], compareSelection[1]);
        }
    };

    // --- Hide popup when 2 are selected ---
    // Observe compareSelection changes
    const origToggleCompareSelection = toggleCompareSelection;
    toggleCompareSelection = function(ttkey, card) {
        origToggleCompareSelection(ttkey, card);
        if (compareMode) {
            if (compareSelection.length === 2) {
                hideComparePopup();
            } else if (compareSelection.length < 2) {
                showComparePopup();
            }
        }
    };
}

// Toggle selection for comparison
function toggleCompareSelection(ttkey, card) {
    if (compareSelection.includes(ttkey)) {
        compareSelection = compareSelection.filter(k => k !== ttkey);
        card.classList.remove('selected-compare');
    } else if (compareSelection.length < 2) {
        compareSelection.push(ttkey);
        card.classList.add('selected-compare');
    } else {
        alert('You can only select 2 timetables for comparison.');
    }
    updateCompareButtons();
}

// Update compare buttons visibility
function updateCompareButtons() {
    const compareBtn = document.getElementById('compareBtn');
    if (compareSelection.length === 2) {
        compareBtn.style.display = 'inline-block';
    } else {
        compareBtn.style.display = 'none';
    }
}

// Setup modal events
function setupModalEvents() {
    const addBtn = document.getElementById('addFriendBtn');
    const cancelBtn = document.getElementById('cancelFriendBtn');
    if (addBtn) addBtn.onclick = addFriendTimetable;
    if (cancelBtn) cancelBtn.onclick = closeFriendModal;
}

// On page load, fetch user's timetables from Firestore
async function loadUserTimetables(email) {
    const userDoc = await db.collection('timetables').doc(email).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        timetableData = data.timetableData || {};
        allTimetables = data.allTimetables || [];
    } else {
        timetableData = {};
        allTimetables = [];
    }
    renderCarts();
    // --- Force add timetable modal if user has no timetables ---
    if (allTimetables.length === 0) {
        setTimeout(() => {
            showFriendNameModal();
            // Prevent closing modal by clicking outside or pressing Escape
            const modal = document.getElementById('friendNameModal');
            if (modal) {
                modal.classList.add('force-add-timetable');
                // Remove close button if any
                const cancelBtn = document.getElementById('cancelFriendBtn');
                if (cancelBtn) cancelBtn.style.display = 'none';
                // Set modal title and placeholder for new user
                modal.querySelector('h3').textContent = 'Add Your Timetable';
                document.getElementById('friendNameInput').placeholder = 'Enter your name (required)';
            }
        }, 300);
    }
}

// Save all timetables for the user to Firestore
async function saveUserTimetables(email) {
    await db.collection('timetables').doc(email).set({
        timetableData,
        allTimetables
    });
}

// Example: Compare two users' timetables by email
async function compareTimetables(email1, email2) {
    const doc1 = await db.collection('timetables').doc(email1).get();
    const doc2 = await db.collection('timetables').doc(email2).get();
    const data1 = doc1.exists ? doc1.data().timetableData : {};
    const data2 = doc2.exists ? doc2.data().timetableData : {};
    // ...compare data1 and data2 as needed...
}

// Custom toast notification
function showToast(message) {
    let toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 1100);
}

// Add toast styles
(function(){
    const style = document.createElement('style');
    style.innerHTML = `
    .custom-toast {
        position: fixed;
        top: 32px;
        left: 50%;
        transform: translateX(-50%);
        background: #2563eb;
        color: #fff;
        padding: 16px 32px;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        box-shadow: 0 4px 24px rgba(0,0,0,0.13);
        opacity: 0;
        pointer-events: none;
        z-index: 9999;
        transition: opacity 0.3s;
    }
    .custom-toast.show {
        opacity: 1;
    }
    `;
    document.head.appendChild(style);
})();

// Add CSS for pinned timetable card
(function(){
    const style = document.createElement('style');
    style.innerHTML = `
    .pinned-timetable-card {
        border: 2.5px solid #51cf66 !important;
        background: linear-gradient(135deg, #e6fff3 60%, #f8fff8 100%) !important;
        position: relative;
        box-shadow: 0 0 0 4px #b2f2e5;
    }
    .pinned-badge {
        position: absolute;
        top: 16px;
        right: 16px;
        background: #51cf66;
        color: #fff;
        font-size: 0.82rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 14px;
        box-shadow: 0 2px 8px rgba(81,207,102,0.13);
        letter-spacing: 0.5px;
        white-space: nowrap;
    }
    `;
    document.head.appendChild(style);
})();

// Save the pinned timetable key in the user's Firestore document
async function pinAsMyTimeTable(ttkey) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    await db.collection('users').doc(user.uid).set({
        myTimeTable: ttkey
    }, { merge: true });
    currentUserPinnedTableKey = ttkey;
    showToast('Pinned as My Time Table!');
    renderCarts();
    renderUserDropdown(); // update flash card
}

async function unpinMyTimeTable() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    await db.collection('users').doc(user.uid).set({
        myTimeTable: null
    }, { merge: true });
    currentUserPinnedTableKey = null;
    showToast('Unpinned!');
    renderCarts();
    renderUserDropdown(); // update flash card
}

// Fetch and display all users and their pinned timetables (only if mutually connected)
async function renderAllUsersSidebar() {
    const sidebar = document.getElementById('usersSidebar');
    if (!sidebar) return;

    // Get current user and their connections
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return;
    const currentUserDoc = await db.collection('users').doc(currentUser.uid).get();
    const currentConnections = currentUserDoc.data()?.connections || [];
    // --- Add: Get requestsReceived count for badge ---
    const requestsReceived = currentUserDoc.data()?.requestsReceived || [];
    const reqCount = requestsReceived.length;

    sidebar.innerHTML = `<h3>All Users${reqCount > 0 ? ` <span id="requestsBadge" style="background:#e3342f;color:#fff;border-radius:50%;padding:2px 10px;font-size:0.95em;vertical-align:middle;margin-left:6px;">${reqCount}</span>` : ''}</h3>`;
    const usersSnap = await db.collection('users').get();
    for (const doc of usersSnap.docs) {
        const user = doc.data();
        const userId = doc.id;
        // Skip self
        if (userId === currentUser.uid) continue;
        // Check mutual connection
        const userConnections = user.connections || [];
        const isMutual = currentConnections.includes(userId) && userConnections.includes(currentUser.uid);
        let pinnedName = '';
        if (user.myTimeTable && isMutual) {
            // Fetch pinned timetable name
            const ttDoc = await db.collection('timetables').doc(user.email).get();
            let ttName = user.myTimeTable;
            if (ttDoc.exists) {
                const allTTs = ttDoc.data().allTimetables || [];
                const pinned = allTTs.find(tt => tt.key === user.myTimeTable);
                if (pinned) ttName = pinned.name;
            }
            pinnedName = `<span class="user-tt-name">${ttName}</span>`;
        } else if (!isMutual) {
            pinnedName = '<span class="user-tt-name" style="color:#aaa;">(Not connected)</span>';
        } else {
            pinnedName = '<span class="user-tt-name" style="color:#aaa;">(No pinned timetable)</span>';
        }
        sidebar.innerHTML += `<div class="user-row" data-userid="${userId}" data-useremail="${user.email}" data-mutual="${isMutual}"><span class="user-name">${user.username || user.email}</span> ${pinnedName}</div>`;
    }
    // Add click event to show pinned timetable
    document.querySelectorAll('.user-row').forEach(row => {
        row.onclick = async function() {
            const isMutual = row.getAttribute('data-mutual') === "true";
            if (!isMutual) {
                showNotConnectedModal();
                return;
            }
            const email = row.getAttribute('data-useremail');
            const userDoc = await db.collection('users').doc(row.getAttribute('data-userid')).get();
            const user = userDoc.data();
            if (!user.myTimeTable) return;
            const ttDoc = await db.collection('timetables').doc(email).get();
            if (!ttDoc.exists) return;
            const allTTs = ttDoc.data().allTimetables || [];
            const pinned = allTTs.find(tt => tt.key === user.myTimeTable);
            if (!pinned) return;
            // Show in modal
            showPinnedTimetableModal(user.username || email, pinned, email);
        };
    });
}

// Show another user's pinned timetable in a modal
async function showPinnedTimetableModal(username, timetable, userEmail) {
    let modal = document.getElementById('pinnedTimetableModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pinnedTimetableModal';
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
        modal.innerHTML = `<div id="pinnedTimetableModalContent" style="background:#fff;padding:30px 24px;border-radius:16px;max-width:800px;width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.18);position:relative;overflow:auto;"></div>`;
        document.body.appendChild(modal);
    }
    // Fetch the user's timetableData for the pinned timetable
    let selectedCells = [];
    const ttDoc = await db.collection('timetables').doc(userEmail).get();
    if (ttDoc.exists && ttDoc.data().timetableData && ttDoc.data().timetableData[timetable.key]) {
        selectedCells = ttDoc.data().timetableData[timetable.key].selectedCells || [];
    }
    // Render timetable with correct selected cells
    const content = document.getElementById('pinnedTimetableModalContent');
    content.innerHTML = `<span style="position:absolute;top:12px;right:18px;font-size:2rem;cursor:pointer;" onclick="document.getElementById('pinnedTimetableModal').style.display='none'">&times;</span><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 8px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);width:auto;max-width:none;min-width:unset;position:relative;"><h3 style='margin-bottom:8px;'>${username}'s Pinned Timetable</h3><h4 style='margin-bottom:18px;'>${timetable.name}</h4><div style="margin-top:0;">${timetableHTMLWithSelected(false, timetable.key, selectedCells)}</div><div style="margin-top:18px;display:flex;gap:10px;"><button id="addCopyBtn" class="primary-btn">Add a copy</button><button id="cancelPinnedModalBtn" class="secondary-btn">Cancel</button></div></div>`;
    modal.style.display = 'flex';

    // Add event for Add a copy button
    const addCopyBtn = document.getElementById('addCopyBtn');
    if (addCopyBtn) {
        addCopyBtn.onclick = async function() {
            // Add this timetable to your dashboard as a new timetable
            const importedKey = `imported_tt_${Date.now()}`;
            const importedName = `${username}'s Timetable (${timetable.name})`;
            // Add to allTimetables and timetableData
            allTimetables = allTimetables.filter(tt => tt.key !== importedKey); // Remove if already exists
            allTimetables.push({ key: importedKey, name: importedName });
            timetableData[importedKey] = { selectedCells: [...selectedCells] };
            // Save to Firestore
            await db.collection('timetables').doc(currentUserEmail).set({
                timetableData,
                allTimetables
            }, { merge: true });
            // Hide modal
            modal.style.display = 'none';
            renderCarts();
            // Show toast popup (fallback to alert if not available)
            if (typeof window.showToast === "function") {
                window.showToast("Time Table copied to Dashboard");
            } else {
                alert("Time Table copied to Dashboard");
            }
        };
    }
    // Add event for Cancel button
    const cancelBtn = document.getElementById('cancelPinnedModalBtn');
    if (cancelBtn) {
        cancelBtn.onclick = function() {
            modal.style.display = 'none';
        };
    }
}

// Helper to show "not connected" modal/message
function showNotConnectedModal() {
    let modal = document.getElementById('notConnectedModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'notConnectedModal';
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
        modal.innerHTML = `<div style="background:#fff;padding:30px 24px;border-radius:16px;max-width:400px;width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.18);position:relative;overflow:auto;text-align:center;">
            <span style="position:absolute;top:12px;right:18px;font-size:2rem;cursor:pointer;" onclick="document.getElementById('notConnectedModal').style.display='none'">&times;</span>
            <h3 style="margin-bottom:12px;">You are not connected</h3>
            <div style="color:#b45309;font-size:1.1rem;">You can only view timetables of users you are mutually connected with. To get Connected add Users from the Active Users</div>
        </div>`;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

// Helper to render timetable with custom selectedCells
function timetableHTMLWithSelected(editable, ttkey, selectedCells) {
    // Cell naming pattern: A11, B11, C11, A21, A14, B21, C21 (Monday)
    //                    D11, E11, F11, D21, E14, E21, F21 (Tuesday)
    //                    A12, B12, C12, A22, B14, B22, A24 (Wednesday)
    //                    etc.
    const cellNames = [
        // Monday
        ['A11', 'B11', 'C11', 'A21', 'A14', 'B21', 'C21'],
        // Tuesday
        ['D11', 'E11', 'F11', 'D21', 'E14', 'E21', 'F21'],
        // Wednesday
        ['A12', 'B12', 'C12', 'A22', 'B14', 'B22', 'A24'],
        // Thursday
        ['D12', 'E12', 'F12', 'D22', 'F14', 'E22', 'F22'],
        // Friday
        ['A13', 'B13', 'C13', 'A23', 'C14', 'B23', 'B24'],
        // Saturday
        ['D13', 'E13', 'F13', 'D23', 'D14', 'D24', 'E23']
    ];
    
    let html = `
        <div class="timetable-container">
            <div class="table-wrapper">
                <table>
                    <tr>
                        <th style="width: 120px;">Day/Period</th>
    `;
    
    // Add time slot headers
    timeSlots.forEach(slot => {
        html += `<th>${slot}</th>`;
    });
    html += '</tr>';
    
    // Add rows for each day
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

// Render user dropdown for all users as a floating button
async function renderUserDropdown() {
    // Only render after currentUserPinnedTableKey is set (not undefined)
    if (typeof currentUserPinnedTableKey === "undefined") return;
    const container = document.getElementById('userDropdownContainer');
    if (!container) return;
    let html = `<div class="fab-dropdown">
        <button class="fab-dropbtn" id="fabUserBtn"><span style="font-size:1.3rem;vertical-align:middle;">&#128100;</span> Users</button>
        <div class="fab-dropdown-content" id="userDropdownList"></div>
    </div>`;
    // Flash card if not pinned
    if (!currentUserPinnedTableKey) {
        html += `<div id="pin-flash-card" style="position:fixed;right:48px;bottom:100px;z-index:1300;max-width:340px;background:#fffbe7;border:1.5px solid #fbbf24;color:#b45309;padding:14px 18px;border-radius:10px;box-shadow:0 2px 8px rgba(251,191,36,0.13);font-size:1.01rem;font-weight:600;">
            Please pin a timetable as your My Time Table so that you can share it with others.
        </div>`;
    }
    container.innerHTML = html;
    const list = container.querySelector('#userDropdownList');
    // Get current user and their connections
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return;
    const currentUserDoc = await db.collection('users').doc(currentUser.uid).get();
    const currentConnections = currentUserDoc.data()?.connections || [];
    const usersSnap = await db.collection('users').get();
    for (const doc of usersSnap.docs) {
        const user = doc.data();
        const userId = doc.id;
        if (userId === currentUser.uid) continue;
        const userConnections = user.connections || [];
        const isMutual = currentConnections.includes(userId) && userConnections.includes(currentUser.uid);
        list.innerHTML += `<a href="#" data-userid="${userId}" data-useremail="${user.email}" data-mutual="${isMutual}">${user.username || user.email}</a>`;
    }
    // Toggle dropdown on button click
    const fabBtn = container.querySelector('#fabUserBtn');
    fabBtn.onclick = function(e) {
        e.stopPropagation();
        list.classList.toggle('show');
    };
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!container.contains(e.target)) {
            list.classList.remove('show');
        }
    });
    // Add click event to show pinned timetable
    list.querySelectorAll('a').forEach(link => {
        link.onclick = async function(e) {
            e.preventDefault();
            list.classList.remove('show');
            const isMutual = link.getAttribute('data-mutual') === "true";
            if (!isMutual) {
                showNotConnectedModal();
                return;
            }
            const email = link.getAttribute('data-useremail');
            const userDoc = await db.collection('users').doc(link.getAttribute('data-userid')).get();
            const user = userDoc.data();
            if (!user.myTimeTable) return;
            const ttDoc = await db.collection('timetables').doc(email).get();
            if (!ttDoc.exists) return;
            const allTTs = ttDoc.data().allTimetables || [];
            const pinned = allTTs.find(tt => tt.key === user.myTimeTable);
            if (!pinned) return;
            showPinnedTimetableModal(user.username || email, pinned, email);
        };
    });
}

// Add floating dropdown styles
(function(){
    const style = document.createElement('style');
    style.innerHTML = `
    .fab-dropdown { position: fixed; bottom: 32px; right: 32px; z-index: 1200; display: flex; flex-direction: column; align-items: flex-end; }
    .fab-dropbtn { background: #667eea; color: #fff; padding: 18px 28px; border: none; border-radius: 50px; font-size: 1.1rem; cursor: pointer; font-weight: 700; box-shadow: 0 4px 18px rgba(102,126,234,0.18); transition: background 0.2s; }
    .fab-dropbtn:hover { background: #4c51bf; }
    .fab-dropdown-content { display: none; position: absolute; bottom: 60px; right: 0; background: #fff; min-width: 210px; max-height: 320px; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.18); border-radius: 14px; z-index: 1201; }
    .fab-dropdown-content.show { display: block; }
    .fab-dropdown-content a { color: #333; padding: 16px 22px; text-decoration: none; display: block; border-bottom: 1px solid #f1f1f1; font-size: 1.08rem; }
    .fab-dropdown-content a:last-child { border-bottom: none; }
    .fab-dropdown-content a:hover { background: #f3f4fa; color: #2563eb; }
    @media (max-width: 600px) {
        .fab-dropdown { bottom: 16px; right: 8px; }
        .fab-dropbtn { padding: 14px 18px; font-size: 1rem; }
        .fab-dropdown-content { min-width: 150px; }
    }
    `;
    document.head.appendChild(style);
})();

// Call sidebar render on load
window.addEventListener('DOMContentLoaded', renderAllUsersSidebar);

// Adjusted: Timetable card size so 4 cards fit per row


function newFunction() {
    (function () {
        const style = document.createElement('style');
        style.innerHTML = `
    .cart-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-start;
        gap: 18px;
    }
    .timetable-card {
        flex: 0 1 calc(25% - 18px);
        min-width: 220px !important;
        max-width: 260px !important;
        min-height: 170px !important;
        padding: 18px 16px !important;
        font-size: 1.08rem;
        margin: 12px 0 !important;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        transition: box-shadow 0.2s;
    }
    .timetable-card-preview {
        margin-top: 14px;
        margin-bottom: 14px;
        font-size: 0.98rem;
    }
    @media (max-width: 1100px) {
        .timetable-card { flex: 0 1 calc(33.33% - 18px); }
    }
    @media (max-width: 800px) {
        .timetable-card { flex: 0 1 calc(50% - 18px); }
    }
    @media (max-width: 500px) {
        .timetable-card { flex: 0 1 100%; min-width: 90vw !important; }
    }
    `;
        document.head.appendChild(style);
    })();
}
// In renderAllUsersSidebar and renderUserDropdown, mutual connection is checked before showing timetable

// Add this style to prevent closing modal by clicking outside
(function(){
    const style = document.createElement('style');
    style.innerHTML = `
    #friendNameModal.force-add-timetable {
        pointer-events: auto;
    }
    #friendNameModal.force-add-timetable .modal-content {
        pointer-events: auto;
    }
    #friendNameModal.force-add-timetable {
        background: rgba(0,0,0,0.45);
        z-index: 9999;
    }
    #friendNameModal.force-add-timetable .secondary-btn {
        display: none !important;
    }
    `;
    document.head.appendChild(style);
})();

// Add this function to close the friend name modal
function closeFriendModal() {
    const modal = document.getElementById('friendNameModal');
    if (modal) {
        modal.classList.remove('active');
    }
}
