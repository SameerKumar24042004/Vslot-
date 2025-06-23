// main.js

// Simple in-memory cache for session (for user/timetable docs)
window.vslotCache = {
    userDocs: {},
    timetableDocs: {}
};

document.addEventListener('DOMContentLoaded', function() {
    // Function to show alert messages
    function showAlert(message) {
        alert(message);
    }

    // Example function to validate input fields
    function validateInput(input) {
        return input && input.trim() !== '';
    }

    // Example function to clear input fields
    function clearInputs(inputs) {
        inputs.forEach(input => {
            input.value = '';
        });
    }

    // Add any additional general functions here
});