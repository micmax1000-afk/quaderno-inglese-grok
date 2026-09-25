/* Mini corso A1 offline — lezioni + quiz, zero Gemini */
window.COURSE_A1 = {
  id: "a1-core",
  title: "Corso A1–A2",
  lessons: [
    {
      id: "l1",
      title: "Saluti e presentazioni",
      words: [
        { en: "hello", it: "ciao / salve" },
        { en: "goodbye", it: "arrivederci" },
        { en: "please", it: "per favore" },
        { en: "thank you", it: "grazie" },
        { en: "sorry", it: "scusa / mi dispiace" },
        { en: "name", it: "nome" }
      ],
      phrases: [
        "Hello! My name is Anna.",
        "Nice to meet you.",
        "How are you?",
        "I am fine, thank you."
      ],
      quiz: [
        { q: "Come si dice «grazie»?", options: ["please", "thank you", "sorry", "hello"], a: 1 },
        { q: "«Nice to meet you» significa…", options: ["Arrivederci", "Piacere di conoscerti", "Come stai?", "Scusa"], a: 1 },
        { q: "Completa: Hello! My ___ is Marco.", options: ["name", "age", "home", "friend"], a: 0 }
      ]
    },
    {
      id: "l2",
      title: "Numeri e età",
      words: [
        { en: "one", it: "uno" }, { en: "two", it: "due" }, { en: "three", it: "tre" },
        { en: "four", it: "quattro" }, { en: "five", it: "cinque" }, { en: "ten", it: "dieci" },
        { en: "age", it: "età" }, { en: "year", it: "anno" }
      ],
      phrases: [
        "I am twenty years old.",
        "How old are you?",
        "There are three books.",
        "I have two sisters."
      ],
      quiz: [
        { q: "«How old are you?» chiede…", options: ["Dove abiti?", "Quanti anni hai?", "Come stai?", "Come ti chiami?"], a: 1 },
        { q: "two =", options: ["uno", "due", "tre", "dieci"], a: 1 },
        { q: "Completa: I am ___ years old.", options: ["twenty", "book", "hello", "please"], a: 0 }
      ]
    },
    {
      id: "l3",
      title: "Famiglia",
      words: [
        { en: "family", it: "famiglia" }, { en: "mother", it: "madre" }, { en: "father", it: "padre" },
        { en: "brother", it: "fratello" }, { en: "sister", it: "sorella" }, { en: "child", it: "bambino" },
        { en: "husband", it: "marito" }, { en: "wife", it: "moglie" }
      ],
      phrases: [
        "This is my family.",
        "I have one brother and one sister.",
        "My mother is a teacher.",
        "His father works in a bank."
      ],
      quiz: [
        { q: "sister =", options: ["fratello", "sorella", "madre", "padre"], a: 1 },
        { q: "«My mother is a teacher»", options: ["Mio padre è insegnante", "Mia madre è insegnante", "Mia sorella studia", "Mio fratello lavora"], a: 1 },
        { q: "husband =", options: ["moglie", "marito", "figlio", "amico"], a: 1 }
      ]
    },
    {
      id: "l4",
      title: "Casa e oggetti",
      words: [
        { en: "house", it: "casa" }, { en: "room", it: "stanza" }, { en: "door", it: "porta" },
        { en: "window", it: "finestra" }, { en: "table", it: "tavolo" }, { en: "chair", it: "sedia" },
        { en: "bed", it: "letto" }, { en: "kitchen", it: "cucina" }
      ],
      phrases: [
        "Open the door, please.",
        "The book is on the table.",
        "My room is small but clean.",
        "We eat in the kitchen."
      ],
      quiz: [
        { q: "window =", options: ["porta", "finestra", "tavolo", "sedia"], a: 1 },
        { q: "Dove si mangia spesso in casa?", options: ["bed", "kitchen", "window", "door"], a: 1 },
        { q: "Completa: The book is ___ the table.", options: ["in", "on", "at", "to"], a: 1 }
      ]
    },
    {
      id: "l5",
      title: "Cibo e bevande",
      words: [
        { en: "water", it: "acqua" }, { en: "bread", it: "pane" }, { en: "milk", it: "latte" },
        { en: "coffee", it: "caffè" }, { en: "tea", it: "tè" }, { en: "apple", it: "mela" },
        { en: "breakfast", it: "colazione" }, { en: "dinner", it: "cena" }
      ],
      phrases: [
        "I would like a coffee, please.",
        "Do you want some water?",
        "Breakfast is at eight.",
        "She does not drink milk."
      ],
      quiz: [
        { q: "coffee =", options: ["tè", "caffè", "acqua", "latte"], a: 1 },
        { q: "«I would like a coffee» è…", options: ["un ordine/richiesta cortese", "un saluto", "una scusa", "una domanda sull'età"], a: 0 },
        { q: "breakfast =", options: ["cena", "pranzo", "colazione", "spuntino"], a: 2 }
      ]
    },
    {
      id: "l6",
      title: "Tempo e giorni",
      words: [
        { en: "today", it: "oggi" }, { en: "tomorrow", it: "domani" }, { en: "yesterday", it: "ieri" },
        { en: "Monday", it: "lunedì" }, { en: "Friday", it: "venerdì" }, { en: "weekend", it: "fine settimana" },
        { en: "morning", it: "mattina" }, { en: "night", it: "notte" }
      ],
      phrases: [
        "See you tomorrow.",
        "I work from Monday to Friday.",
        "What are you doing this weekend?",
        "Good morning!"
      ],
      quiz: [
        { q: "tomorrow =", options: ["ieri", "oggi", "domani", "sempre"], a: 2 },
        { q: "«Good morning» si usa…", options: ["di sera", "di mattina", "solo il lunedì", "mai"], a: 1 },
        { q: "weekend =", options: ["lunedì", "fine settimana", "mattina", "notte"], a: 1 }
      ]
    },
    {
      id: "l7",
      title: "Lavoro e scuola",
      words: [
        { en: "work", it: "lavoro / lavorare" }, { en: "job", it: "impiego" }, { en: "school", it: "scuola" },
        { en: "student", it: "studente" }, { en: "teacher", it: "insegnante" }, { en: "office", it: "ufficio" },
        { en: "study", it: "studiare" }, { en: "learn", it: "imparare" }
      ],
      phrases: [
        "I am a student.",
        "She works in an office.",
        "I study English every day.",
        "My teacher is very kind."
      ],
      quiz: [
        { q: "teacher =", options: ["studente", "insegnante", "ufficio", "lavoro"], a: 1 },
        { q: "Completa: I ___ English every day.", options: ["eat", "study", "open", "sleep"], a: 1 },
        { q: "office =", options: ["scuola", "ufficio", "casa", "negozio"], a: 1 }
      ]
    },
    {
      id: "l8",
      title: "Città e trasporti",
      words: [
        { en: "city", it: "città" }, { en: "street", it: "strada" }, { en: "bus", it: "autobus" },
        { en: "train", it: "treno" }, { en: "station", it: "stazione" }, { en: "ticket", it: "biglietto" },
        { en: "car", it: "auto" }, { en: "map", it: "mappa" }
      ],
      phrases: [
        "Where is the station?",
        "I go to work by bus.",
        "A ticket to Rome, please.",
        "Turn left at the next street."
      ],
      quiz: [
        { q: "station =", options: ["biglietto", "stazione", "autobus", "mappa"], a: 1 },
        { q: "«by bus» significa…", options: ["in auto", "in autobus", "a piedi", "in treno"], a: 1 },
        { q: "ticket =", options: ["mappa", "biglietto", "strada", "città"], a: 1 }
      ]
    },
    {
      id: "l9",
      title: "Tempo atmosferico",
      words: [
        { en: "weather", it: "tempo (meteo)" }, { en: "sun", it: "sole" }, { en: "rain", it: "pioggia" },
        { en: "hot", it: "caldo" }, { en: "cold", it: "freddo" }, { en: "wind", it: "vento" },
        { en: "cloud", it: "nuvola" }, { en: "snow", it: "neve" }
      ],
      phrases: [
        "It is sunny today.",
        "It is raining.",
        "It is very cold in winter.",
        "What is the weather like?"
      ],
      quiz: [
        { q: "«It is raining»", options: ["Fa caldo", "Sta piovendo", "C'è vento", "Nevica"], a: 1 },
        { q: "cold =", options: ["caldo", "freddo", "sole", "pioggia"], a: 1 },
        { q: "weather =", options: ["tempo (meteo)", "orologio", "stagione solo", "vento"], a: 0 }
      ]
    },
    {
      id: "l10",
      title: "Routine quotidiana",
      words: [
        { en: "wake up", it: "svegliarsi" }, { en: "get up", it: "alzarsi" }, { en: "have breakfast", it: "fare colazione" },
        { en: "go to work", it: "andare al lavoro" }, { en: "come home", it: "tornare a casa" },
        { en: "watch TV", it: "guardare la TV" }, { en: "go to bed", it: "andare a letto" }
      ],
      phrases: [
        "I wake up at seven.",
        "She goes to work by train.",
        "We have dinner at eight.",
        "I usually go to bed late."
      ],
      quiz: [
        { q: "«I wake up at seven»", options: ["Vado a letto alle sette", "Mi sveglio alle sette", "Lavoro alle sette", "Mangio alle sette"], a: 1 },
        { q: "go to bed =", options: ["alzarsi", "andare a letto", "fare colazione", "guardare la TV"], a: 1 },
        { q: "Completa: I usually ___ TV in the evening.", options: ["watch", "eat", "open", "drive"], a: 0 }
      ]
    },
    {
      id: "l11",
      title: "Present simple: like / want / need",
      words: [
        { en: "like", it: "piacere" }, { en: "love", it: "amare" }, { en: "want", it: "volere" },
        { en: "need", it: "avere bisogno" }, { en: "hate", it: "odiare" }, { en: "prefer", it: "preferire" }
      ],
      phrases: [
        "I like pizza.",
        "She does not like coffee.",
        "Do you want some water?",
        "I need a new phone."
      ],
      quiz: [
        { q: "Forma corretta:", options: ["She like tea", "She likes tea", "She liking tea", "She is like tea"], a: 1 },
        { q: "need =", options: ["volere", "avere bisogno", "odiare", "preferire"], a: 1 },
        { q: "«Do you want…?» è…", options: ["un ordine", "una domanda", "un saluto", "una scusa"], a: 1 }
      ]
    },
    {
      id: "l12",
      title: "In città: chiedere aiuto",
      words: [
        { en: "help", it: "aiuto / aiutare" }, { en: "where", it: "dove" }, { en: "left", it: "sinistra" },
        { en: "right", it: "destra" }, { en: "straight", it: "dritto" }, { en: "near", it: "vicino" },
        { en: "far", it: "lontano" }, { en: "excuse me", it: "mi scusi" }
      ],
      phrases: [
        "Excuse me, where is the museum?",
        "Go straight and turn right.",
        "Is it far from here?",
        "Can you help me, please?"
      ],
      quiz: [
        { q: "turn left =", options: ["vai dritto", "gira a sinistra", "è lontano", "aiutami"], a: 1 },
        { q: "«Excuse me» si usa per…", options: ["salutare un amico", "attirare attenzione / scusarsi", "ordinare cibo", "dire l'età"], a: 1 },
        { q: "far =", options: ["vicino", "lontano", "destra", "sinistra"], a: 1 }
      ]
    }

    ,
    {
      id: "l13",
      title: "Past simple: ieri",
      words: [
        { en: "yesterday", it: "ieri" }, { en: "went", it: "andai / è andato" },
        { en: "saw", it: "vidi / ha visto" }, { en: "did", it: "feci / ha fatto" },
        { en: "had", it: "ebbi / ha avuto" }, { en: "was / were", it: "ero / ero (pl.)" }
      ],
      phrases: [
        "I went to the park yesterday.",
        "She saw a good film.",
        "Did you have a nice day?",
        "We were at home."
      ],
      quiz: [
        { q: "Passato di go:", options: ["goed", "went", "gone", "goes"], a: 1 },
        { q: "«Did you…?» richiede…", options: ["forma base del verbo", "verbo al past", "-ing", "will"], a: 0 },
        { q: "yesterday =", options: ["domani", "oggi", "ieri", "sempre"], a: 2 }
      ]
    },
    {
      id: "l14",
      title: "Going to (futuro vicino)",
      words: [
        { en: "going to", it: "stare per / avere intenzione di" },
        { en: "tonight", it: "stasera" }, { en: "next week", it: "la prossima settimana" },
        { en: "plan", it: "piano" }, { en: "maybe", it: "forse" }
      ],
      phrases: [
        "I am going to study tonight.",
        "She is going to travel next month.",
        "Are you going to the party?",
        "We are going to buy a car."
      ],
      quiz: [
        { q: "Struttura corretta:", options: ["I going to work", "I am going to work", "I goes to work", "I be going work"], a: 1 },
        { q: "«next week» =", options: ["la scorsa settimana", "la prossima settimana", "oggi", "ieri"], a: 1 },
        { q: "tonight =", options: ["stasera", "stamattina", "domani", "sempre"], a: 0 }
      ]
    },
    {
      id: "l15",
      title: "Comparativi (A2)",
      words: [
        { en: "bigger", it: "più grande" }, { en: "smaller", it: "più piccolo" },
        { en: "better", it: "migliore" }, { en: "worse", it: "peggiore" },
        { en: "more interesting", it: "più interessante" }, { en: "than", it: "di (comparativo)" }
      ],
      phrases: [
        "This book is better than that one.",
        "My house is smaller than yours.",
        "English is more useful than you think.",
        "Today is hotter than yesterday."
      ],
      quiz: [
        { q: "Comparativo di good:", options: ["gooder", "better", "more good", "bestest"], a: 1 },
        { q: "«than» nei comparativi si traduce…", options: ["e", "di", "con", "per"], a: 1 },
        { q: "Completa: This film is ___ interesting than the book.", options: ["most", "more", "much", "many"], a: 1 }
      ]
    },
    {
      id: "l16",
      title: "Present perfect intro",
      words: [
        { en: "have / has", it: "avere (ausiliare)" }, { en: "ever", it: "mai (in domande)" },
        { en: "never", it: "mai" }, { en: "just", it: "appena" },
        { en: "already", it: "già" }, { en: "yet", it: "ancora / già (neg/dom)" }
      ],
      phrases: [
        "I have never been to London.",
        "Have you ever tried sushi?",
        "She has just arrived.",
        "We have already finished."
      ],
      quiz: [
        { q: "«I have never…» significa…", options: ["Non ho mai…", "Ho sempre…", "Avrò…", "Avevo…"], a: 0 },
        { q: "just in present perfect ≈", options: ["sempre", "appena", "mai", "domani"], a: 1 },
        { q: "Forma corretta:", options: ["She have gone", "She has gone", "She is gone to", "She going"], a: 1 }
      ]
    },
    {
      id: "l17",
      title: "Al ristorante (A2)",
      words: [
        { en: "menu", it: "menu" }, { en: "order", it: "ordinare" },
        { en: "bill", it: "conto" }, { en: "waiter", it: "cameriere" },
        { en: "delicious", it: "delizioso" }, { en: "reservation", it: "prenotazione" }
      ],
      phrases: [
        "Could we see the menu, please?",
        "I would like the pasta.",
        "Is service included?",
        "Could we have the bill?"
      ],
      quiz: [
        { q: "bill (in ristorante) =", options: ["menu", "conto", "cameriere", "prenotazione"], a: 1 },
        { q: "«I would like…» è…", options: ["scortese", "cortese per ordinare", "passato", "negazione"], a: 1 },
        { q: "reservation =", options: ["conto", "prenotazione", "menu", "cibo"], a: 1 }
      ]
    },
    {
      id: "l18",
      title: "Salute e corpo (A2)",
      words: [
        { en: "headache", it: "mal di testa" }, { en: "doctor", it: "medico" },
        { en: "medicine", it: "medicina" }, { en: "hurt", it: "fare male" },
        { en: "tired", it: "stanco" }, { en: "exercise", it: "esercizio fisico" }
      ],
      phrases: [
        "I have a headache.",
        "My back hurts.",
        "You should see a doctor.",
        "Exercise is good for you."
      ],
      quiz: [
        { q: "headache =", options: ["mal di schiena", "mal di testa", "raffreddore", "febbre"], a: 1 },
        { q: "«My back hurts»", options: ["Ho fame", "Mi fa male la schiena", "Sono stanco", "Sto bene"], a: 1 },
        { q: "medicine =", options: ["medico", "medicina", "ospedale", "esercizio"], a: 1 }
      ]
    }
  ]
};
