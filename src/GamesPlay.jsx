import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db } from "./firebase";
import { doc, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import './GamesPlay.css'; 

// --- وضع المفتاح مباشرة هنا (تم كنسلة فكرة التشفير بناءً على طلبك) ---
const API_KEY = "AIzaSyBo07aGN6VNjx3ovNs71JSWSYS04PxDJ4Q"; 
const genAI = new GoogleGenerativeAI(API_KEY);

// استخدام الموديل المستقر 1.5 لتجنب خطأ 404
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

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

  // مراجع الأصوات
  const sndTick = useRef(new Audio("/sounds/button-41.mp3"));
  const sndOpen = useRef(new Audio("/sounds/button-3.mp3"));
  const sndCorrect = useRef(new Audio("/sounds/bell-ringing-05.mp3"));
  const sndWrong = useRef(new Audio("/sounds/button-10.mp3"));
  const sndAction = useRef(new Audio("/sounds/button-19.mp3"));

  // جلب بيانات الغرفة
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

  // عداد الوقت
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

  // دالة توليد السؤال
  const generateAIQuestion = async (catName, points) => {
    setIsGenerating(true);
    const diff = points === 200 ? "سهل" : points === 400 ? "متوسط" : "صعب";
    const prompt = `أنت خبير مسابقات محترف. أنتج سؤالاً واحداً في فئة "${catName}". المستوى: ${diff}. المطلوب رد بصيغة JSON فقط: {"question": "نص السؤال", "answer": "الإجابة"}`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      // تنظيف النص لضمان تحويله لـ JSON
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error("AI Error:", error);
      return { question: "حدث خطأ في استدعاء السؤال، يرجى المحاولة مرة أخرى", answer: "خطأ فني" };
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
    setIsActive(true); 
    setTimer(60); 
    setShowAnswer(false);
  };

  const handleResult = async (isCorrect) => {
    const roomRef = doc(db, "rooms", roomId);
    isCorrect ? sndCorrect.current.play().catch(() => {}) : sndWrong.current.play().catch(() => {});
    
    if (isCorrect) {
      const mult = room[currentQuestion.team]?.nextBonus ? 2 : 1;
      await updateDoc(roomRef, { 
        [`${currentQuestion.team}.score`]: increment(currentQuestion.points * mult),
        [`${currentQuestion.team}.nextBonus`]: false 
      });
    }
    setUsedQuestions(prev => [...prev, `${currentQuestion.cat}-${currentQuestion.points}-${currentQuestion.team}`]);
    setCurrentQuestion(null); 
    setIsActive(false);
  };

  if (!room) return <div style={{color:'#fff', textAlign:'center', marginTop:'100px'}}>Loading...</div>;

  return (
    <div style={styles.mainContainer}>
      {isGenerating && (
        <div style={styles.overlay}><div style={styles.modal}><h2>⚡ جاري توليد السؤال...</h2></div></div>
      )}
      
      <div style={styles.header}>
        <div style={styles.team}><h3>{room.team1.name}</h3><div style={styles.score}>{room.team1.score}</div></div>
        <div style={styles.timer}>{timer}</div>
        <div style={styles.team}><h3>{room.team2.name}</h3><div style={styles.score}>{room.team2.score}</div></div>
      </div>

      <div style={styles.grid}>
        {allCategories.map((cat, i) => (
          <div key={i} style={styles.row}>
            <div style={styles.pointsGroup}>
              {[600, 400, 200].map(p => (
                <button key={p} onClick={() => openQuestion(cat, p, 'team1')} disabled={usedQuestions.includes(`${cat}-${p}-team1`)} style={styles.pBtn}>{p}</button>
              ))}
            </div>
            <div style={styles.catName}>{cat}</div>
            <div style={styles.pointsGroup}>
              {[600, 400, 200].map(p => (
                <button key={p} onClick={() => openQuestion(cat, p, 'team2')} disabled={usedQuestions.includes(`${cat}-${p}-team2`)} style={styles.pBtn}>{p}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {currentQuestion && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h2>{currentQuestion.cat}</h2>
            {!showAnswer ? <h1>{currentQuestion.question}</h1> : <h1 style={{color:'green'}}>{currentQuestion.answer}</h1>}
            <div style={styles.btnRow}>
              {!showAnswer ? <button onClick={()=>setShowAnswer(true)} style={styles.reveal}>كشف الإجابة</button> : 
              <><button onClick={()=>handleResult(true)} style={styles.correct}>صح ✅</button><button onClick={()=>handleResult(false)} style={styles.wrong}>خطأ ❌</button></>}
            </div>
          </div>
        </div>
      )}

      {showActionCard && (
        <div style={styles.overlay}><div style={styles.actionModal}><h1>{randomAction?.text}</h1></div></div>
      )}
    </div>
  );
}

const styles = {
  mainContainer: { direction: "rtl", background: "#1a1a1a", minHeight: "100vh", padding: "20px", color: "#fff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", background: "#262626", padding: "20px", borderRadius: "15px" },
  team: { textAlign: "center", flex: 1 },
  score: { fontSize: "2.5rem", fontWeight: "bold" },
  timer: { width: "70px", height: "70px", borderRadius: "50%", background: "#fff", color: "#000", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.8rem", fontWeight: "bold", border: "4px solid #f1c40f" },
  grid: { display: "grid", gap: "15px" },
  row: { display: "flex", alignItems: "center", background: "#262626", padding: "15px", borderRadius: "12px" },
  pointsGroup: { display: "flex", flexDirection: "column", gap: "5px" },
  pBtn: { padding: "10px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold", background: "#eee" },
  catName: { flex: 1, textAlign: "center", fontSize: "1.2rem", color: "#f1c40f" },
  overlay: { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.9)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  modal: { background: "#fff", color: "#000", padding: "30px", borderRadius: "20px", textAlign: "center", width: "90%", maxWidth: "600px" },
  btnRow: { marginTop: "20px", display: "flex", justifyContent: "center", gap: "10px" },
  reveal: { padding: "10px 20px", background: "#333", color: "#fff", borderRadius: "8px", border: "none" },
  correct: { padding: "10px 20px", background: "green", color: "#fff", borderRadius: "8px", border: "none" },
  wrong: { padding: "10px 20px", background: "red", color: "#fff", borderRadius: "8px", border: "none" },
  actionModal: { background: "#f1c40f", color: "#000", padding: "40px", borderRadius: "20px", border: "5px solid #fff" }
};