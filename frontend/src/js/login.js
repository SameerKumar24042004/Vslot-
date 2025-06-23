// login.js

document.addEventListener("DOMContentLoaded", function() {
    const loginForm = document.getElementById("loginForm");

    // Show a toast notification
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

    loginForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        auth.signInWithEmailAndPassword(email, password)
            .then(async (userCredential) => {
                // Ensure user doc has required arrays for dashboard
                const user = userCredential.user;
                const userRef = db.collection('users').doc(user.uid);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    let update = {};
                    if (!Array.isArray(data.requestsSent)) update.requestsSent = [];
                    if (!Array.isArray(data.requestsReceived)) update.requestsReceived = [];
                    if (!Array.isArray(data.connections)) update.connections = [];
                    if (Object.keys(update).length > 0) {
                        await userRef.set(update, { merge: true });
                    }
                } else {
                    await userRef.set({
                        requestsSent: [],
                        requestsReceived: [],
                        connections: []
                    }, { merge: true });
                }
                showToast('Login successful');
                window.location.href = 'dashboard.html';
            })
            .catch((error) => {
                alert(error.message);
            });
    });
});