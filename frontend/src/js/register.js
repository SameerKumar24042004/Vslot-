// This file manages the registration process, including form validation and submission of new user data.

document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('registerForm');

    registerForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!validateForm(email, password, confirmPassword)) {
            alert('Please fill in all fields correctly.');
            return;
        }
        if (password !== confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Optionally store username in Firestore
                return db.collection('users').doc(userCredential.user.uid).set({
                    username: username,
                    email: email
                });
            })
            .then(() => {
                alert('Registration successful!');
                window.location.href = 'login.html';
            })
            .catch((error) => {
                alert(error.message);
            });
    });

    function validateForm(email, password, confirmPassword) {
        return email.trim() !== '' && password.trim() !== '' && confirmPassword.trim() !== '';
    }
});