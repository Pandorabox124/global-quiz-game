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
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, timer]);

  const generateAIQuestion = async (catName, points) => {
    setIsGenerating(true);
    const isAr = room?.lang === 'ar';
    const difficulty = points === 200 ? "سهل" : points === 400 ? "متوسط" : "صعب";
    const prompt = `أنت خبير مسابقات. أنتج سؤالاً في فئة "${catName}". المستوى: ${difficulty}. المطلوب JSON: {"question": "نص السؤال", "answer": "الإجابة"}`;
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      return { question: `سؤال في ${catName}؟`, answer: "حسب اللاعب" };
    } finally { setIsGenerating(false); }
  };

  const openQuestion = async (catName, points, teamKey) => {
    if (room?.[teamKey]?.isFrozen) return alert("الفريق مجمد!");
    
    // فحص إذا كان السؤال مسروقاً مسبقاً
    let finalTeam = teamKey;
    if (room?.stealNextQuestion && room.stealNextQuestion !== teamKey) {
      finalTeam = room.stealNextQuestion;
      alert(room.lang === 'ar' ? "🎭 تمت سرقة هذا السؤال!" : "🎭 This question was stolen!");
      await updateDoc(doc(db, "rooms", roomId), { stealNextQuestion: null });
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
      setRandomAction({ ...card, text: room.lang === 'ar' ? card.ar : card.en });
      setShowActionCard(true);

      setTimeout(async () => {
        const roomRef = doc(db, "rooms", roomId);
        setShowActionCard(false);
        if (card.type === "DELETE") {
           setUsedQuestions(prev => [...prev, qId]);
        } else {
          if (card.type === "EXTRA") setExtraTurnActive(true);
          if (card.type === "PENALTY") await updateDoc(roomRef, { [`${finalTeam}.score`]: increment(-200) });
          if (card.type === "BONUS") await updateDoc(roomRef, { [`${finalTeam}.nextBonus`]: true });
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
  };

  const handleResult = async (isCorrect) => {
    const roomRef = doc(db, "rooms", roomId);
    const pts = currentQuestion.points;
    const opponent = currentQuestion.team === "team1" ? "team2" : "team1";

    if (room?.isFaultActive) {
      // منطق الفاول المحدث
      if (isCorrect) {
        // إذا أجاب الخصم صح: صاحب الفاول يأخذ نصف النقاط فقط
        await updateDoc(roomRef, { [`${room.faultBy}.score`]: increment(pts / 2) });
      } else {
        // إذا أجاب الخصم خطأ: يُخصم من الخصم نصف النقاط
        await updateDoc(roomRef, { [`${opponent}.score`]: increment(-(pts / 2)) });
      }
      await updateDoc(roomRef, { isFaultActive: false, faultBy: null });
    } else {
      // المنطق الطبيعي
      if (isCorrect) {
        let finalPts = pts;
        if (room?.[currentQuestion.team]?.nextBonus) {
          finalPts *= 2;
          await updateDoc(roomRef, { [`${currentQuestion.team}.nextBonus`]: false });
        }
        await updateDoc(roomRef, { [`${currentQuestion.team}.score`]: increment(finalPts) });
      }
    }

    setUsedQuestions(prev => [...prev, `${currentQuestion.cat}-${currentQuestion.points}-${currentQuestion.team}`]);
    setCurrentQuestion(null);
    setIsActive(false);
    setShowAnswer(false);
    setTimer(60);
    setExtraTurnActive(false);
  };

  const useAction = async (teamKey, act) => {
    if (!room?.[teamKey]?.actions) return;
    const roomRef = doc(db, "rooms", roomId);
    const opponent = teamKey === "team1" ? "team2" : "team1";
    const isAr = room?.lang === 'ar';

    if (act.includes("تجميد") || act.includes("Freeze")) {
      await updateDoc(roomRef, { [`${opponent}.isFrozen`]: true });
      setTimeout(() => updateDoc(roomRef, { [`${opponent}.isFrozen`]: false }), 30000);
    } 
    else if (act.includes("فاول") || act.includes("Fault")) {
      await updateDoc(roomRef, { isFaultActive: true, faultBy: teamKey });
      alert(isAr ? "⚠️ تم تفعيل الفاول! الخصم مجبر على الإجابة على سؤالك الحالي." : "⚠️ Fault activated! Opponent must answer your question.");
    } 
    else if (act.includes("سرقة") || act.includes("Steal")) {
      const choice = window.confirm(isAr ? 
        "موافق: لسرقة 200 نقطة من الخصم فوراً\nإلغاء: لسرقة السؤال القادم للخصم" : 
        "OK: Steal 200 points from opponent\nCancel: Steal opponent's next question");

      if (choice) {
        await updateDoc(roomRef, { 
          [`${teamKey}.score`]: increment(200),
          [`${opponent}.score`]: increment(-200)
        });
      } else {
        await updateDoc(roomRef, { stealNextQuestion: teamKey });
      }
    }

    const updated = room[teamKey].actions.filter(a => a !== act);
    await updateDoc(roomRef, { [`${teamKey}.actions`]: updated });
  };

  if (!room) return <div style={{color: 'white', textAlign: 'center', marginTop: '100px'}}>Loading...</div>;
  const isAr = room?.lang === 'ar';

  return (
    <div style={mainContainer}>
      {isGenerating && (
        <div style={overlay}><div style={modal}><h2 style={{color: '#3498db'}}>{isAr ? 'جاري تجهيز السؤال...' : 'Thinking...'} ⚡</h2></div></div>
      )}

      <div style={headerStyle}>
        <div style={{ color: "#3498db", flex: 1 }}>
          <h2>{room?.team1?.name}</h2>
          <div style={scoreTxt}>{room?.team1?.score}</div>
          <div style={actRow}>
            {room?.team1?.actions?.map(a => (
              <button key={a} onClick={() => useAction('team1', a)} style={actBtn}>{a}</button>
            ))}
          </div>
        </div>
        <div style={timerCircle}>{timer}</div>
        <div style={{ color: "#e74c3c", flex: 1 }}>
          <h2>{room?.team2?.name}</h2>
          <div style={scoreTxt}>{room?.team2?.score}</div>
          <div style={actRow}>
            {room?.team2?.actions?.map(a => (
              <button key={a} onClick={() => useAction('team2', a)} style={actBtn}>{a}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={gridStyle}>
        {allCategories.map((cat, idx) => (
          <div key={idx} style={ladderRow}>
            <div style={questionCluster}>
              <div style={pointsRight}>
                {[600, 400, 200].map(p => (
                  <button key={p} onClick={() => openQuestion(cat, p, 'team1')} disabled={usedQuestions.includes(`${cat}-${p}-team1`)} style={{ ...pBtnSmall, background: usedQuestions.includes(`${cat}-${p}-team1`) ? "#444" : "#3498db" }}>{p}</button>
                ))}
              </div>
              <div style={centerTextContainer}><div style={catTextLabel}>{cat}</div></div>
              <div style={pointsLeft}>
                {[600, 400, 200].map(p => (
                  <button key={p} onClick={() => openQuestion(cat, p, 'team2')} disabled={usedQuestions.includes(`${cat}-${p}-team2`)} style={{ ...pBtnSmall, background: usedQuestions.includes(`${cat}-${p}-team2`) ? "#444" : "#e74c3c" }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {currentQuestion && (
        <div style={overlay}>
          <div style={modal}>
            <div style={{ marginBottom: '15px' }}>
              <span style={{ background: '#f39c12', color: 'white', padding: '4px 12px', borderRadius: '15px' }}>
                {currentQuestion.cat} - {currentQuestion.points} {room?.isFaultActive && "⚠️ FAULT"}
              </span>
            </div>
            <h1 style={{fontSize: '1.8rem'}}>{currentQuestion.question}</h1>
            {showAnswer && (
              <div style={{ padding: '15px', background: '#e8f8f5', borderRadius: '15px', margin: '15px 0' }}>
                <h2 style={{ color: "#2ecc71", margin: 0 }}>{isAr ? 'الإجابة:' : 'Answer:'} {currentQuestion.answer}</h2>
              </div>
            )}
            <div style={resRow}>
              {showAnswer ? (
                <>
                  <button onClick={() => handleResult(true)} style={resBtn}>{isAr ? 'صح ✅' : 'Correct ✅'}</button>
                  <button onClick={() => handleResult(false)} style={{ ...resBtn, background: "#e74c3c" }}>{isAr ? 'خطأ ❌' : 'Wrong ❌'}</button>
                </>
              ) : (
                <button onClick={() => setShowAnswer(true)} style={revealBtn}>{isAr ? 'كشف الإجابة 👁️' : 'Reveal Answer 👁️'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showActionCard && (
        <div style={overlay}>
          <div style={{ ...modal, background: "#f1c40f", color: "#000" }}>
            <h1 style={{ fontSize: "2.5rem" }}>{randomAction?.text}</h1>
          </div>
        </div>
      )}
    </div>
  );
}

// التنسيقات (تم الحفاظ عليها)
const centerTextContainer = { width: "150px", height: "60px", display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(255,255,255,0.1)", borderRadius: "15px", margin: "0 10px" };
const catTextLabel = { color: "#fff", fontSize: "16px", fontWeight: "bold", textAlign: "center" };
const mainContainer = { direction: "rtl", background: "linear-gradient(135deg, #7189bf 0%, #9399b2 100%)", minHeight: "100vh", padding: "20px" };
const headerStyle = { display: "flex", justifyContent: "space-around", alignItems: "center", background: "rgba(255, 255, 255, 0.15)", padding: "15px", borderRadius: "20px", marginBottom: "30px", textAlign: "center" };
const scoreTxt = { fontSize: "36px", fontWeight: "bold" };
const timerCircle = { width: "70px", height: "70px", borderRadius: "50%", border: "4px solid #f1c40f", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "28px", fontWeight: "bold", background: "#fff", color: "#000" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "25px", maxWidth: "1200px", margin: "0 auto" };
const ladderRow = { display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(255, 255, 255, 0.15)", padding: "20px", borderRadius: "30px" };
const questionCluster = { display: "flex", alignItems: "center", justifyContent: "center" };
const pointsRight = { display: "flex", flexDirection: "column", gap: "10px" };
const pointsLeft = { display: "flex", flexDirection: "column", gap: "10px" };
const pBtnSmall = { border: "2px solid white", color: "white", width: "60px", height: "40px", borderRadius: "12px", cursor: "pointer", fontWeight: "bold" };
const overlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modal = { background: "white", padding: "30px", borderRadius: "25px", textAlign: "center", width: "85%", maxWidth: "500px", color: "black" };
const resRow = { display: "flex", justifyContent: "center", gap: "20px", marginTop: '20px' };
const resBtn = { padding: "12px 30px", background: "#2ecc71", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", fontWeight: "bold" };
const revealBtn = { padding: "15px 40px", background: "#2c3e50", color: "white", border: "none", borderRadius: "50px", cursor: "pointer" };
const actRow = { display: "flex", gap: "5px", justifyContent: "center", flexWrap: "wrap", marginTop: "10px" };
const actBtn = { padding: "5px 10px", borderRadius: "8px", border: "1px solid white", background: "rgba(255,255,255,0.2)", color: "white", fontSize: "11px" };