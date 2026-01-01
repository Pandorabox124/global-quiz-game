import React, { useState } from "react";
import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// نظام الترجمة الشامل لـ 4 لغات
const i18n = {
  ar: {
    dir: "rtl", title: "تجهيز المواجهة ⚔️", start: "بدء اللعب 🚀", rules: "قواعد اللعبة 📜",
    rulesContent: (
  <div style={{ textAlign: 'right', fontSize: '15px', lineHeight: '1.7', color: '#374151', padding: '10px' }}>
    <h2 style={{ color: '#1e3a8a', textAlign: 'center', borderBottom: '2px solid #3498db', pb: '10px' }}>📜 الدليل الكامل للمواجهة</h2>

    {/* 1. نظام الفرق والتحضير */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>1️⃣ تحضير المواجهة:</h3>
    <p>
      • اللعبة قائمة على التحدي بين <b>فريقين</b> (فريق أزرق وفريق أحمر).
      <br />• كل فريق يقوم باختيار <b>4 فئات</b> يفضلها و <b>3 قدرات أكشن</b> تساعده أثناء اللعب.
      <br />• <b>ملاحظة:</b> جميع الأسئلة التي تظهر في اللعبة هي من الفئات التي اختارها الفريقان معاً، مما يجعل المنافسة عادلة وشاملة لخبرات الجميع.
    </p>

    {/* 2. آلية اللعب */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>2️⃣ كيف نلعب؟:</h3>
    <ul>
      <li>تظهر شبكة من الأسئلة مقسمة حسب الفئات ونقاط الصعوبة (200، 400، 600).</li>
      <li>يختار الفريق السؤال الذي يرغب به، وسيقوم <b>الذكاء الاصطناعي</b> بتوليد سؤال فوري.</li>
      <li>لدى الفريق <b>60 ثانية</b> للإجابة، وبعدها يتم كشف الإجابة وتقييمها بـ (صح أو خطأ).</li>
    </ul>

    {/* 3. كروت الأكشن العشوائية */}
    <h3 style={{ color: '#d97706', marginTop: '20px' }}>3️⃣ كروت المفاجآت (Action Cards):</h3>
    <p style={{ background: '#fffbeb', padding: '10px', borderRadius: '10px', borderRight: '5px solid #d97706' }}>
      أثناء اللعب، وعند النقر على أي سؤال عشوائي، قد يظهر لك "كارت مفاجأة" فجأة قبل ظهور السؤال:
    </p>
    <ul>
      <li>🎁 <b>هدية:</b> يتم مضاعفة نقاط السؤال الحالي تلقائياً لك.</li>
      <li>❌ <b>عقوبة:</b> يتم خصم 200 نقطة من رصيد فريقك قبل البدء.</li>
      <li>➕ <b>سؤال إضافي:</b> يمنحك حق فتح سؤال آخر فور انتهائك من الحالي.</li>
      <li>🗑️ <b>حذف السؤال:</b> يختفي السؤال تماماً وتضيع نقاطه على الجميع.</li>
    </ul>

    {/* 4. أزرار الأكشن الاستراتيجية */}
    <h3 style={{ color: '#dc2626', marginTop: '20px' }}>4️⃣ أزرار الأكشن (قدرات الفريق):</h3>
    <ul>
      <li>⚠️ <b>الفاول (Fault):</b> تضغط عليه قبل أن يفتح الخصم سؤاله. أنت تجبره على الإجابة، وإذا أخطأ يُخصم منه 50% من النقاط، وإذا أصاب تأخذ أنت نصف النقاط.</li>
      <li>🎭 <b>السرقة (Steal):</b> تمنحك خيارين؛ إما سرقة 200 نقطة فوراً من الخصم، أو "ترصد" لسؤاله القادم لتسرقه وتجيب عليه أنت.</li>
      <li>❄️ <b>التجميد (Freeze):</b> تمنع الخصم من اللعب أو النقر على أي سؤال لمدة 30 ثانية كاملة.</li>
      <li>🚀 <b>الدبل (Double):</b> تفعله قبل سؤالك الخاص لتضاعف نقاطه في حال كانت إجابتك صحيحة.</li>
    </ul>

    <hr style={{ margin: '20px 0', opacity: '0.2' }} />
    <p style={{ textAlign: 'center', fontWeight: 'bold', color: '#1e40af' }}>الهدف هو جمع أكبر عدد من النقاط واستخدام الأكشنات في الوقت المناسب لتعطيل الخصم! 🏆</p>
  </div>
),
    team: "الفريق", teamName: "اسم الفريق...", alert: "يرجى اختيار 4 فئات و3 أكشنات!",
    cats: {
      countries: { main: "الدول 🌍", subs: ["عواصم الدول", "ما هي الدولة", "لغة الدولة", "أكثر دولة"] },
      brain: { main: "ألعاب العقل 🧠", subs: ["حروف", "كلمات معكوسة", "أمثال و ألغاز", "تمثيل صامت"] },
      general: { main: "معلومات عامة 💡", subs: ["عالم الحيوانات", "أحداث عالمية", "عالم السيارات"] },
      football: { main: "كرة القدم ⚽", subs: ["كأس العالم", "الدوريات الخمس الكبرى", "دوري أبطال أوروبا", "رقم اللاعب", "خمن اللاعب", "الملاعب", "من سجل الهدف"] },
      gaming: { main: "الألعاب 🎮", subs: ["لعبة السنة", "تاريخ الإطلاق", "أشهر الألعاب"] },
      movies: { main: "الأفلام 🎬", subs: ["أفلام كلاسيكية", "خمن الممثل", "أشهر الأفلام"] },
      tech: { main: "التكنولوجيا 💻", subs: ["ذكاء اصطناعي", "برمجة", "شركات تقنية"] },
      history: { main: "تاريخ 🏛️", subs: ["فراعنة", "حروب عالمية", "عصور قديمة"] },
      science: { main: "علوم 🚀", subs: ["كواكب", "اختراعات", "جسم الإنسان"] },
      anime: { main: "أنمي ⛩️", subs: ["ون بيس", "خمن الشخصية", "خمن الانمي"] }
    }
  },
  en: {
    dir: "ltr", title: "Match Setup ⚔️", start: "Start Game 🚀", rules: "Rules 📜",
    rulesContent: (
  <div style={{ textAlign: 'left', fontSize: '15px', lineHeight: '1.7', color: '#374151', padding: '10px' }}>
    <h2 style={{ color: '#1e3a8a', textAlign: 'center', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>📜 Full Confrontation Guide</h2>

    {/* 1. Team System and Preparation */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>1️⃣ Match Preparation:</h3>
    <p>
      • The game is a challenge between <b>two teams</b> (Blue Team and Red Team).
      <br />• Each team selects <b>4 preferred categories</b> and <b>3 Action abilities</b> to help them during play.
      <br />• <b>Note:</b> All questions in the game come from the categories selected by both teams combined, ensuring a fair competition that covers everyone's expertise.
    </p>

    {/* 2. Gameplay Mechanism */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>2️⃣ How to Play?:</h3>
    <ul>
      <li>A grid of questions appears, divided by categories and difficulty points (200, 400, 600).</li>
      <li>The team selects a question, and the <b>AI</b> will instantly generate a question.</li>
      <li>The team has <b>60 seconds</b> to answer, after which the answer is revealed and evaluated (Correct or Wrong).</li>
    </ul>

    {/* 3. Random Action Cards */}
    <h3 style={{ color: '#d97706', marginTop: '20px' }}>3️⃣ Surprise Cards (Action Cards):</h3>
    <p style={{ background: '#fffbeb', padding: '10px', borderRadius: '10px', borderLeft: '5px solid #d97706' }}>
      During play, when clicking on any random question, a "Surprise Card" might suddenly appear before the question is shown:
    </p>
    <ul>
      <li>🎁 <b>Bonus:</b> Current question points are automatically doubled for you.</li>
      <li>❌ <b>Penalty:</b> 200 points are deducted from your team's balance before starting.</li>
      <li>➕ <b>Extra Question:</b> Gives you the right to open another question immediately after finishing the current one.</li>
      <li>🗑️ <b>Delete Question:</b> The question disappears completely, and its points are lost for everyone.</li>
    </ul>

    {/* 4. Strategic Action Buttons */}
    <h3 style={{ color: '#dc2626', marginTop: '20px' }}>4️⃣ Action Buttons (Team Abilities):</h3>
    <ul>
      <li>⚠️ <b>Fault:</b> Press it before the opponent opens their question. You force them to answer; if they fail, they lose 50% of the points, and if they succeed, you receive half the points.</li>
      <li>🎭 <b>Steal:</b> Gives you two choices: either steal 200 points immediately from the opponent, or "track" their next question to steal it and answer it yourself.</li>
      <li>❄️ <b>Freeze:</b> Prevents the opponent from playing or clicking any question for a full 30 seconds.</li>
      <li>🚀 <b>Double:</b> Activate it before your own question to double its points if your answer is correct.</li>
    </ul>

    <hr style={{ margin: '20px 0', opacity: '0.2' }} />
    <p style={{ textAlign: 'center', fontWeight: 'bold', color: '#1e40af' }}>The goal is to collect the most points and use Actions at the right time to disrupt the opponent! 🏆</p>
  </div>
),
    team: "Team", teamName: "Team Name...", alert: "Select 4 categories & 3 actions!",
    cats: {
      countries: { main: "Countries 🌍", subs: ["Capitals", "Guess Country", "Languages", "Statistics"] },
      brain: { main: "Brain Games 🧠", subs: ["Letters", "Reversed Words", "Puzzles", "Mime"] },
      general: { main: "General Info 💡", subs: ["Animals", "World Events", "Cars"] },
     football: { main: "Football ⚽", subs: ["World Cup", "Top 5 Leagues", "Champions League", "Player Number", "Guess the Player", "Stadiums", "Who Scored the Goal?"] },
      gaming: { main: "Gaming 🎮", subs: ["GOTY", "Release Dates", "Famous Games"] },
      movies: { main: "Movies 🎬", subs: ["Classics", "Guess Actor", "Blockbusters"] },
      tech: { main: "Technology 💻", subs: ["AI", "Programming", "Tech Giants"] },
      history: { main: "History 🏛️", subs: ["Pharaohs", "World Wars", "Ancient Times"] },
      science: { main: "Science 🚀", subs: ["Planets", "Inventions", "Human Body"] },
      anime: { main: "Anime ⛩️", subs: ["One Piece", "Characters", "Guess Anime"] }
    }
  },
  fr: {
    dir: "ltr", title: "Configuration ⚔️", start: "Jouer 🚀", rules: "Règles 📜",
   rulesContent: (
  <div style={{ textAlign: 'left', fontSize: '15px', lineHeight: '1.7', color: '#374151', padding: '10px' }}>
    <h2 style={{ color: '#1e3a8a', textAlign: 'center', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>📜 Guide Complet de la Confrontation</h2>

    {/* 1. Système d'équipe et préparation */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>1️⃣ Préparation du Match:</h3>
    <p>
      • Le jeu est un défi entre <b>deux équipes</b> (Équipe Bleue et Équipe Rouge).
      <br />• Chaque équipe choisit <b>4 catégories</b> préférées et <b>3 capacités d'Action</b> pour l'aider pendant le jeu.
      <br />• <b>Note:</b> Toutes les questions du jeu proviennent des catégories choisies par les deux équipes ensemble, garantissant une compétition équitable.
    </p>

    {/* 2. Mécanisme de jeu */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>2️⃣ Comment Jouer ?:</h3>
    <ul>
      <li>Une grille de questions s'affiche, divisée par catégories et points de difficulté (200, 400, 600).</li>
      <li>L'équipe choisit une question, et l'<b>IA</b> générera instantanément une question.</li>
      <li>L'équipe a <b>60 secondes</b> pour répondre, après quoi la réponse est révélée et évaluée (Vrai ou Faux).</li>
    </ul>

    {/* 3. Cartes d'action aléatoires */}
    <h3 style={{ color: '#d97706', marginTop: '20px' }}>3️⃣ Cartes Surprise (Action Cards):</h3>
    <p style={{ background: '#fffbeb', padding: '10px', borderRadius: '10px', borderLeft: '5px solid #d97706' }}>
      Pendant le jeu, en cliquant sur une question, une "Carte Surprise" peut apparaître soudainement avant l'affichage de la question:
    </p>
    <ul>
      <li>🎁 <b>Cadeau:</b> Les points de la question actuelle sont automatiquement doublés pour vous.</li>
      <li>❌ <b>Pénalité:</b> 200 points sont déduits du solde de votre équipe avant de commencer.</li>
      <li>➕ <b>Question Supplémentaire:</b> Vous donne le droit d'ouvrir une autre question immédiatement après la fin de l'actuelle.</li>
      <li>🗑️ <b>Supprimer la Question:</b> La question disparaît complètement et ses points sont perdus pour tout le monde.</li>
    </ul>

    {/* 4. Boutons d'action stratégiques */}
    <h3 style={{ color: '#dc2626', marginTop: '20px' }}>4️⃣ Boutons d'Action (Capacités d'Équipe):</h3>
    <ul>
      <li>⚠️ <b>Faute (Fault):</b> Appuyez avant que l'adversaire n'ouvre sa question. Vous le forcez à répondre; s'il échoue, il perd 50% des points, et s'il réussit, vous recevez la moitié des points.</li>
      <li>🎭 <b>Vol (Steal):</b> Vous donne deux choix : soit voler 200 points immédiatement, soit "guetter" sa prochaine question pour la voler et y répondre vous-même.</li>
      <li>❄️ <b>Gel (Freeze):</b> Empêche l'adversaire de jouer ou de cliquer sur une question pendant 30 secondes complètes.</li>
      <li>🚀 <b>Double:</b> Activez-le avant votre propre question pour doubler ses points si votre réponse est correcte.</li>
    </ul>

    <hr style={{ margin: '20px 0', opacity: '0.2' }} />
    <p style={{ textAlign: 'center', fontWeight: 'bold', color: '#1e40af' }}>Le but est de récolter le plus de points et d'utiliser les Actions au bon moment pour perturber l'adversaire ! 🏆</p>
  </div>
),
    team: "Équipe", teamName: "Nom...", alert: "Choisissez 4 catégories et 3 actions!",
    cats: {
      countries: { main: "Pays 🌍", subs: ["Capitales", "Quel pays?", "Langues", "Stats"] },
      brain: { main: "Esprit 🧠", subs: ["Lettres", "Mots inversés", "Énigmes", "Mime"] },
      general: { main: "Culture G 💡", subs: ["Animaux", "Événements", "Voitures"] },
      football: { main: "Football ⚽", subs: ["Coupe du Monde", "Top 5 Ligues", "Ligue des Champions", "Numéro du Joueur", "Devine le Joueur", "Stades", "Qui a marqué le but ?"]},
      gaming: { main: "Jeux Vidéo 🎮", subs: ["GOTY", "Dates", "Jeux Célèbres"] },
      movies: { main: "Cinéma 🎬", subs: ["Classiques", "Acteurs", "Succès"] },
      tech: { main: "Techno 💻", subs: ["IA", "Code", "Géants Tech"] },
      history: { main: "Histoire 🏛️", subs: ["Pharaons", "Guerres", "Antiquité"] },
      science: { main: "Science 🚀", subs: ["Planètes", "Inventions", "Corps humain"] },
      anime: { main: "Anime ⛩️", subs: ["One Piece", "Personnages", "anime"] }
    }
  },
  de: {
    dir: "ltr", title: "Spiel-Setup ⚔️", start: "Starten 🚀", rules: "Regeln 📜",
    rulesContent: (
  <div style={{ textAlign: 'left', fontSize: '15px', lineHeight: '1.7', color: '#374151', padding: '10px' }}>
    <h2 style={{ color: '#1e3a8a', textAlign: 'center', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>📜 Vollständiger Leitfaden zur Konfrontation</h2>

    {/* 1. Teamsystem und Vorbereitung */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>1️⃣ Spielvorbereitung:</h3>
    <p>
      • Das Spiel ist eine Herausforderung zwischen <b>zwei Teams</b> (Blaues Team und Rotes Team).
      <br />• Jedes Team wählt <b>4 bevorzugte Kategorien</b> und <b>3 Aktionsfähigkeiten</b> aus, um ihnen während des Spiels zu helfen.
      <br />• <b>Hinweis:</b> Alle Fragen im Spiel stammen aus den von beiden Teams gemeinsam gewählten Kategorien, was einen fairen Wettbewerb garantiert.
    </p>

    {/* 2. Spielmechanik */}
    <h3 style={{ color: '#2563eb', marginTop: '20px' }}>2️⃣ Wie wird gespielt?:</h3>
    <ul>
      <li>Ein Fragenraster erscheint, unterteilt nach Kategorien und Schwierigkeitspunkten (200, 400, 600).</li>
      <li>Das Team wählt eine Frage aus, und die <b>KI</b> erstellt sofort eine Frage.</li>
      <li>Das Team hat <b>60 Sekunden</b> Zeit zum Antworten, danach wird die Lösung angezeigt und bewertet (Richtig oder Falsch).</li>
    </ul>

    {/* 3. Zufällige Aktionskarten */}
    <h3 style={{ color: '#d97706', marginTop: '20px' }}>3️⃣ Überraschungskarten (Action Cards):</h3>
    <p style={{ background: '#fffbeb', padding: '10px', borderRadius: '10px', borderLeft: '5px solid #d97706' }}>
      Während des Spiels kann beim Klicken auf eine Frage plötzlich eine "Überraschungskarte" erscheinen, bevor die Frage angezeigt wird:
    </p>
    <ul>
      <li>🎁 <b>Geschenk:</b> Die Punkte der aktuellen Frage werden automatisch für Sie verdoppelt.</li>
      <li>❌ <b>Strafe:</b> 200 Punkte werden vor Beginn von Ihrem Teamkonto abgezogen.</li>
      <li>➕ <b>Zusatzfrage:</b> Gibt Ihnen das Recht, sofort nach Abschluss der aktuellen Frage eine weitere Frage zu öffnen.</li>
      <li>🗑️ <b>Frage löschen:</b> Die Frage verschwindet vollständig und die Punkte gehen für alle verloren.</li>
    </ul>

    {/* 4. Strategische Aktionsschaltflächen */}
    <h3 style={{ color: '#dc2626', marginTop: '20px' }}>4️⃣ Aktionsschaltflächen (Teamfähigkeiten):</h3>
    <ul>
      <li>⚠️ <b>Foul:</b> Drücken Sie diese, bevor der Gegner seine Frage öffnet. Sie zwingen ihn zur Antwort; scheitert er, verliert er 50% der Punkte, ist er erfolgreich, erhalten Sie die Hälfte der Punkte.</li>
      <li>🎭 <b>Klauen (Steal):</b> Gibt Ihnen zwei Möglichkeiten: Entweder klauen Sie dem Gegner sofort 200 Punkte oder Sie "verfolgen" seine nächste Frage, um sie zu stehlen und selbst zu beantworten.</li>
      <li>❄️ <b>Einfrieren:</b> Verhindert, dass der Gegner für volle 30 Sekunden spielt oder eine Frage anklickt.</li>
      <li>🚀 <b>Doppel:</b> Aktivieren Sie dies vor Ihrer eigenen Frage, um die Punkte zu verdoppeln, wenn Ihre Antwort richtig ist.</li>
    </ul>

    <hr style={{ margin: '20px 0', opacity: '0.2' }} />
    <p style={{ textAlign: 'center', fontWeight: 'bold', color: '#1e40af' }}>Ziel ist es, die meisten Punkte zu sammeln und Aktionen im richtigen Moment einzusetzen, um den Gegner zu stören! 🏆</p>
  </div>
),
    team: "Team", teamName: "Team Name...", alert: "Wähle 4 Kategorien & 3 Aktionen!",
    cats: {
      countries: { main: "Länder 🌍", subs: ["Hauptstädte", "Welches Land?", "Sprachen", "Stats"] },
      brain: { main: "Denksport 🧠", subs: ["Buchstaben", "Rückwärts", "Rätsel", "Pantomime"] },
      general: { main: "Allgemein 💡", subs: ["Tiere", "Weltgeschehen", "Autos"] },
      football: { main: "Fußball ⚽", subs: ["Weltmeisterschaft", "Top 5 Ligen", "Champions League", "Spielernummer", "Errate den Spieler", "Stadien", "Wer hat das Tor geschossen?"] },
      gaming: { main: "Gaming 🎮", subs: ["GOTY", "Release", "Bekannte Spiele"] },
      movies: { main: "Filme 🎬", subs: ["Klassiker", "Schauspieler", "Blockbuster"] },
      tech: { main: "Technik 💻", subs: ["KI", "Programmierung", "Tech-Giganten"] },
      history: { main: "Geschichte 🏛️", subs: ["Pharaonen", "Weltkriege", "Antike"] },
      science: { main: "Wissenschaft 🚀", subs: ["Planeten", "Erfindungen", "Körper"] },
      anime: { main: "Anime ⛩️", subs: ["One Piece", "Charaktere", "anime"] }
    }
  }
};

const actionsList = [
  { id: "STEAL", label: { ar: "سرقة 🎭", en: "Steal 🎭", fr: "Voler 🎭", de: "Klauen 🎭" } },
  { id: "FREEZE", label: { ar: "تجميد ❄️", en: "Freeze ❄️", fr: "Geler ❄️", de: "Frieren ❄️" } },
  { id: "DOUBLE", label: { ar: "دبل 🚀", en: "Double 🚀", fr: "Double 🚀", de: "Doppel 🚀" } },
  { id: "FAULT", label: { ar: "فاول ⚠️", en: "Fault ⚠️", fr: "Faute ⚠️", de: "Foul ⚠️" } }
];

export default function CreateRoom() {
  const [lang, setLang] = useState("en");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [openCat, setOpenCat] = useState(null);
  const [team1, setTeam1] = useState({ name: "", cats: [], actions: [], score: 0 });
  const [team2, setTeam2] = useState({ name: "", cats: [], actions: [], score: 0 });
  const [activeTeam, setActiveTeam] = useState(1);
  const [loading, setLoading] = useState(false);

  const t = i18n[lang];

  const handleCatClick = (subCat) => {
    const team = activeTeam === 1 ? team1 : team2;
    const setter = activeTeam === 1 ? setTeam1 : setTeam2;
    if (team.cats.includes(subCat)) {
      setter({ ...team, cats: team.cats.filter(c => c !== subCat) });
    } else if (team.cats.length < 4) {
      setter({ ...team, cats: [...team.cats, subCat] });
    }
  };

  const toggleAction = (num, actId) => {
    const team = num === 1 ? team1 : team2;
    const setter = num === 1 ? setTeam1 : setTeam2;
    if (team.actions.includes(actId)) setter({ ...team, actions: team.actions.filter(a => a !== actId) });
    else if (team.actions.length < 3) setter({ ...team, actions: [...team.actions, actId] });
  };

  const handleStart = async () => {
    if (!team1.name || !team2.name || team1.cats.length < 4 || team2.cats.length < 4) {
      alert(t.alert); return;
    }
    setLoading(true);
    try {
      const t1Actions = team1.actions.map(id => actionsList.find(a => a.id === id).label[lang]);
      const t2Actions = team2.actions.map(id => actionsList.find(a => a.id === id).label[lang]);
      const docRef = await addDoc(collection(db, "rooms"), {
        team1: { ...team1, actions: t1Actions },
        team2: { ...team2, actions: t2Actions },
        lang, status: "waiting_for_ai", createdAt: serverTimestamp()
      });
      window.location.href = `/game/${docRef.id}`;
    } catch (e) { setLoading(false); alert("Error"); }
  };

  return (
    <div style={{ ...pageContainer, direction: t.dir }}>
      <div style={topNav}>
        <button onClick={() => setShowRules(true)} style={navBtn}>{t.rules}</button>
        <div style={{position: 'relative'}}>
          <button onClick={() => setShowLangMenu(!showLangMenu)} style={navBtn}>🌐 {lang.toUpperCase()}</button>
          {showLangMenu && (
            <div style={langDropdown}>
              {["ar", "en", "fr", "de"].map((l) => (
                <button key={l} onClick={() => { setLang(l); setShowLangMenu(false); }} style={langOption}>
                   {l === "ar" ? "العربية" : l === "en" ? "English" : l === "fr" ? "Français" : "Deutsch"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>  

      <div style={gameLogoStyle}>GLOBAL QUIZ GAME</div>
      <h1 style={mainTitle}>{t.title}</h1>

      <div style={tabsContainer}>
        <button onClick={() => setActiveTeam(1)} style={{...tabBtn, borderBottom: activeTeam === 1 ? "4px solid #3498db" : "none", color: activeTeam === 1 ? "#fff" : "#888"}}>
          {t.team} 1 ({team1.cats.length}/4)
        </button>
        <button onClick={() => setActiveTeam(2)} style={{...tabBtn, borderBottom: activeTeam === 2 ? "4px solid #e74c3c" : "none", color: activeTeam === 2 ? "#fff" : "#888"}}>
          {t.team} 2 ({team2.cats.length}/4)
        </button>
      </div>

      <div style={accordionWrap}>
        {Object.entries(t.cats).map(([key, catInfo]) => (
          <div key={key} style={accItem}>
            <div onClick={() => setOpenCat(openCat === key ? null : key)} style={accHeader}>
              <span>{catInfo.main}</span>
              <span>{openCat === key ? "−" : "+"}</span>
            </div>
            {openCat === key && (
              <div style={accBody}>
                {catInfo.subs.map(sub => {
                  const isSelected = (activeTeam === 1 ? team1 : team2).cats.includes(sub);
                  return (
                    <div key={sub} onClick={() => handleCatClick(sub)} 
                      style={{...subCard, background: isSelected ? (activeTeam === 1 ? '#3498db' : '#e74c3c') : 'rgba(255,255,255,0.1)'}}>
                      <span style={subLabel}>{sub}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={setupRow}>
        {[1, 2].map(num => (
          <div key={num} style={setupCard}>
            <input placeholder={t.teamName} value={num === 1 ? team1.name : team2.name} 
              onChange={(e) => num === 1 ? setTeam1({...team1, name: e.target.value}) : setTeam2({...team2, name: e.target.value})}
              style={inputField} />
            <div style={actsGrid}>
              {actionsList.map(act => (
                <button key={act.id} onClick={() => toggleAction(num, act.id)} 
                  style={{...actBtn, background: (num === 1 ? team1 : team2).actions.includes(act.id) ? "#f1c40f" : "rgba(255,255,255,0.1)", color: (num === 1 ? team1 : team2).actions.includes(act.id) ? "#000" : "#fff"}}>
                  {act.label[lang]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={handleStart} style={startBtn} disabled={loading}>{loading ? "..." : t.start}</button>

      {showRules && (
        <div style={overlay} onClick={() => setShowRules(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{marginBottom: '10px'}}>{t.rules}</h2>
            <div style={{maxHeight: '400px', overflowY: 'auto'}}>{t.rulesContent}</div>
            <button onClick={() => setShowRules(false)} style={closeBtn}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

// التنسيقات (Full Width Accordion & Dark Theme)
const pageContainer = { minHeight: "100vh", padding: "30px 20px", background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", color: "#fff", fontFamily: "sans-serif" };
const topNav = { display: "flex", justifyContent: "space-between", marginBottom: "30px" };
const navBtn = { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "8px 20px", borderRadius: "20px", cursor: "pointer" };
const langDropdown = { position: "absolute", top: "45px", right: 0, background: "white", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column", minWidth: "120px", zIndex: 100 };
const langOption = { padding: "10px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #eee", textAlign: "center", color: "#333" };
const mainTitle = { textAlign: "center", fontSize: "24px", marginBottom: "30px" };
const tabsContainer = { display: "flex", justifyContent: "center", gap: "20px", marginBottom: "30px" };
const tabBtn = { background: "none", border: "none", padding: "10px", fontSize: "16px", fontWeight: "bold", cursor: "pointer" };
const accordionWrap = { width: "100%", margin: "0 auto 40px" };
const accItem = { background: "rgba(255,255,255,0.05)", marginBottom: "15px", borderRadius: "20px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" };
const accHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "20px", background: "rgba(255,255,255,0.07)", cursor: "pointer", fontWeight: "bold", fontSize: "20px" };
const accBody = { padding: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "15px", background: "rgba(0,0,0,0.2)" };
const subCard = { display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", borderRadius: "12px", cursor: "pointer", textAlign: "center", minHeight: "60px", fontWeight: "600" };
const subLabel = { fontSize: "16px" };
const setupRow = { display: "flex", gap: "20px", justifyContent: "center", flexWrap: "wrap" };
const setupCard = { background: "rgba(255,255,255,0.1)", padding: "20px", borderRadius: "20px", width: "280px" };
const inputField = { width: "100%", padding: "10px", borderRadius: "8px", border: "none", marginBottom: "15px" };
const actsGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" };
const actBtn = { padding: "8px", border: "none", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontWeight: "bold" };
const startBtn = { display: "block", margin: "40px auto", padding: "15px 60px", background: "#2ecc71", color: "#fff", border: "none", borderRadius: "30px", fontSize: "18px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 10px 20px rgba(46, 204, 113, 0.3)" };
const overlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modal = { background: "#fff", padding: "30px", borderRadius: "20px", width: "90%", maxWidth: "500px", color: "#333" };
const closeBtn = { marginTop: "20px", padding: "10px 30px", background: "#3498db", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer" };
const gameLogoStyle = { textAlign: "center", fontSize: "40px", fontWeight: "900", color: "#fff", marginBottom: "10px", textShadow: "0px 10px 20px rgba(0,0,0,0.5)" };