# Vslot - Timetable Management Website

Vslot is a simple timetable management website that allows users to log in, register, and manage their schedules effectively. This project is built using HTML, CSS, and JavaScript, with Firebase for authentication and data storage.

![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/img1.png)


## Features

- User registration and login (email/password & Google)
- User dashboard to manage timetables
- View all active users
- Privacy controls: request/accept/reject access to others' timetables
- Compare, copy, and view timetables with mutual connections
- Responsive design
- Basic form validation

## Project Structure

```
Vslot
├── backend
│   └── package.json
├── frontend
│   └── src
│       ├── index.html
│       ├── login.html
│       ├── register.html
│       ├── dashboard.html
│       ├── active-users.html
│       ├── requests.html
│       ├── css/
│       │   └── styles.css
│       └── js/
│           ├── firebase-init.js
│           ├── main.js
│           ├── login.js
│           ├── register.js
│           ├── dashboard.js
│           ├── active-users.js
│           └── requests.js
├── README.md
```

## Getting Started

### 1. Clone the repository

```sh
git clone <repository-url>
cd Vslot
```

### 2. Setup Firebase

- Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
- Enable Authentication (Email/Password and Google)
- Enable Firestore Database
- Download your Firebase config and update `frontend/src/js/firebase-init.js` accordingly

### 3. Run the App

Open `frontend/src/index.html` in your browser. No build step is required.

## Usage

- Register a new account or sign in with Google
- Manage your timetable from the dashboard
- View active users and send requests to access their timetables
- Accept/reject requests from others in the Requests page
- Only mutually accepted users can view, copy, or compare timetables


## Interface 

Dashboard 
![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/Dashboard.png)

Active Users 
![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/Acrive.png)

Request
![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/Request.png)

Compare 
![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/Screenshot%202025-06-23%20223300.png)

## Firebase 

![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/img2.png)

![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/Data%20Storage.png)

![Alt Text](https://github.com/SameerKumar24042004/Vslot-/blob/main/img/users.png)

## Contributing

Pull requests and suggestions are welcome! Please open an issue to discuss any changes.

## License

[Sameer](LICENSE)
