import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import CreateRoom from "./CreateRoom"; // ملفك الحالي
import GamePlay from "./GamesPlay";     // الصفحة التي سننشئها الآن

function App() {
  return (
    <Router>
      <Routes>
        {/* الصفحة الرئيسية: إنشاء الغرفة */}
        <Route path="/" element={<CreateRoom />} />
        
        {/* صفحة اللعب: تفتح عند الضغط على زر ابدأ */}
        <Route path="/game/:roomId" element={<GamePlay />} />
      </Routes>
    </Router>
  );
}

export default App;