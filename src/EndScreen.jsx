import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Confetti from "react-confetti";
const translations = {
  ar: { winner: "الفائز هو", score: "النقاط", back: "العودة للبداية", draw: "تعادل!", team: "فريق" },
  en: { winner: "The Winner is", score: "Score", back: "Back to Start", draw: "It's a Draw!", team: "Team" },
  fr: { winner: "Le gagnant est", score: "Score", back: "Retour au début", draw: "Match nul!", team: "Équipe" },
  de: { winner: "Der Gewinner ist", score: "Punktestand", back: "Zurück zum Start", draw: "Unentschieden!", team: "Mannschaft" }
};
export default function EndScreen({ room }) {
  const navigate = useNavigate();
  const lang = room?.lang || "ar";
  const t = translations[lang];

  // تحديد الاتجاه (يمين لليسار للعربية فقط)
  const direction = lang === 'ar' ? 'rtl' : 'ltr';

  const s1 = room?.team1?.score || 0;
  const s2 = room?.team2?.score || 0;
  const isTeam1Winner = s1 > s2;
  const isDraw = s1 === s2;

  // تشغيل صوت الجمهور عند الفوز (اختياري)
  useEffect(() => {
    const crowdSound = new Audio("/sounds/crowd-cheer.mp3");
    crowdSound.play().catch(() => {});
  }, []);

  return (
    <div style={{ ...styles.endOverlay, direction }}>
      <Confetti width={window.innerWidth} height={window.innerHeight} gravity={0.2} />
      
      <div style={styles.winCard}>
        {/* عرض لوحة النتائج النهائية */}
        <div style={styles.scoreBoard}>
          <div style={{...styles.teamResult, color: '#3498db'}}>
            <h3 style={{ fontSize: '1.5rem' }}>{room.team1.name}</h3>
            <div style={styles.bigScore}>{s1}</div>
          </div>
          
          <div style={styles.vsCircle}>VS</div>
          
          <div style={{...styles.teamResult, color: '#e74c3c'}}>
            <h3 style={{ fontSize: '1.5rem' }}>{room.team2.name}</h3>
            <div style={styles.bigScore}>{s2}</div>
          </div>
        </div>

        <hr style={{ margin: '30px 0', border: '0.5px solid #eee', opacity: 0.5 }} />

        {/* عرض الفائز بناءً على اللغة المختارة */}
        <div style={styles.winnerSection}>
          {isDraw ? (
            <h1 style={{ color: '#95a5a6', fontSize: '2.5rem' }}>{t.draw} 🤝</h1>
          ) : (
            <>
              <p style={{ fontSize: '1.2rem', color: '#7f8c8d', margin: 0 }}>{t.winner}</p>
              <h1 style={{ 
                fontSize: '3.2rem', 
                color: isTeam1Winner ? '#3498db' : '#e74c3c', 
                marginTop: '10px',
                textShadow: '2px 2px 10px rgba(0,0,0,0.1)'
              }}>
                🏆 {isTeam1Winner ? room.team1.name : room.team2.name}
              </h1>
            </>
          )}
        </div>

        <button 
          onClick={() => navigate("/")} 
          style={styles.backBtn}
          onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
        >
          {t.back}
        </button>
      </div>
    </div>
  );
}

const styles = {
  endOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 10, 35, 0.98)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  winCard: {
    background: '#fff',
    padding: '40px',
    borderRadius: '40px',
    textAlign: 'center',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
    maxWidth: '700px',
    width: '90%',
    animation: 'fadeIn 0.5s ease-out'
  },
  scoreBoard: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    background: '#f1f3f5',
    padding: '30px',
    borderRadius: '25px'
  },
  teamResult: { textAlign: 'center', flex: 1 },
  bigScore: { fontSize: '5rem', fontWeight: '900', lineHeight: 1 },
  vsCircle: { 
    width: '60px', height: '60px', background: '#2c3e50', color: '#fff', 
    borderRadius: '50%', display: 'flex', justifyContent: 'center', 
    alignItems: 'center', fontWeight: 'bold', margin: '0 20px', fontSize: '1.2rem'
  },
  winnerSection: { marginBottom: '40px' },
  backBtn: {
    padding: '18px 50px',
    fontSize: '1.3rem',
    background: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'transform 0.2s ease',
    boxShadow: '0 5px 15px rgba(39, 174, 96, 0.4)'
  }
};