import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db } from "./firebase";
import { doc, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import './GamesPlay.css'; 

const API_KEY = "AIzaSyBo07aGN6VNjx3ovNs71JSWSYS04PxDJ4Q"; 
const genAI = new GoogleGenerativeAI(API_KEY);
// استخدام الموديل الصحيح لتجنب خطأ 404
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

export default function GamesPlay() {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [timer, setTimer] = useState(60);
  const [isActive, setIsActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [allCategories, setAllCategories] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showRandomAction, setShowRandomAction] = useState(false);
  const [randomActionData, setRandomActionData] = useState(null);
  const [usedQuestions, setUsedQuestions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // تم إصلاح التكرار في المراجع وتصحيح المسارات
  const sndTick = useRef(new Audio("/sounds/tick.mp3"));
  const sndAction = useRef(new Audio("/sounds/action.mp3"));
  const sndCorrect = useRef(new Audio("/sounds/correct.mp3"));
  const sndWrong = useRef(new Audio("/sounds/wrong.mp3"));

  const playSound = (soundRef) => {
    if (soundRef.current) {
      soundRef.current.currentTime = 0;
      soundRef.current.play().catch(e => console.log("Sound play blocked"));
    }
  };

  const uiTexts = {
    ar: { gen: "جاري التوليد...", rev: "كشف الإجابة", cor: "صح ✅", wrg: "خطأ ❌", challenge: "⚠️ تحدي إجباري (فاول)!" },
    en: { gen: "Generating...", rev: "Reveal", cor: "Correct ✅", wrg: "Wrong ❌", challenge: "⚠️ Forced Challenge!" }
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
        if (timer <= 5) playSound(sndTick); // تنبيه لآخر 5 ثواني
      }, 1000);
    } else if (timer === 0 && isActive) {
      setShowAnswer(true);
      setIsActive(false);
      playSound(sndWrong);
    }
    return () => clearInterval(interval);
  }, [isActive, timer]);

  const generateAIQuestion = async (catName, points) => {
    setIsGenerating(true);
    const lang = room?.lang || "ar";
    const prompt = `Trivia question about ${catName}, level ${points}, lang ${lang}. JSON format only: {"question":"...", "answer":"..."}`;
    try {
      const res = await model.generateContent(prompt);
      const text = res.response.text().replace(/```json|```/g, "").trim();
      return JSON.parse(text);
    } catch (e) { 
      return { question: "خطأ في تحميل السؤال من الذكاء الاصطناعي", answer: "تأكد من الاتصال" }; 
    } finally { setIsGenerating(false); }
  };

  const openQuestion = async (catName, points, teamKey) => {
    if (room?.[teamKey]?.isFrozen) return alert("هذا الفريق مجمد! ❄️");
    
    const roomRef = doc(db, "rooms", roomId);
    let finalTeam = teamKey;
    let challengeData = { active: false, by: null };

    if (room?.forcingActive) {
      challengeData = { active: true, by: room.forcingActive.by };
      finalTeam = room.forcingActive.target;
      await updateDoc(roomRef, { forcingActive: null });
    } else if (room?.stealNextQuestion) {
      finalTeam = room.stealNextQuestion;
      await updateDoc(roomRef, { stealNextQuestion: null });
    }

    const aiData = await generateAIQuestion(catName, points);

    if (Math.random() < 0.20) {
      const actions = [
        { type: 'BONUS', txt: "🎁 مضاعفة النقاط لهذا السؤال!", color: "#f1c40f" },
        { type: 'PENALTY', txt: "❌ خصم 200 نقطة فوراً!", color: "#e74c3c" },
        { type: 'EXTRA', txt: "➕ سؤال إضافي (مزدوج النقاط)!", color: "#2ecc71" },
        { type: 'DELETE', txt: "🗑️ حذف السؤال.. لا نقاط لأحد!", color: "#95a5a6" }
      ];
      const act = actions[Math.floor(Math.random() * actions.length)];
      setRandomActionData(act);
      setShowRandomAction(true);
      playSound(sndAction);
      
      setTimeout(async () => {
        setShowRandomAction(false);
        if (act.type === 'DELETE') {
          setUsedQuestions(prev => [...prev, `${catName}-${points}-${teamKey}`]);
          return; 
        }
        if (act.type === 'PENALTY') {
          await updateDoc(roomRef, { [`${finalTeam}.score`]: increment(-200) });
        }
        startQuestion(aiData, finalTeam, points, catName, challengeData, act.type);
      }, 3000);
    } else {
      startQuestion(aiData, finalTeam, points, catName, challengeData, null);
    }
  };

  const startQuestion = (ai, team, p, cat, challenge, rType) => {
    setCurrentQuestion({ ...ai, team, points: p, cat, challenge, randomType: rType });
    setIsActive(true); setTimer(60); setShowAnswer(false);
  };

  const handleResult = async (isCorrect) => {
    const roomRef = doc(db, "rooms", roomId);
    const { team, points, challenge, cat, randomType } = currentQuestion;

    if (isCorrect) {
      playSound(sndCorrect);
      let multiplier = 1;
      if (randomType === 'BONUS' || randomType === 'EXTRA' || room[team]?.nextBonus) {
        multiplier = 2;
      }
      if (challenge?.active) {
        await updateDoc(roomRef, { [`${challenge.by}.score`]: increment(points / 2) });
      } else {
        await updateDoc(roomRef, { 
          [`${team}.score`]: increment(points * multiplier),
          [`${team}.nextBonus`]: false 
        });
      }
    } else {
      playSound(sndWrong);
      if (challenge?.active) {
        await updateDoc(roomRef, { [`${team}.score`]: increment(-(points / 2)) });
      }
    }
    setUsedQuestions(prev => [...prev, `${cat}-${points}-${team}`]);
    setCurrentQuestion(null); setIsActive(false); setRandomActionData(null);
  };

  return (
    <div style={styles.mainContainer}>
      <div style={styles.header}>
        <TeamUI team={room?.team1} isForced={currentQuestion?.team === 'team1' && currentQuestion?.challenge?.active} />
        <div style={styles.timerCircle}>{timer}</div>
        <TeamUI team={room?.team2} isForced={currentQuestion?.team === 'team2' && currentQuestion?.challenge?.active} />
      </div>

      <div style={styles.grid}>
        {allCategories.map((cat, i) => (
          <div key={i} style={styles.row}>
            <div style={styles.btnSide}>
              {[600, 400, 200].map(p => (
                <button key={p} onClick={() => openQuestion(cat, p, 'team1')} 
                disabled={usedQuestions.includes(`${cat}-${p}-team1`)} style={styles.pBtn}>{p}</button>
              ))}
            </div>
            <div style={styles.catName}>{cat}</div>
            <div style={styles.btnSide}>
              {[600, 400, 200].map(p => (
                <button key={p} onClick={() => openQuestion(cat, p, 'team2')} 
                disabled={usedQuestions.includes(`${cat}-${p}-team2`)} style={styles.pBtn}>{p}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {currentQuestion && (
        <div style={styles.overlay}>
          <div style={styles.qModal}>
            <div style={styles.modalTop}>
              <span>{currentQuestion.cat}</span>
              {currentQuestion.challenge?.active && <span style={styles.challengeBadge}>🚩 {uiTexts.ar.challenge} لـ {room[currentQuestion.team].name}</span>}
              <span style={styles.modalTimer}>{timer}s</span>
            </div>
            <h1 style={!showAnswer ? styles.qText : styles.aText}>
                {!showAnswer ? currentQuestion.question : currentQuestion.answer}
            </h1>
            <div style={styles.modalActions}>
               {!showAnswer ? (
                 <button onClick={()=>{setShowAnswer(true); playSound(sndTick);}} style={styles.revealBtn}>كشف الإجابة</button>
               ) : (
                 <div style={styles.resBtns}>
                    <button onClick={()=>handleResult(true)} style={styles.corBtn}>صح ✅</button>
                    <button onClick={()=>handleResult(false)} style={styles.wrgBtn}>خطأ ❌</button>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {showRandomAction && (
        <div style={styles.overlay}>
          <div style={{...styles.actionPopup, backgroundColor: randomActionData?.color}}>
            <h1>{randomActionData?.txt}</h1>
          </div>
        </div>
      )}

      {isGenerating && (
        <div style={styles.overlay}>
          <div style={{background: '#fff', padding: '20px', borderRadius: '15px', color: '#000'}}>
             <h3>{uiTexts.ar.gen}</h3>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamUI({ team, isForced }) {
    if(!team) return null;
    return (
      <div style={{...styles.teamBox, border: isForced ? '3px solid red' : 'none', boxShadow: isForced ? '0 0 15px red' : 'none'}}>
        <div style={styles.badges}>
          {team.isFrozen && "❄️"} {team.nextBonus && "🎁"} {isForced && "🚩"}
        </div>
        <h3 style={{margin:0}}>{team.name}</h3>
        <div style={styles.score}>{team.score}</div>
      </div>
    );
}

const styles = {
  mainContainer: { background: "#121212", minHeight: "100vh", padding: "20px", color: "#fff", direction: 'rtl' },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e1e1e", padding: "15px", borderRadius: "20px", marginBottom: "30px" },
  teamBox: { textAlign: "center", flex: 1, padding: "10px", borderRadius: "15px" },
  score: { fontSize: "2.5rem", fontWeight: "bold", color: "#f1c40f" },
  timerCircle: { width: "60px", height: "60px", background: "#fff", color: "#000", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.5rem", fontWeight: "bold" },
  grid: { maxWidth: "800px", margin: "0 auto", display: "grid", gap: "10px" },
  row: { display: "flex", alignItems: "center", background: "#1e1e1e", padding: "10px", borderRadius: "12px", gap: "15px" },
  btnSide: { display: "flex", gap: "5px" },
  pBtn: { width: "50px", height: "40px", background: "#e0e0e0", color: "#333", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" },
  catName: { flex: 1, textAlign: "center", color: "#f1c40f", fontWeight: "bold" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  qModal: { background: "#fff", color: "#333", width: "90%", maxWidth: "650px", padding: "30px", borderRadius: "25px", textAlign: "center" },
  modalTop: { display: "flex", justifyContent: "space-between", marginBottom: "20px", fontWeight: "bold" },
  challengeBadge: { color: "red", fontSize: "1rem", background: '#ffebeb', padding: '5px 10px', borderRadius: '10px' },
  qText: { fontSize: "2rem", marginBottom: "30px" },
  aText: { fontSize: "2rem", marginBottom: "30px", color: "green", fontWeight: "bold" },
  revealBtn: { padding: "12px 40px", background: "#333", color: "#fff", borderRadius: "30px", border: "none", cursor: 'pointer' },
  resBtns: { display: "flex", gap: "20px", justifyContent: "center" },
  corBtn: { padding: "12px 30px", background: "#27ae60", color: "#fff", borderRadius: "10px", border: "none", cursor: 'pointer' },
  wrgBtn: { padding: "12px 30px", background: "#e74c3c", color: "#fff", borderRadius: "10px", border: "none", cursor: 'pointer' },
  actionPopup: { padding: "50px", borderRadius: "30px", color: "#fff", textAlign: "center", border: "5px solid #fff", maxWidth: '80%' }
};