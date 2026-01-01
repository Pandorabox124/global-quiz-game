# 🎮 AI-Powered Global Quiz Battle

A professional, real-time multiplayer trivia game built with **React**, **Firebase**, and **Google Gemini AI**. This game features a dynamic competitive system with action cards, random events, and multi-language support.

## ✨ Key Features
- **🧠 AI Question Generation:** Dynamic questions generated on-the-fly using Google Gemini Flash 1.5.
- **🌍 Multi-language Support:** Fully localized in **Arabic, English, French, and German**.
- **🔥 Interactive Action Cards:** Teams can use "Freeze", "Steal", "Double Points", or "Fault" to sabotage opponents.
- **🎁 Random Events:** A 20% chance for random "Mystery Boxes" (Bonuses, Penalties, or Extra Questions).
- **⚡ Real-time Sync:** Powered by Firebase Firestore for seamless synchronization between players.
- **🎨 Modern UI:** Deep Indigo gradient design with glassmorphism effects and responsive layout.

## 🛠️ Tech Stack
- **Frontend:** React.js (Hooks, Context, Router)
- **Backend/DB:** Firebase Firestore
- **AI Integration:** Google Generative AI (Gemini API)
- **Effects:** React Confetti & Custom CSS Animations

## 🚀 Getting Started

1. **Clone the repository:**
   ```bash
   git clone [your-repo-link]
## 🛠️ Troubleshooting & Support

If you encounter any issues while running the game, please refer to this guide:

### 1. Questions Not Loading (AI Error 429)
- **Cause:** This means the Gemini API free tier limit has been reached (Rate Limit).
- **Solution:** - Wait 60 seconds and try again.
  - For production, we recommend upgrading to a "Pay-as-you-go" plan in Google AI Studio to increase your requests per minute.
  - Ensure your API Key is valid and has "Generative Language API" enabled in Google Cloud Console.

### 2. Audio Not Working (ERR_CONNECTION_REFUSED)
- **Cause:** The browser cannot find the sound files or the dev server was interrupted.
- **Solution:** - Ensure all `.mp3` files are located in `public/sounds/`.
  - Restart your development server using `npm run dev`.

### 3. Firebase Connection Issues
- **Cause:** Incorrect Firebase configuration or expired Security Rules.
- **Solution:** - Double-check your `src/firebase.js` credentials.
  - Make sure your Firestore Security Rules are set to `allow read, write: if true;` during testing, or properly configured for production.

### 4. White Screen on Startup
- **Cause:** Missing dependencies or environment variables.
- **Solution:** - Run `npm install` again to ensure all packages (like `react-confetti`) are installed.
  - Check your browser console (F12) for any specific missing file errors.