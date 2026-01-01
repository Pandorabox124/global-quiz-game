import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db } from "./firebase";
import { doc, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import './GamesPlay.css'; 

// إعداد المحرك مباشرة من ملف الـ env لضمان السرعة والاستقرار
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);
// تم تصحيح الموديل إلى 1.5-flash لتجنب خطأ 404
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" }); 

export default function GamesPlay() {
  const { roomId } = useParams();
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

  const generateAIQuestion = async (catName, points) => {
    setIsGenerating(true);
    const diff = points === 200 ? "سهل" : points === 400 ? "متوسط" : "صعب";
    
    // برومبت محسن لضمان استجابة سريعة ودقيقة
    const prompt = `أنت خبير مسابقات. أنتج سؤالاً واحداً في فئة "${catName}". المستوى: ${diff}. المطلوب JSON فقط: {"question": "نص السؤال", "answer": "الإجابة"}`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error("AI Error:", error);
      return { question: "حدث خطأ في جلب السؤال، جرب مرة أخرى", answer: "خطأ في الاتصال" };
    } finally {
      setIsGenerating(false);
    }
  };

  const openQuestion = async (catName, points, teamKey) => {
    if (room?.[teamKey]?.isFrozen) return alert("الفريق مجمد حالياً!");
    sndOpen.current.play().catch(() => {});

    const roomRef = doc(db, "rooms", roomId);
    let finalTeam = teamKey;

    if (room?.stealNextQuestion && room.stealNextQuestion !== teamKey) {
      finalTeam = room.stealNextQuestion;
      await updateDoc(roomRef, { stealNextQuestion: null });
    }

    const qId = `${catName}-${points}-${teamKey}`;
    if (usedQuestions.includes(qId)) return;

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
    setIsActive(true); setTimer(60); setShowAnswer(false);
  };

  const handleResult = async (isCorrect) => {
    const roomRef = doc(db, "rooms", roomId);
    isCorrect ? sndCorrect.current.play().catch(() => {}) : sndWrong.current.play().catch(() => {});
    if (isCorrect) {
      await updateDoc(roomRef, { [`${currentQuestion.team}.score`]: increment(currentQuestion.points) });
    }
    setUsedQuestions(prev => [...prev, `${currentQuestion.cat}-${currentQuestion.points}-${currentQuestion.team}`]);
    setCurrentQuestion(null); setIsActive(false);
  };

  if (!room) return <div style={{color: '#fff', textAlign: 'center', marginTop: '100px'}}>Loading...</div>;

  return (
    <div style={mainContainer}>
      {isGenerating && (
        <div style={overlay}><div style={modal} className="question-modal-animated"><h2>⚡ جاري استدعاء السؤال...</h2></div></div>
      )}

      <div style={headerStyle}>
        <div style={teamSide} className={room?.team1?.isFrozen ? "frozen-team" : ""}>
          <h2 style={{color: "#3498db"}}>{room?.team1?.name}</h2>
          <div style={scoreTxt}>{room?.team1?.score}</div>
        </div>
        <div style={timerContainer}><div style={timerCircle}>{timer}</div></div>
        <div style={teamSide} className={room?.team2?.isFrozen ? "frozen-team" : ""}>
          <h2 style={{color: "#e74c3c"}}>{room?.team2?.name}</h2>
          <div style={scoreTxt}>{room?.team2?.score}</div>
        </div>
      </div>

      <div style={gridStyle}>
        {allCategories.map((cat, idx) => (
          <div key={idx} style={ladderRow}>
            <div style={questionCluster}>
              <div style={pointsBox}>
                {[600, 400, 200].map(p => (
                  <button key={p} onClick={() => openQuestion(cat, p, 'team1')} disabled={usedQuestions.includes(`${cat}-${p}-team1`)} 
                    style={{ ...pBtn, background: usedQuestions.includes(`${cat}-${p}-team1`) ? "#333" : "#f5f5f5", color: usedQuestions.includes(`${cat}-${p}-team1`) ? "#666" : "#2c3e50" }}>{p}</button>
                ))}
              </div>
              <div style={catLabel}>{cat}</div>
              <div style={pointsBox}>
                {[600, 400, 200].map(p => (
                  <button key={p} onClick={() => openQuestion(cat, p, 'team2')} disabled={usedQuestions.includes(`${cat}-${p}-team2`)} 
                    style={{ ...pBtn, background: usedQuestions.includes(`${cat}-${p}-team2`) ? "#333" : "#f5f5f5", color: usedQuestions.includes(`${cat}-${p}-team2`) ? "#666" : "#2c3e50" }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {currentQuestion && (
        <div style={overlay}>
          <div style={modal} className="question-modal-animated">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div style={modalBadge}>{currentQuestion.cat} | {currentQuestion.points}</div>
              <div style={{ background: timer <= 10 ? "#e74c3c" : "#2c3e50", color: "#fff", padding: "8px 15px", borderRadius: "15px", fontWeight: "bold" }}>⏱️ {timer}</div>
            </div>
            {!showAnswer ? <h1 style={qText}>{currentQuestion.question}</h1> : <div style={answerBox}><h1 style={{ color: "#27ae60" }}>{currentQuestion.answer}</h1></div>}
            <div style={resRow}>
              {showAnswer ? (
                <><button onClick={() => handleResult(true)} style={resBtn}>صح ✅</button><button onClick={() => handleResult(false)} style={{ ...resBtn, background: "#c0392b" }}>خطأ ❌</button></>
              ) : <button onClick={() => setShowAnswer(true)} style={revealBtn}>كشف الإجابة</button>}
            </div>
          </div>
        </div>
      )}

      {showActionCard && (
        <div style={overlay}><div style={actionModal} className="action-card-animated"><h1>{randomAction?.text}</h1></div></div>
      )}
    </div>
  );
}

// التنسيقات (نفس الستايل الاحترافي السابق)
const mainContainer = { direction: "rtl", background: "#1a1a1a", minHeight: "100vh", padding: "40px 20px" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#262626", padding: "30px", borderRadius: "30px", marginBottom: "60px", border: "1px solid #333" };
const teamSide = { flex: 1, textAlign: "center" };
const scoreTxt = { fontSize: "48px", fontWeight: "900", color: "#fff" };
const timerContainer = { flex: "0 0 150px", display: "flex", justifyContent: "center" };
const timerCircle = { width: "90px", height: "90px", borderRadius: "50%", border: "6px solid #f1c40f", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "35px", fontWeight: "bold", background: "#fff", color: "#000" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "25px", maxWidth: "1400px", margin: "0 auto" };
const ladderRow = { background: "#262626", padding: "20px", borderRadius: "25px", border: "1px solid #333" };
const questionCluster = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const pointsBox = { display: "flex", flexDirection: "column", gap: "10px" };
const pBtn = { width: "80px", height: "55px", borderRadius: "15px", border: "none", cursor: "pointer", fontSize: "20px", fontWeight: "bold", transition: "0.3s" };
const catLabel = { color: "#f1c40f", fontSize: "20px", fontWeight: "bold", textAlign: "center", flex: 1, padding: "0 10px" };
const overlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.95)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000 };
const modal = { background: "#fff", padding: "50px", borderRadius: "40px", textAlign: "center", width: "90%", maxWidth: "700px" };
const modalBadge = { background: "#f1c40f", padding: "8px 20px", borderRadius: "20px", display: "inline-block", marginBottom: "20px", fontWeight: "bold" };
const qText = { fontSize: "2rem", color: "#2c3e50", margin: "30px 0" };
const answerBox = { padding: "30px", background: "#f9f9f9", borderRadius: "20px", border: "2px solid #27ae60", margin: "20px 0" };
const resRow = { display: "flex", justifyContent: "center", gap: "20px" };
const resBtn = { padding: "15px 40px", background: "#27ae60", color: "#fff", border: "none", borderRadius: "15px", cursor: "pointer", fontSize: "18px", fontWeight: "bold" };
const revealBtn = { padding: "20px 60px", background: "#2c3e50", color: "#fff", border: "none", borderRadius: "50px", cursor: "pointer", fontSize: "20px" };
const actionModal = { background: "#f1c40f", padding: "60px", borderRadius: "40px", border: "10px solid #fff", textAlign: "center" };