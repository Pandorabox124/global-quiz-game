import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db } from "./firebase";
import { doc, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import './GamesPlay.css'; 

// --- الإعداد المباشر (تم وضع المفتاح هنا بناءً على طلبك) ---
const API_KEY = "AIzaSyC6UqwzfzdL1oLQJy7TTcc_G8MP98FE4FI";
const genAI = new GoogleGenerativeAI(API_KEY);

// استخدام الموديل المستقر لضمان عدم حدوث خطأ 404
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

export default function GamesPlay() {
  const { roomId } = useParams();
  
  // الحالات (States)
  const [room, setRoom] = useState(null);
  const [timer, setTimer] = useState(60);
  const [isActive, setIsActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [allCategories, setAllCategories] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showActionCard, setShowActionCard] = useState(false);
  const [randomAction, setRandomAction] = useState(null);
  const [usedQuestions, setUsedQuestions] = useState([]);
  const [extraTurnActive, setExtraTurnActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // مراجع ملفات الصوت
  const sndTick = useRef(new Audio("/sounds/button-41.mp3"));
  const sndOpen = useRef(new Audio("/sounds/button-3.mp3"));
  const sndCorrect = useRef(new Audio("/sounds/bell-ringing-05.mp3"));
  const sndWrong = useRef(new Audio("/sounds/button-10.mp3"));
  const sndAction = useRef(new Audio("/sounds/button-19.mp3"));

  // 1. الاتصال بـ Firebase لجلب بيانات الغرفة
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "rooms", roomId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoom(data);
        const merged = Array.from(new Set([...(data?.team1?.cats || []), ...(data?.team2?.cats || [])]));
        setAllCategories(merged);
      }
    });
    return () => unsub();
  }, [roomId]);

  // 2. منطق العداد الزمني
  useEffect(() => {
    let interval = null;
    if (isActive && timer > 0) {
      interval = setInterval(() => {
        setTimer(t => t - 1);
        sndTick.current.currentTime = 0;
        sndTick.current.play().catch(() => {}); 
      }, 1000);
    } else if (timer === 0 && isActive) {
      setShowAnswer(true);
      setIsActive(false);
    }
    return () => clearInterval(interval);
  }, [isActive, timer]);

  // دالة توليد السؤال (تم إصلاح استلام الـ Response هنا)
  const generateAIQuestion = async (catName, points) => {
    setIsGenerating(true);
    const diff = points === 200 ? "سهل جداً" : points === 400 ? "متوسط" : "صعب وللأذكياء";
    
    const prompt = `أنت خبير مسابقات محترف. أنتج سؤالاً واحداً في فئة "${catName}". المستوى: ${diff}. 
    يجب أن يكون الرد بصيغة JSON فقط كالتالي: {"question": "نص السؤال", "answer": "الإجابة"}`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response; // انتظار الاستجابة
      const text = response.text(); // استخراج النص
      
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error("AI Error:", error);
      return { question: "خطأ في الاتصال بالذكاء الاصطناعي، يرجى إعادة المحاولة.", answer: "خطأ فني" };
    } finally {
      setIsGenerating(false);
    }
  };

  const openQuestion = async (catName, points, teamKey) => {
    if (room?.[teamKey]?.isFrozen) return alert("الفريق مجمد!");
    sndOpen.current.play().catch(() => {});

    const roomRef = doc(db, "rooms", roomId);
    let finalTeam = teamKey;

    if (room?.stealNextQuestion && room.stealNextQuestion !== teamKey) {
      finalTeam = room.stealNextQuestion;
      await updateDoc(roomRef, { stealNextQuestion: null });
    }

    const qId = `${catName}-${points}-${teamKey}`;
    if (usedQuestions.includes(qId)) return;

    // منطق بطاقات الأكشن العشوائية
    if (!extraTurnActive && Math.random() < 0.15) {
      const cards = [
        { type: "BONUS", ar: "🎁 مضاعفة النقاط!", en: "🎁 Points Doubled!" },
        { type: "PENALTY", ar: "❌ خصم 200 نقطة!", en: "❌ -200 Points!" },
        { type: "EXTRA", ar: "➕ سؤال إضافي!", en: "➕ Extra Question!" },
        { type: "DELETE", ar: "🗑️ حذف السؤال!", en: "🗑️ Question Deleted!" }
      ];
      const card = cards[Math.floor(Math.random() * cards.length)];
      setRandomAction({ ...card, text: room?.lang === 'en' ? card.en : card.ar });
      setShowActionCard(true);
      sndAction.current.play().catch(() => {});

      setTimeout(async () => {
        setShowActionCard(false);
        if (card.type === "DELETE") {
          setUsedQuestions(prev => [...prev, qId]);
        } else {
          if (card.type === "PENALTY") await updateDoc(roomRef, { [`${finalTeam}.score`]: increment(-200) });
          if (card.type === "BONUS") await updateDoc(roomRef, { [`${finalTeam}.nextBonus`]: true });
          if (card.type === "EXTRA") setExtraTurnActive(true);
          fetchQuestionLogic(catName, points, finalTeam);
        }
      }, 2500);
      return;
    }
    fetchQuestionLogic(catName, points, finalTeam);
  };

  const fetchQuestionLogic = async (catName, points, teamKey) => {
    const aiData = await generateAIQuestion(catName, points);
    setCurrentQuestion({ ...aiData, team: teamKey, cat: catName, points: points });
    setIsActive(true); 
    setTimer(60); 
    setShowAnswer(false);
  };

  const handleResult = async (isCorrect) => {
    const roomRef = doc(db, "rooms", roomId);
    isCorrect ? sndCorrect.current.play().catch(() => {}) : sndWrong.current.play().catch(() => {});
    
    if (isCorrect) {
      const multiplier = room[currentQuestion.team]?.nextBonus ? 2 : 1;
      await updateDoc(roomRef, { 
        [`${currentQuestion.team}.score`]: increment(currentQuestion.points * multiplier),
        [`${currentQuestion.team}.nextBonus`]: false
      });
    }
    setUsedQuestions(prev => [...prev, `${currentQuestion.cat}-${currentQuestion.points}-${currentQuestion.team}`]);
    setCurrentQuestion(null); 
    setIsActive(false);
  };

  if (!room) return <div className="loading">جاري تحميل الغرفة...</div>;

  return (
    <div style={mainContainer}>
      {isGenerating && (
        <div style={overlay}><div style={modal}><h2>⚡ جاري استدعاء السؤال...</h2></div></div>
      )}

      {/* لوحة النتائج */}
      <div style={headerStyle}>
        <div style={teamSide}>
          <h2 style={{color: "#3498db"}}>{room?.team1?.name}</h2>
          <div style={scoreTxt}>{room?.team1?.score}</div>
        </div>
        <div style={timerContainer}>
          <div style={timerCircle}>{timer}</div>
        </div>
        <div style={teamSide}>
          <h2 style={{color: "#e74c3c"}}>{room?.team2?.name}</h2>
          <div style={scoreTxt}>{room?.team2?.score}</div>
        </div>
      </div>

      {/* الشبكة */}
      <div style={gridStyle}>
        {allCategories.map((cat, idx) => (
          <div key={idx} style={ladderRow}>
            <div style={questionCluster}>
              <div style={pointsBox}>
                {[600, 400, 200].map(p => (
                  <button key={p} onClick={() => openQuestion(cat, p, 'team1')} disabled={usedQuestions.includes(`${cat}-${p}-team1`)} 
                    style={{ ...pBtn, background: usedQuestions.includes(`${cat}-${p}-team1`) ? "#444" : "#eee" }}>{p}</button>
                ))}
              </div>
              <div style={catLabel}>{cat}</div>
              <div style={pointsBox}>
                {[600, 400, 200].map(p => (
                  <button key={p} onClick={() => openQuestion(cat, p, 'team2')} disabled={usedQuestions.includes(`${cat}-${p}-team2`)} 
                    style={{ ...pBtn, background: usedQuestions.includes(`${cat}-${p}-team2`) ? "#444" : "#eee" }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* مودال السؤال */}
      {currentQuestion && (
        <div style={overlay}>
          <div style={modal}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
              <span style={badge}>{currentQuestion.cat}</span>
              <span style={badge}>{timer} ثانية</span>
            </div>
            {!showAnswer ? <h1 style={qText}>{currentQuestion.question}</h1> : <h1 style={{color:'#27ae60'}}>{currentQuestion.answer}</h1>}
            <div style={resRow}>
              {!showAnswer ? <button onClick={()=>setShowAnswer(true)} style={revealBtn}>كشف الإجابة</button> : 
              <><button onClick={()=>handleResult(true)} style={correctBtn}>صح ✅</button><button onClick={()=>handleResult(false)} style={wrongBtn}>خطأ ❌</button></>}
            </div>
          </div>
        </div>
      )}

      {showActionCard && (
        <div style={overlay}><div style={actionModal}><h1>{randomAction?.text}</h1></div></div>
      )}
    </div>
  );
}

// التنسيقات (Styles)
const mainContainer = { direction: "rtl", background: "#1a1a1a", minHeight: "100vh", padding: "20px" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#262626", padding: "20px", borderRadius: "20px", marginBottom: "30px" };
const teamSide = { textAlign: "center", flex: 1 };
const scoreTxt = { fontSize: "3rem", color: "#fff", fontWeight: "bold" };
const timerCircle = { width: "80px", height: "80px", borderRadius: "50%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "2rem", fontWeight: "bold", border: "4px solid #f1c40f" };
const timerContainer = { flex: "0 0 100px", display: "flex", justifyContent: "center" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "20px" };
const ladderRow = { background: "#262626", padding: "15px", borderRadius: "15px" };
const questionCluster = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const pointsBox = { display: "flex", flexDirection: "column", gap: "8px" };
const pBtn = { width: "60px", height: "45px", borderRadius: "10px", border: "none", fontWeight: "bold", cursor: "pointer" };
const catLabel = { color: "#f1c40f", fontSize: "1.2rem", fontWeight: "bold", textAlign: "center", flex: 1 };
const overlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.9)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modal = { background: "#fff", padding: "40px", borderRadius: "25px", textAlign: "center", width: "85%", maxWidth: "600px" };
const badge = { background: "#eee", padding: "5px 15px", borderRadius: "10px", fontSize: "0.9rem" };
const qText = { fontSize: "2rem", margin: "20px 0", color: "#333" };
const resRow = { display: "flex", justifyContent: "center", gap: "15px", marginTop: "30px" };
const revealBtn = { padding: "12px 30px", background: "#333", color: "#fff", borderRadius: "30px", border: "none", cursor: "pointer" };
const correctBtn = { padding: "12px 25px", background: "#27ae60", color: "#fff", borderRadius: "10px", border: "none", cursor: "pointer" };
const wrongBtn = { padding: "12px 25px", background: "#e74c3c", color: "#fff", borderRadius: "10px", border: "none", cursor: "pointer" };
const actionModal = { background: "#f1c40f", padding: "50px", borderRadius: "30px", textAlign: "center", border: "5px solid #fff" };