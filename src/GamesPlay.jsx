import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { db } from "./firebase";
import { doc, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("AIzaSyDipJccwc20r4YLdAGRN5Ji6xBCSxvCLOs");
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
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (timer === 0 && isActive) {
      setShowAnswer(true);
      setIsActive(false);
    }
    return () => clearInterval(interval);
  }, [isActive, timer]);

  const generateAIQuestion = async (catName, points) => {
    setIsGenerating(true);
    const lang = room?.lang || 'ar';
    const difficultyMap = {
      ar: points === 200 ? "سهل" : points === 400 ? "متوسط" : "صعب",
      en: points === 200 ? "Easy" : points === 400 ? "Medium" : "Hard",
      fr: points === 200 ? "Facile" : points === 400 ? "Moyen" : "Difficile",
      de: points === 200 ? "Einfach" : points === 400 ? "Mittel" : "Schwer"
    };
    const diff = difficultyMap[lang] || difficultyMap['en'];
    const prompts = {
      ar: `أنت خبير مسابقات. أنتج سؤالاً في فئة "${catName}". المستوى: ${diff}. المطلوب JSON: {"question": "نص السؤال", "answer": "الإجابة"}`,
      en: `You are a quiz expert. Generate a question in "${catName}". Difficulty: ${diff}. JSON: {"question": "text", "answer": "text"}`,
      fr: `Expert en quiz. Question en "${catName}". Difficulté: ${diff}. JSON: {"question": "texte", "answer": "texte"}`,
      de: `Quiz-Experte. Frage in "${catName}". Schwierigkeit: ${diff}. JSON: {"question": "Text", "answer": "Text"}`
    };

    try {
      const result = await model.generateContent(prompts[lang] || prompts['en']);
      const text = result.response.text();
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      return { question: "Error loading question", answer: "Try again" };
    } finally { setIsGenerating(false); }
  };

  const openQuestion = async (catName, points, teamKey) => {
    if (room?.[teamKey]?.isFrozen) return alert(room.lang === 'ar' ? "فريقك مجمد!" : "Team is frozen!");
    const roomRef = doc(db, "rooms", roomId);
    let finalTeam = teamKey;

    if (room?.stealNextQuestion && room.stealNextQuestion !== teamKey) {
      finalTeam = room.stealNextQuestion;
      alert(room.lang === 'ar' ? "🎭 تمت سرقة السؤال!" : "🎭 Question Stolen!");
      await updateDoc(roomRef, { stealNextQuestion: null });
    }

    const qId = `${catName}-${points}-${teamKey}`;
    if (usedQuestions.includes(qId)) return;

    if (!extraTurnActive && Math.random() < 0.15) {
      const cards = [
        { type: "BONUS", ar: "🎁 مضاعفة النقاط!", en: "🎁 Points Doubled!", fr: "🎁 Points Doublés!", de: "🎁 Punkte Verdoppelt!" },
        { type: "PENALTY", ar: "❌ خصم 200 نقطة!", en: "❌ -200 Points!", fr: "❌ -200 Points!", de: "❌ -200 Punkte!" },
        { type: "EXTRA", ar: "➕ سؤال إضافي!", en: "➕ Extra Question!", fr: "➕ Question Supplémentaire!", de: "➕ Zusatzfrage!" },
        { type: "DELETE", ar: "🗑️ حذف السؤال!", en: "🗑️ Question Deleted!", fr: "🗑️ Question Supprimée!", de: "🗑️ Frage Gelöscht!" }
      ];
      const card = cards[Math.floor(Math.random() * cards.length)];
      setRandomAction({ ...card, text: card[room.lang] || card['en'] });
      setShowActionCard(true);

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
    const pts = currentQuestion.points;
    const currentTeamKey = currentQuestion.team;

    if (room?.isFaultActive) {
      const targetTeam = isCorrect ? room.faultBy : currentTeamKey;
      const amount = isCorrect ? (pts / 2) : -(pts / 2);
      await updateDoc(roomRef, { [`${targetTeam}.score`]: increment(amount), isFaultActive: false, faultBy: null });
    } else if (isCorrect) {
      let finalPts = pts;
      if (room?.[currentTeamKey]?.nextBonus) {
        finalPts = pts * 2;
        await updateDoc(roomRef, { [`${currentTeamKey}.nextBonus`]: false });
      }
      await updateDoc(roomRef, { [`${currentTeamKey}.score`]: increment(finalPts) });
    }

    if (extraTurnActive) {
      setExtraTurnActive(false);
      alert(room.lang === 'ar' ? "🎁 سؤال إضافي لنفس الفريق!" : "🎁 Extra question!");
      const newAiData = await generateAIQuestion(currentQuestion.cat, currentQuestion.points);
      setCurrentQuestion({ ...newAiData, team: currentTeamKey, cat: currentQuestion.cat, points: currentQuestion.points });
      setShowAnswer(false); setTimer(60); setIsActive(true);
    } else {
      setUsedQuestions(prev => [...prev, `${currentQuestion.cat}-${currentQuestion.points}-${currentQuestion.team}`]);
      setCurrentQuestion(null); setIsActive(false); setShowAnswer(false);
    }
  };

  const useAction = async (teamKey, act) => {
    const roomRef = doc(db, "rooms", roomId);
    const opponent = teamKey === "team1" ? "team2" : "team1";
    const lang = room.lang;

    if (act.match(/تجميد|Freeze|Gel|Einfrieren/)) {
      await updateDoc(roomRef, { [`${opponent}.isFrozen`]: true });
      setTimeout(() => updateDoc(roomRef, { [`${opponent}.isFrozen`]: false }), 30000);
    } 
    else if (act.match(/فاول|Fault|Faute|Foul/)) {
      await updateDoc(roomRef, { isFaultActive: true, faultBy: teamKey });
    } 
    else if (act.match(/سرقة|Steal|Vol|Klauen/)) {
      const confirmMsg = { ar: "موافق: نقاط، إلغاء: سؤال", en: "OK: Pts, Cancel: Question" };
      const choice = window.confirm(confirmMsg[lang] || confirmMsg['en']);
      if (choice) await updateDoc(roomRef, { [`${teamKey}.score`]: increment(200), [`${opponent}.score`]: increment(-200) });
      else await updateDoc(roomRef, { stealNextQuestion: teamKey });
    }
    else if (act.match(/دبل|Double|Doppel/)) {
      await updateDoc(roomRef, { [`${teamKey}.nextBonus`]: true });
    }

    const updatedActions = room[teamKey].actions.filter(a => a !== act);
    await updateDoc(roomRef, { [`${teamKey}.actions`]: updatedActions });
  };

  if (!room) return <div style={loadingStyle}>Loading...</div>;

  return (
    <div style={mainContainer}>
      {isGenerating && (
        <div style={overlay}><div style={modal}><h2>{room.lang === 'ar' ? 'جاري استدعاء السؤال...' : 'AI Generating...'} ⚡</h2></div></div>
      )}

      <div style={headerStyle}>
        <div style={{ color: "#3498db", flex: 1 }}>
          <h2>{room?.team1?.name}</h2>
          <div style={scoreTxt}>{room?.team1?.score}</div>
          <div style={actRow}>{room?.team1?.actions?.map(a => (<button key={a} onClick={() => useAction('team1', a)} style={actBtn}>{a}</button>))}</div>
        </div>
        <div style={timerCircle}>{timer}</div>
        <div style={{ color: "#e74c3c", flex: 1 }}>
          <h2>{room?.team2?.name}</h2>
          <div style={scoreTxt}>{room?.team2?.score}</div>
          <div style={actRow}>{room?.team2?.actions?.map(a => (<button key={a} onClick={() => useAction('team2', a)} style={actBtn}>{a}</button>))}</div>
        </div>
      </div>

      <div style={gridStyle}>
        {allCategories.map((cat, idx) => (
          <div key={idx} style={ladderRow}>
            <div style={questionCluster}>
              <div style={pointsRight}>{[600, 400, 200].map(p => (<button key={p} onClick={() => openQuestion(cat, p, 'team1')} disabled={usedQuestions.includes(`${cat}-${p}-team1`)} style={{ ...pBtnSmall, background: usedQuestions.includes(`${cat}-${p}-team1`) ? "#444" : "#3498db" }}>{p}</button>))}</div>
              <div style={centerTextContainer}><div style={catTextLabel}>{cat}</div></div>
              <div style={pointsLeft}>{[600, 400, 200].map(p => (<button key={p} onClick={() => openQuestion(cat, p, 'team2')} disabled={usedQuestions.includes(`${cat}-${p}-team2`)} style={{ ...pBtnSmall, background: usedQuestions.includes(`${cat}-${p}-team2`) ? "#444" : "#e74c3c" }}>{p}</button>))}</div>
            </div>
          </div>
        ))}
      </div>

      {currentQuestion && (
        <div style={overlay}>
          <div style={modal}>
            <span style={badgeStyle}>{currentQuestion.cat} | {currentQuestion.points} {room?.[currentQuestion.team]?.nextBonus && "🔥 X2"}</span>
            {!showAnswer ? (<h1 style={qTextResponsive}>{currentQuestion.question}</h1>) : (
              <div style={answerBox}>
                <h3>{room.lang === 'ar' ? 'الإجابة:' : 'Answer:'}</h3>
                <h1 style={{ color: "#2ecc71" }}>{currentQuestion.answer}</h1>
              </div>
            )}
            {!showAnswer && (
              <div style={battleArea}>
                {['team1', 'team2'].map(t => (
                  <div key={t} style={teamControl}>
                    <span style={{color: t === 'team1' ? '#3498db' : '#e74c3c'}}>{room?.[t]?.name}</span>
                    <div style={actRowSmall}>{room?.[t]?.actions?.map(a => (<button key={a} onClick={() => useAction(t, a)} style={{...modalActBtn, background: t === 'team1' ? '#3498db' : '#e74c3c'}}>{a}</button>))}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={resRow}>
              {showAnswer ? (
                <><button onClick={() => handleResult(true)} style={resBtn}>{room.lang === 'ar' ? 'صح ✅' : 'Correct ✅'}</button>
                  <button onClick={() => handleResult(false)} style={{ ...resBtn, background: "#e74c3c" }}>{room.lang === 'ar' ? 'خطأ ❌' : 'Wrong ❌'}</button></>
              ) : (<button onClick={() => setShowAnswer(true)} style={revealBtn}>{room.lang === 'ar' ? 'كشف الإجابة 👁️' : 'Reveal Answer 👁️'}</button>)}
            </div>
          </div>
        </div>
      )}

      {showActionCard && (
        <div style={overlay}>
          <div style={{ ...modal, background: "#f1c40f", color: "#000", border: '8px solid white' }}>
            <h1 style={{ fontSize: "3rem" }}>{randomAction?.text}</h1>
          </div>
        </div>
      )}
    </div>
  );
}

// التنسيقات
const badgeStyle = { background: '#f39c12', color: 'white', padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold' };
const qTextResponsive = { fontSize: "1.7rem", margin: "25px 0", wordWrap: "break-word" };
const answerBox = { padding: '25px', background: '#fdfdfd', borderRadius: '20px', border: '3px solid #2ecc71' };
const battleArea = { display: "flex", background: "#f1f2f6", padding: "12px", borderRadius: "15px", marginTop: "15px" };
const teamControl = { flex: 1, display: "flex", flexDirection: "column", alignItems: "center" };
const actRowSmall = { display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" };
const modalActBtn = { padding: "5px 10px", borderRadius: "6px", color: "white", border: "none", fontSize: "10px", cursor: "pointer" };
const mainContainer = { direction: "rtl", background: "#2c3e50", minHeight: "100vh", padding: "20px" };
const headerStyle = { display: "flex", justifyContent: "space-around", alignItems: "center", background: "rgba(255, 255, 255, 0.1)", padding: "15px", borderRadius: "20px" };
const scoreTxt = { fontSize: "42px", fontWeight: "900", color: 'white' };
const timerCircle = { width: "70px", height: "70px", borderRadius: "50%", border: "5px solid #f1c40f", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "28px", background: "white" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "20px" };
const ladderRow = { background: "rgba(255,255,255,0.05)", padding: "15px", borderRadius: "25px" };
const questionCluster = { display: "flex", alignItems: "center", justifyContent: "center" };
const pointsRight = { display: "flex", flexDirection: "column", gap: "8px" };
const pointsLeft = { display: "flex", flexDirection: "column", gap: "8px" };
const pBtnSmall = { border: "1px solid white", color: "white", width: "65px", height: "45px", borderRadius: "12px", cursor: "pointer" };
const overlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.9)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modal = { background: "white", padding: "40px", borderRadius: "30px", textAlign: "center", width: "85%", maxWidth: "650px" };
const resRow = { display: "flex", justifyContent: "center", gap: "20px", marginTop: '25px' };
const resBtn = { padding: "15px 35px", background: "#2ecc71", color: "white", border: "none", borderRadius: "15px", cursor: "pointer" };
const revealBtn = { padding: "18px 50px", background: "#34495e", color: "white", border: "none", borderRadius: "50px", cursor: "pointer" };
const actRow = { display: "flex", gap: "8px", justifyContent: "center", marginTop: "10px" };
const actBtn = { padding: "6px 12px", borderRadius: "8px", border: "none", background: "rgba(255,255,255,0.2)", color: "white", fontSize: "12px" };
const loadingStyle = { color: "white", textAlign: "center", marginTop: "100px", fontSize: "28px" };
const centerTextContainer = { width: "160px", textAlign: 'center' };
const catTextLabel = { color: "#f1c40f", fontSize: "18px", fontWeight: "bold" };