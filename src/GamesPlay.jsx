import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db } from "./firebase";
import { doc, onSnapshot, updateDoc, increment, arrayRemove } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import './GamesPlay.css'; 

const genAI = new GoogleGenerativeAI("AIzaSyBo07aGN6VNjx3ovNs71JSWSYS04PxDJ4Q");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

export default function GamesPlay() {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [timer, setTimer] = useState(60);
  const [isActive, setIsActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [allCategories, setAllCategories] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [usedQuestions, setUsedQuestions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showRandomAction, setShowRandomAction] = useState(false);
  const [randomActionData, setRandomActionData] = useState(null);

  // --- إصلاح مسارات الصوت (حذف كلمة public) ---
  const sndTick = useRef(new Audio("/sounds/button-19.mp3"));
  const sndAction = useRef(new Audio("/sounds/button-41.mp3"));
  const sndCorrect = useRef(new Audio("/sounds/bell-ringing-05.mp3"));
  const sndWrong = useRef(new Audio("/sounds/button-10.mp3"));

  const playSound = (soundRef) => {
    if (soundRef.current) {
      soundRef.current.currentTime = 0;
      soundRef.current.play().catch((err) => console.log("Audio play blocked or error:", err));
    }
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
        if (timer <= 5) playSound(sndTick); // تشغيل صوت تكتكة في آخر 5 ثواني
      }, 1000);
    } else if (timer === 0 && isActive) {
      setShowAnswer(true);
      setIsActive(false);
      playSound(sndWrong); // صوت الخطأ عند انتهاء الوقت
    }
    return () => clearInterval(interval);
  }, [isActive, timer]);

  const fetchAIQuestion = async (cat, pts) => {
    setIsGenerating(true);
    const lang = room?.lang || "ar";
    const prompt = `Give me a trivia question about "${cat}" with difficulty ${pts}. The output MUST be in ${lang} language. Format as JSON: {"question": "...", "answer": "..."}`;
    try {
      const res = await model.generateContent(prompt);
      const data = JSON.parse(res.response.text().replace(/```json|```/g, "").trim());
      return data;
    } catch (e) {
      return { question: "Error loading question", answer: "Check connection" };
    } finally {
      setIsGenerating(false);
    }
  };

  const openQuestion = async (cat, pts, teamKey) => {
    if (room?.[teamKey]?.isFrozen) return alert("الفريق مجمد! ❄️");
    const aiData = await fetchAIQuestion(cat, pts);
    
    if (Math.random() < 0.20) {
      const actions = [
        { type: 'BONUS', txt: "🎁 هدية: نقاط مضاعفة!", color: "#f1c40f" },
        { type: 'PENALTY', txt: "❌ عقوبة: خصم 200 نقطة!", color: "#e74c3c" },
        { type: 'EXTRA', txt: "➕ سؤال إضافي متاح!", color: "#2ecc71" },
        { type: 'DELETE', txt: "🗑️ حذف السؤال تماماً!", color: "#95a5a6" }
      ];
      const selected = actions[Math.floor(Math.random() * actions.length)];
      setRandomActionData(selected);
      setShowRandomAction(true);
      playSound(sndAction); // تشغيل صوت الأكشن العشوائي

      setTimeout(async () => {
        setShowRandomAction(false);
        if (selected.type === 'DELETE') {
          setUsedQuestions(prev => [...prev, `${cat}-${pts}-${teamKey}`]);
        } else {
          if (selected.type === 'PENALTY') {
            await updateDoc(doc(db, "rooms", roomId), { [`${teamKey}.score`]: increment(-200) });
          }
          startQuestion(aiData, cat, pts, teamKey, selected.type);
        }
      }, 3000);
    } else {
      startQuestion(aiData, cat, pts, teamKey, null);
    }
  };

  const startQuestion = (ai, cat, pts, team, rType) => {
    setCurrentQuestion({ ...ai, cat, points: pts, team, rType, isDouble: rType === 'BONUS' });
    setTimer(60);
    setIsActive(true);
    setShowAnswer(false);
  };

  const triggerTeamAction = async (actLabel, teamKey) => {
    if (!currentQuestion) return alert("اختر سؤالاً أولاً!");
    const roomRef = doc(db, "rooms", roomId);
    playSound(sndAction); // صوت عند تفعيل أي أكشن يدوي

    if (actLabel.includes("⚠️") || actLabel.includes("Fault")) {
      const target = currentQuestion.team === 'team1' ? 'team2' : 'team1';
      setCurrentQuestion(p => ({ ...p, team: target, isChallenge: true, challengeBy: teamKey }));
    } else if (actLabel.includes("🚀") || actLabel.includes("Double")) {
      setCurrentQuestion(p => ({ ...p, isDouble: true }));
    } else if (actLabel.includes("🎭") || actLabel.includes("Steal")) {
      setCurrentQuestion(p => ({ ...p, team: teamKey }));
    } else if (actLabel.includes("❄️") || actLabel.includes("Freeze")) {
      const target = teamKey === 'team1' ? 'team2' : 'team1';
      await updateDoc(roomRef, { [`${target}.isFrozen`]: true });
      setTimeout(() => updateDoc(roomRef, { [`${target}.isFrozen`]: false }), 30000);
    }
    await updateDoc(roomRef, { [`${teamKey}.actions`]: arrayRemove(actLabel) });
  };

  const handleResult = async (correct) => {
    const roomRef = doc(db, "rooms", roomId);
    const { team, points, isDouble, isChallenge, challengeBy, cat } = currentQuestion;
    
    if (correct) {
      playSound(sndCorrect); // صوت النجاح
      if (isChallenge) {
        await updateDoc(roomRef, { [`${challengeBy}.score`]: increment(points / 2) });
      } else {
        await updateDoc(roomRef, { [`${team}.score`]: increment(isDouble ? points * 2 : points) });
      }
    } else {
      playSound(sndWrong); // صوت الفشل
      if (isChallenge) {
        await updateDoc(roomRef, { [`${team}.score`]: increment(-(points / 2)) });
      }
    }
    setUsedQuestions(p => [...p, `${cat}-${points}-${team}`]);
    setCurrentQuestion(null);
    setIsActive(false);
  };

  return (
    <div style={styles.mainContainer}>
      {/* ... (باقي كود الـ JSX يظل كما هو دون تغيير في التنسيق) ... */}
      <div style={styles.header}>
        <TeamPanel team={room?.team1} teamKey="team1" onAct={triggerTeamAction} isTurn={currentQuestion?.team === 'team1'} color="#3498db" />
        <div style={styles.mainTimer}>{timer}</div>
        <TeamPanel team={room?.team2} teamKey="team2" onAct={triggerTeamAction} isTurn={currentQuestion?.team === 'team2'} color="#e74c3c" />
      </div>

      <div style={styles.grid}>
        {allCategories.map((cat, i) => (
          <div key={i} style={styles.row}>
            <div style={styles.btnSide}>
              {[200, 400, 600].map(p => (
                <button key={p} disabled={usedQuestions.includes(`${cat}-${p}-team1`)}
                  onClick={() => openQuestion(cat, p, 'team1')} style={{...styles.pBtn, background: '#3498db'}}>{p}</button>
              ))}
            </div>
            <div style={styles.catName}>{cat}</div>
            <div style={styles.btnSide}>
              {[200, 400, 600].map(p => (
                <button key={p} disabled={usedQuestions.includes(`${cat}-${p}-team2`)}
                  onClick={() => openQuestion(cat, p, 'team2')} style={{...styles.pBtn, background: '#e74c3c'}}>{p}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {currentQuestion && (
        <div style={styles.overlay}>
          <div style={styles.qModal}>
            <div style={styles.modalHeader}>
              <span>{currentQuestion.cat} ({currentQuestion.points} نقطة)</span>
              <span style={styles.timerDisplay}>⏱️ {timer}s</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', padding: '10px', background: 'rgba(0,0,0,0.03)', borderRadius: '15px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', width: '45%' }}>
                {room?.team1?.actions?.map((act, i) => (
                  <button key={i} onClick={() => triggerTeamAction(act, 'team1')} style={{ ...styles.modalActionBtn, background: '#3498db' }}>{act}</button>
                ))}
              </div>
              <div style={{ fontWeight: 'bold', color: '#ccc' }}>VS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', width: '45%', justifyContent: 'flex-end' }}>
                {room?.team2?.actions?.map((act, i) => (
                  <button key={i} onClick={() => triggerTeamAction(act, 'team2')} style={{ ...styles.modalActionBtn, background: '#e74c3c' }}>{act}</button>
                ))}
              </div>
            </div>

            <h1 style={!showAnswer ? styles.qText : styles.aText}>
              {!showAnswer ? currentQuestion.question : currentQuestion.answer}
            </h1>

            <div style={styles.modalFooter}>
              {!showAnswer ? (
                <button onClick={() => { setShowAnswer(true); playSound(sndTick); }} style={styles.actionBtn}>كشف الإجابة</button>
              ) : (
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => handleResult(true)} style={styles.corBtn}>صح ✅</button>
                  <button onClick={() => handleResult(false)} style={styles.wrgBtn}>خطأ ❌</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRandomAction && (
        <div style={styles.overlay}>
          <div style={{...styles.randomCard, backgroundColor: randomActionData.color}}>
            <h2>{randomActionData.txt}</h2>
          </div>
        </div>
      )}
      {isGenerating && <div style={styles.overlay}><h2 style={{color: '#fff'}}>AI is thinking... 🧠</h2></div>}
    </div>
  );
}
function TeamPanel({ team, teamKey, onAct, isTurn, color }) {
  if (!team) return null;
  return (
    <div style={{...styles.teamBox, border: isTurn ? `3px solid ${color}` : '1px solid #444'}}>
      <h3 style={{color: color}}>{team.name} {team.isFrozen && "❄️"}</h3>
      <div style={styles.score}>{team.score}</div>
      <div style={styles.actionsRow}>
        {team.actions?.map((act, i) => (
          <button key={i} onClick={() => onAct(act, teamKey)} style={styles.miniActBtn}>{act}</button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  mainContainer: { background: "#0a0a23", minHeight: "100vh", padding: "20px", color: "#fff", direction: 'rtl', fontFamily: 'sans-serif' },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" },
  teamBox: { background: "rgba(255,255,255,0.05)", padding: "15px", borderRadius: "15px", flex: 1, textAlign: "center" },
  score: { fontSize: "2.2rem", fontWeight: "bold", color: "#f1c40f" },
  actionsRow: { display: "flex", justifyContent: "center", gap: "5px", marginTop: "10px" },
  miniActBtn: { padding: "5px 8px", fontSize: "0.7rem", borderRadius: "8px", border: "none", cursor: "pointer", background: "#34495e", color: "#fff" },
  mainTimer: { width: "70px", height: "70px", background: "#fff", color: "#000", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.8rem", fontWeight: "bold", margin: "0 20px" },
  grid: { maxWidth: "900px", margin: "0 auto" },
  row: { display: "flex", background: "rgba(255,255,255,0.08)", padding: "10px", borderRadius: "12px", marginBottom: "10px", alignItems: "center", justifyContent: "space-between" },
  btnSide: { display: "flex", gap: "8px" },
  catName: { flex: 1, fontWeight: "bold", textAlign: "center", fontSize: "1.1rem", color: "#f1c40f" },
  pBtn: { width: "55px", height: "45px", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer", color: "#fff" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  qModal: { background: "#fff", color: "#333", width: "90%", maxWidth: "600px", padding: "30px", borderRadius: "25px", textAlign: "center" },
  modalHeader: { display: "flex", justifyContent: "space-between", marginBottom: "20px", color: "#888" },
  timerDisplay: { color: "#e74c3c", fontWeight: "bold" },
  qText: { fontSize: "1.8rem", margin: "40px 0" },
  aText: { fontSize: "1.8rem", margin: "40px 0", color: "#27ae60", fontWeight: "bold" },
  actionBtn: { width: "100%", padding: "15px", background: "#333", color: "#fff", border: "none", borderRadius: "12px", cursor: "pointer" },
  corBtn: { flex: 1, padding: "15px", background: "#27ae60", color: "#fff", border: "none", borderRadius: "12px" },
  wrgBtn: { flex: 1, padding: "15px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "12px" },
  randomCard: { padding: "50px", borderRadius: "20px", color: "#fff", textAlign: "center", minWidth: "300px" },
  alertBar: { background: "#ffeaea", color: "#e74c3c", padding: "10px", borderRadius: "10px", marginBottom: "15px", fontWeight: "bold" },
miniActBtnInModal: {
  padding: "8px 12px",
  background: '#2c3e50',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '1rem',
  fontWeight: 'bold',
  transition: '0.3s'},
modalActionBtn: {
  padding: '6px 10px',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 'bold',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  transition: '0.2s active'
},
}
