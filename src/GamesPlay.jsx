import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db } from "./firebase";
import { doc, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import './GamesPlay.css'; 

// المفتاح المباشر
const API_KEY = "AIzaSyBo07aGN6VNjx3ovNs71JSWSYS04PxDJ4Q"; 
const genAI = new GoogleGenerativeAI(API_KEY);

// تصحيح اسم الموديل ليكون المستقر 1.5 flash
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

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

  // قاموس لترجمة واجهة المستخدم الثابتة بناءً على اختيار لغة الغرفة
  const uiTexts = {
    ar: { generating: "جاري توليد السؤال...", reveal: "كشف الإجابة", correct: "صح ✅", wrong: "خطأ ❌", loading: "جاري التحميل..." },
    en: { generating: "Generating Question...", reveal: "Reveal Answer", correct: "Correct ✅", wrong: "Wrong ❌", loading: "Loading..." },
    fr: { generating: "Génération في cours...", reveal: "Révéler la réponse", correct: "Vrai ✅", wrong: "Faux ❌", loading: "Chargement..." },
    de: { generating: "Frage wird generiert...", reveal: "Antwort zeigen", correct: "Richtig ✅", wrong: "Falsch ❌", loading: "Laden..." }
  };

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

  // دالة توليد السؤال - الآن تدعم اللغات المتعددة
  const generateAIQuestion = async (catName, points) => {
    setIsGenerating(true);
    const lang = room?.lang || "ar"; // الحصول على اللغة من قاعدة البيانات
    const diff = points === 200 ? "easy" : points === 400 ? "medium" : "hard";
    
    // بناء البرومبت لطلب السؤال باللغة المختارة
    const prompt = `You are a trivia expert. Generate one question in the category "${catName}". 
    Difficulty: ${diff}. 
    Language: The question and answer MUST be in ${lang === 'ar' ? 'Arabic' : lang === 'en' ? 'English' : lang === 'fr' ? 'French' : 'German'}.
    Format: Return ONLY a JSON object: {"question": "...", "answer": "..."}`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error("AI Error:", error);
      return { 
        question: lang === 'ar' ? "حدث خطأ" : "Error occurred", 
        answer: lang === 'ar' ? "حاول مجدداً" : "Try again" 
      };
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

    // احتمالية بطاقة الأكشن (15%)
    if (!extraTurnActive && Math.random() < 0.15) {
      const lang = room?.lang || 'ar';
      const cards = [
        { type: "BONUS", labels: { ar: "🎁 مضاعفة النقاط!", en: "🎁 Points Doubled!", fr: "🎁 Points Doublés!", de: "🎁 Punkte Verdoppelt!" } },
        { type: "PENALTY", labels: { ar: "❌ خصم 200 نقطة!", en: "❌ -200 Points!", fr: "❌ -200 Points!", de: "❌ -200 Punkte!" } },
        { type: "EXTRA", labels: { ar: "➕ سؤال إضافي!", en: "➕ Extra Question!", fr: "➕ Question Supplémentaire!", de: "➕ Zusatzfrage!" } },
        { type: "DELETE", labels: { ar: "🗑️ حذف السؤال!", en: "🗑️ Question Deleted!", fr: "🗑️ Question Supprimée!", de: "🗑️ Frage Gelöscht!" } }
      ];
      const card = cards[Math.floor(Math.random() * cards.length)];
      setRandomAction({ ...card, text: card.labels[lang] });
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
    setExtraTurnActive(false);
  };

  const currentLang = room?.lang || 'ar';
  if (!room) return <div style={{color:'#fff', textAlign:'center', marginTop:'100px'}}>{uiTexts.ar.loading}</div>;

  return (
    <div style={{ ...styles.mainContainer, direction: currentLang === 'ar' ? 'rtl' : 'ltr' }}>
      {isGenerating && (
        <div style={styles.overlay}>
          <div style={styles.modal}><h2>⚡ {uiTexts[currentLang].generating}</h2></div>
        </div>
      )}
      
      {/* لوحة النتائج */}
      <div style={styles.header}>
        <div style={styles.team}><h3>{room.team1.name}</h3><div style={styles.score}>{room.team1.score}</div></div>
        <div style={styles.timer}>{timer}</div>
        <div style={styles.team}><h3>{room.team2.name}</h3><div style={styles.score}>{room.team2.score}</div></div>
      </div>

      {/* شبكة الأسئلة (تم تقريب الأزرار للوسط) */}
      <div style={styles.grid}>
        {allCategories.map((cat, i) => (
          <div key={i} style={styles.row}>
            <div style={styles.pointsGroupSide}>
              {[600, 400, 200].map(p => (
                <button key={p} 
                  onClick={() => openQuestion(cat, p, 'team1')} 
                  disabled={usedQuestions.includes(`${cat}-${p}-team1`)} 
                  style={{...styles.pBtn, opacity: usedQuestions.includes(`${cat}-${p}-team1`) ? 0.4 : 1}}>{p}</button>
              ))}
            </div>
            
            <div style={styles.catName}>{cat}</div>
            
            <div style={styles.pointsGroupSide}>
              {[600, 400, 200].map(p => (
                <button key={p} 
                  onClick={() => openQuestion(cat, p, 'team2')} 
                  disabled={usedQuestions.includes(`${cat}-${p}-team2`)} 
                  style={{...styles.pBtn, opacity: usedQuestions.includes(`${cat}-${p}-team2`) ? 0.4 : 1}}>{p}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* نافذة السؤال */}
      {currentQuestion && (
        <div style={styles.overlay}>
          <div style={styles.modalQuestion}>
            <div style={styles.modalTop}>
                <span>{currentQuestion.cat}</span>
                <span style={styles.timerBadge}>{timer}s</span>
            </div>
            {!showAnswer ? (
                <h1 style={styles.questionText}>{currentQuestion.question}</h1>
            ) : (
                <h1 style={styles.answerText}>{currentQuestion.answer}</h1>
            )}
            
            <div style={styles.btnRow}>
              {!showAnswer ? (
                <button onClick={()=>setShowAnswer(true)} style={styles.revealBtn}>
                   {uiTexts[currentLang].reveal}
                </button>
              ) : (
                <>
                  <button onClick={()=>handleResult(true)} style={styles.correctBtn}>{uiTexts[currentLang].correct}</button>
                  <button onClick={()=>handleResult(false)} style={styles.wrongBtn}>{uiTexts[currentLang].wrong}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة الأكشن */}
      {showActionCard && (
        <div style={styles.overlay}>
          <div style={styles.actionModal}>
            <h1 style={{fontSize: '2.5rem'}}>{randomAction?.text}</h1>
          </div>
        </div>
      )}
    </div>
  );
}

// التنسيقات (تم تعديل الألوان والتقريب للوسط)
const styles = {
  mainContainer: { background: "#121212", minHeight: "100vh", padding: "20px", color: "#fff", fontFamily: 'sans-serif' },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", background: "#1e1e1e", padding: "20px", borderRadius: "15px", border: "1px solid #333" },
  team: { textAlign: "center", flex: 1 },
  score: { fontSize: "3rem", fontWeight: "bold", color: "#f1c40f" },
  timer: { width: "70px", height: "70px", borderRadius: "50%", background: "#fff", color: "#000", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.8rem", fontWeight: "bold", border: "4px solid #f1c40f" },
  
  grid: { display: "grid", gap: "10px", maxWidth: "900px", margin: "0 auto" }, // تقريب الشبكة للوسط
  row: { display: "flex", alignItems: "center", background: "#1e1e1e", padding: "10px 20px", borderRadius: "12px", gap: "15px" },
  
  pointsGroupSide: { display: "flex", gap: "8px" }, // جعل الأزرار أفقية وبجانب بعض لتقريب المسافة
  pBtn: { 
    width: "55px", 
    height: "45px", 
    borderRadius: "8px", 
    border: "none", 
    cursor: "pointer", 
    fontWeight: "bold", 
    background: "#e0e0e0", // لون رمادي مائل للابيض
    color: "#333",
    fontSize: "1rem"
  },
  catName: { flex: 1, textAlign: "center", fontSize: "1.1rem", fontWeight: "bold", color: "#f1c40f", minWidth: "120px" },
  
  overlay: { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  modal: { background: "#fff", color: "#000", padding: "30px", borderRadius: "20px", textAlign: "center" },
  
  modalQuestion: { background: "#fff", color: "#333", padding: "40px", borderRadius: "30px", textAlign: "center", width: "90%", maxWidth: "700px", position: 'relative' },
  modalTop: { display: 'flex', justifyContent: 'space-between', color: '#888', marginBottom: '20px', fontSize: '1.2rem', fontWeight: 'bold' },
  timerBadge: { background: '#f1c40f', color: '#000', padding: '2px 10px', borderRadius: '10px' },
  questionText: { fontSize: "2.2rem", marginBottom: "30px", lineHeight: "1.3" },
  answerText: { fontSize: "2.2rem", marginBottom: "30px", color: "#27ae60", fontWeight: 'bold' },
  
  btnRow: { display: "flex", justifyContent: "center", gap: "20px" },
  revealBtn: { padding: "15px 40px", background: "#333", color: "#fff", borderRadius: "50px", border: "none", fontSize: "1.2rem", cursor: "pointer" },
  correctBtn: { padding: "15px 35px", background: "#27ae60", color: "#fff", borderRadius: "12px", border: "none", fontSize: "1.1rem", cursor: "pointer" },
  wrongBtn: { padding: "15px 35px", background: "#e74c3c", color: "#fff", borderRadius: "12px", border: "none", fontSize: "1.1rem", cursor: "pointer" },
  
  actionModal: { background: "#f1c40f", color: "#000", padding: "50px", borderRadius: "30px", textAlign: "center", border: "8px solid #fff", boxShadow: '0 0 50px rgba(241, 196, 15, 0.5)' }
};