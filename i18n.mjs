// i18n.mjs - report translations.
// The report is authored in Dutch; this module translates the fixed chrome (labels,
// headings, buttons) into the chosen language. Findings text is written by the model in
// that language directly, so only these interface strings need a table.
export const LANGS = [
  { code: 'nl', label: 'Nederlands', ai: 'Dutch' },
  { code: 'en', label: 'English', ai: 'English' },
  { code: 'de', label: 'Deutsch', ai: 'German' },
  { code: 'fr', label: 'Français', ai: 'French' },
  { code: 'es', label: 'Español', ai: 'Spanish' },
  { code: 'pt', label: 'Português', ai: 'Portuguese' },
  { code: 'it', label: 'Italiano', ai: 'Italian' },
  { code: 'zh', label: '中文', ai: 'Simplified Chinese' },
];

// Dutch source phrase -> translations. Missing keys fall back to English, then Dutch.
const P = {
  'Naar de inhoud': { en: 'Skip to content', de: 'Zum Inhalt', fr: 'Aller au contenu', es: 'Ir al contenido', pt: 'Ir para o conteúdo', it: 'Vai al contenuto', zh: '跳到内容' },
  'Onderdelen': { en: 'Sections', de: 'Abschnitte', fr: 'Sections', es: 'Secciones', pt: 'Secções', it: 'Sezioni', zh: '栏目' },
  'Overzicht': { en: 'Overview', de: 'Überblick', fr: 'Aperçu', es: 'Resumen', pt: 'Resumo', it: 'Panoramica', zh: '概览' },
  'Risicokaart': { en: 'Risk map', de: 'Risikokarte', fr: 'Carte des risques', es: 'Mapa de riesgos', pt: 'Mapa de risco', it: 'Mappa dei rischi', zh: '风险地图' },
  'Stappenplan': { en: 'Action plan', de: 'Maßnahmenplan', fr: 'Plan d’action', es: 'Plan de acción', pt: 'Plano de ação', it: 'Piano d’azione', zh: '行动清单' },
  'Bevindingen': { en: 'Findings', de: 'Befunde', fr: 'Constats', es: 'Hallazgos', pt: 'Constatações', it: 'Risultati', zh: '发现' },
  'Achtergrond': { en: 'Background', de: 'Hintergrund', fr: 'Contexte', es: 'Contexto', pt: 'Contexto', it: 'Contesto', zh: '背景' },
  'Donker thema': { en: 'Dark theme', de: 'Dunkles Design', fr: 'Thème sombre', es: 'Tema oscuro', pt: 'Tema escuro', it: 'Tema scuro', zh: '深色主题' },
  'Afdrukken of bewaren als PDF': { en: 'Print or save as PDF', de: 'Drucken oder als PDF speichern', fr: 'Imprimer ou enregistrer en PDF', es: 'Imprimir o guardar como PDF', pt: 'Imprimir ou guardar como PDF', it: 'Stampa o salva come PDF', zh: '打印或保存为 PDF' },
  'Afdrukken': { en: 'Print', de: 'Drucken', fr: 'Imprimer', es: 'Imprimir', pt: 'Imprimir', it: 'Stampa', zh: '打印' },
  'Beveiligingsrapport': { en: 'Security report', de: 'Sicherheitsbericht', fr: 'Rapport de sécurité', es: 'Informe de seguridad', pt: 'Relatório de segurança', it: 'Rapporto di sicurezza', zh: '安全报告' },
  'Wat moet eerst?': { en: 'What comes first?', de: 'Was zuerst?', fr: 'Quoi en premier ?', es: '¿Qué es lo primero?', pt: 'O que vem primeiro?', it: 'Cosa viene prima?', zh: '先做什么？' },
  'Actief, van buitenaf': { en: 'Active, from outside', de: 'Aktiv, von außen', fr: 'Actif, de l’extérieur', es: 'Activo, desde fuera', pt: 'Ativo, de fora', it: 'Attivo, dall’esterno', zh: '主动测试，外部视角' },
  'Zo staat het ervoor': { en: 'Where things stand', de: 'So steht es', fr: 'Où en sont les choses', es: 'Cómo está la situación', pt: 'Como estão as coisas', it: 'Come stanno le cose', zh: '现状' },
  'verdeeld naar ernst': { en: 'grouped by severity', de: 'nach Schweregrad', fr: 'par gravité', es: 'por gravedad', pt: 'por gravidade', it: 'per gravità', zh: '按严重程度' },
  'Vandaag oplossen': { en: 'Fix today', de: 'Heute beheben', fr: 'À corriger aujourd’hui', es: 'Corregir hoy', pt: 'Corrigir hoje', it: 'Da correggere oggi', zh: '今日修复' },
  'punt is kritiek of hoog': { en: 'issue is critical or high', de: 'Punkt ist kritisch oder hoch', fr: 'point est critique ou élevé', es: 'punto es crítico o alto', pt: 'ponto é crítico ou alto', it: 'punto è critico o alto', zh: '项为严重或高危' },
  'Afgeslagen': { en: 'Blocked', de: 'Abgewehrt', fr: 'Bloquées', es: 'Bloqueados', pt: 'Bloqueados', it: 'Bloccati', zh: '已拦截' },
  'soorten aanvallen lukten niet': { en: 'attack types did not succeed', de: 'Angriffsarten scheiterten', fr: 'types d’attaque ont échoué', es: 'tipos de ataque fallaron', pt: 'tipos de ataque falharam', it: 'tipi di attacco falliti', zh: '类攻击未成功' },
  'Bekijk punt 1': { en: 'See issue 1', de: 'Punkt 1 ansehen', fr: 'Voir le point 1', es: 'Ver punto 1', pt: 'Ver ponto 1', it: 'Vedi punto 1', zh: '查看第 1 项' },
  'Rechtsboven is het gevaarlijkst': { en: 'Top right is the most dangerous', de: 'Oben rechts ist am gefährlichsten', fr: 'En haut à droite, le plus dangereux', es: 'Arriba a la derecha es lo más peligroso', pt: 'Canto superior direito é o mais perigoso', it: 'In alto a destra è il più pericoloso', zh: '右上角最危险' },
  'Schade': { en: 'Damage', de: 'Schaden', fr: 'Dommage', es: 'Daño', pt: 'Dano', it: 'Danno', zh: '损害' },
  'Gemak van misbruik': { en: 'Ease of abuse', de: 'Leichtigkeit des Missbrauchs', fr: 'Facilité d’abus', es: 'Facilidad de abuso', pt: 'Facilidade de abuso', it: 'Facilità di abuso', zh: '利用难度' },
  'Direct oplossen': { en: 'Fix immediately', de: 'Sofort beheben', fr: 'Corriger tout de suite', es: 'Corregir ya', pt: 'Corrigir já', it: 'Correggere subito', zh: '立即修复' },
  'Snel': { en: 'Soon', de: 'Bald', fr: 'Bientôt', es: 'Pronto', pt: 'Breve', it: 'Presto', zh: '尽快' },
  'Inplannen': { en: 'Schedule', de: 'Einplanen', fr: 'Planifier', es: 'Planificar', pt: 'Planear', it: 'Programmare', zh: '排期' },
  'Rustig': { en: 'Low urgency', de: 'Gering', fr: 'Faible', es: 'Baja', pt: 'Baixa', it: 'Bassa', zh: '低优先' },
  'Bevestigd': { en: 'Confirmed', de: 'Bestätigt', fr: 'Confirmé', es: 'Confirmado', pt: 'Confirmado', it: 'Confermato', zh: '已确认' },
  'Vermoedelijk': { en: 'Suspected', de: 'Vermutet', fr: 'Suspecté', es: 'Sospechado', pt: 'Suspeito', it: 'Sospetto', zh: '疑似' },
  'Bevestigd met eigen test': { en: 'Confirmed with our own test', de: 'Mit eigenem Test bestätigt', fr: 'Confirmé par notre test', es: 'Confirmado con nuestra prueba', pt: 'Confirmado com o nosso teste', it: 'Confermato con il nostro test', zh: '已用自有测试确认' },
  'Hoe beoordelen we?': { en: 'How we rate', de: 'Wie wir bewerten', fr: 'Notre méthode de notation', es: 'Cómo puntuamos', pt: 'Como avaliamos', it: 'Come valutiamo', zh: '评级方法' },
  'Lees alles': { en: 'Read everything', de: 'Alles lesen', fr: 'Tout lire', es: 'Leer todo', pt: 'Ler tudo', it: 'Leggi tutto', zh: '阅读全文' },
  'Punt': { en: 'Issue', de: 'Punkt', fr: 'Point', es: 'Punto', pt: 'Ponto', it: 'Punto', zh: '第' },
  'Makkelijk te misbruiken': { en: 'Easy to abuse', de: 'Leicht missbrauchbar', fr: 'Facile à exploiter', es: 'Fácil de abusar', pt: 'Fácil de abusar', it: 'Facile da sfruttare', zh: '易于利用' },
  'Wat eerst, wat later': { en: 'What first, what later', de: 'Was zuerst, was später', fr: 'Quoi d’abord, quoi ensuite', es: 'Qué primero, qué después', pt: 'O que primeiro, o que depois', it: 'Cosa prima, cosa dopo', zh: '先后顺序' },
  'Begin links. Klik op een nummer om dat punt te lezen.': { en: 'Start on the left. Click a number to read that issue.', de: 'Links beginnen. Klicken Sie eine Nummer für den Punkt.', fr: 'Commencez à gauche. Cliquez un numéro pour lire le point.', es: 'Empieza por la izquierda. Haz clic en un número para leerlo.', pt: 'Comece à esquerda. Clique num número para ler o ponto.', it: 'Inizia da sinistra. Clicca un numero per leggerlo.', zh: '从左侧开始。点击编号查看该问题。' },
  'Vandaag': { en: 'Today', de: 'Heute', fr: 'Aujourd’hui', es: 'Hoy', pt: 'Hoje', it: 'Oggi', zh: '今天' },
  'Deze week': { en: 'This week', de: 'Diese Woche', fr: 'Cette semaine', es: 'Esta semana', pt: 'Esta semana', it: 'Questa settimana', zh: '本周' },
  'Deze maand': { en: 'This month', de: 'Diesen Monat', fr: 'Ce mois-ci', es: 'Este mes', pt: 'Este mês', it: 'Questo mese', zh: '本月' },
  'Kritiek en hoog': { en: 'Critical and high', de: 'Kritisch und hoch', fr: 'Critique et élevé', es: 'Crítico y alto', pt: 'Crítico e alto', it: 'Critico e alto', zh: '严重与高危' },
  'Middel en klein werk': { en: 'Medium and small work', de: 'Mittel und kleine Arbeiten', fr: 'Moyen et petits travaux', es: 'Medio y trabajo pequeño', pt: 'Médio e trabalho pequeno', it: 'Medio e lavori piccoli', zh: '中危与小修' },
  'De rest': { en: 'The rest', de: 'Der Rest', fr: 'Le reste', es: 'El resto', pt: 'O resto', it: 'Il resto', zh: '其余' },
  'Lost op': { en: 'Fixes', de: 'Behebt', fr: 'Corrige', es: 'Corrige', pt: 'Corrige', it: 'Corregge', zh: '修复' },
  'Moeite: klein': { en: 'Effort: small', de: 'Aufwand: klein', fr: 'Effort : faible', es: 'Esfuerzo: bajo', pt: 'Esforço: baixo', it: 'Sforzo: basso', zh: '工作量：小' },
  'Moeite: middel': { en: 'Effort: medium', de: 'Aufwand: mittel', fr: 'Effort : moyen', es: 'Esfuerzo: medio', pt: 'Esforço: médio', it: 'Sforzo: medio', zh: '工作量：中' },
  'Moeite: groot': { en: 'Effort: large', de: 'Aufwand: groß', fr: 'Effort : élevé', es: 'Esfuerzo: alto', pt: 'Esforço: alto', it: 'Sforzo: alto', zh: '工作量：大' },
  'punten, kort uitgelegd': { en: 'issues, briefly explained', de: 'Punkte, kurz erklärt', fr: 'points, expliqués brièvement', es: 'puntos, explicados brevemente', pt: 'pontos, explicados brevemente', it: 'punti, spiegati brevemente', zh: '项问题，简要说明' },
  'Klik op een punt voor de uitleg in gewone taal. Het technische bewijs zit daaronder, voor je ontwikkelaar.': { en: 'Click an issue for the plain-language explanation. The technical evidence sits underneath, for your developer.', de: 'Klicken Sie einen Punkt für die Erklärung in einfacher Sprache. Der technische Nachweis steht darunter, für Ihre Entwicklung.', fr: 'Cliquez un point pour l’explication en langage simple. La preuve technique est en dessous, pour votre développeur.', es: 'Haz clic en un punto para la explicación en lenguaje sencillo. La prueba técnica está debajo, para tu desarrollador.', pt: 'Clique num ponto para a explicação em linguagem simples. A prova técnica está abaixo, para o seu programador.', it: 'Clicca un punto per la spiegazione in linguaggio semplice. La prova tecnica è sotto, per il tuo sviluppatore.', zh: '点击条目查看通俗解释。技术证据在其下方，供开发人员查看。' },
  'Filter op ernst': { en: 'Filter by severity', de: 'Nach Schweregrad filtern', fr: 'Filtrer par gravité', es: 'Filtrar por gravedad', pt: 'Filtrar por gravidade', it: 'Filtra per gravità', zh: '按严重程度筛选' },
  'Alle': { en: 'All', de: 'Alle', fr: 'Tous', es: 'Todos', pt: 'Todos', it: 'Tutti', zh: '全部' },
  'Ernstig': { en: 'Serious', de: 'Ernst', fr: 'Grave', es: 'Grave', pt: 'Grave', it: 'Grave', zh: '严重' },
  'Laag': { en: 'Low', de: 'Niedrig', fr: 'Faible', es: 'Bajo', pt: 'Baixo', it: 'Basso', zh: '低' },
  'Ernst': { en: 'Severity', de: 'Schwere', fr: 'Gravité', es: 'Gravedad', pt: 'Gravidade', it: 'Gravità', zh: '严重程度' },
  'Alles openklappen': { en: 'Expand all', de: 'Alle öffnen', fr: 'Tout ouvrir', es: 'Abrir todo', pt: 'Abrir tudo', it: 'Apri tutto', zh: '全部展开' },
  'Alles inklappen': { en: 'Collapse all', de: 'Alle schließen', fr: 'Tout fermer', es: 'Cerrar todo', pt: 'Fechar tudo', it: 'Chiudi tutto', zh: '全部收起' },
  'Wat is er aan de hand?': { en: 'What is happening?', de: 'Was ist los?', fr: 'Que se passe-t-il ?', es: '¿Qué está pasando?', pt: 'O que está a acontecer?', it: 'Cosa sta succedendo?', zh: '发生了什么？' },
  'Wat kan er misgaan?': { en: 'What could go wrong?', de: 'Was kann schiefgehen?', fr: 'Que peut-il arriver ?', es: '¿Qué puede salir mal?', pt: 'O que pode correr mal?', it: 'Cosa può andare storto?', zh: '可能出什么问题？' },
  'Wat moet er gebeuren?': { en: 'What needs to happen?', de: 'Was muss geschehen?', fr: 'Que faut-il faire ?', es: '¿Qué hay que hacer?', pt: 'O que é preciso fazer?', it: 'Cosa bisogna fare?', zh: '需要做什么？' },
  'Technisch bewijs': { en: 'Technical evidence', de: 'Technischer Nachweis', fr: 'Preuve technique', es: 'Prueba técnica', pt: 'Prova técnica', it: 'Prova tecnica', zh: '技术证据' },
  'Verzoek': { en: 'Request', de: 'Anfrage', fr: 'Requête', es: 'Petición', pt: 'Pedido', it: 'Richiesta', zh: '请求' },
  'Antwoord van de server': { en: 'Server response', de: 'Antwort des Servers', fr: 'Réponse du serveur', es: 'Respuesta del servidor', pt: 'Resposta do servidor', it: 'Risposta del server', zh: '服务器响应' },
  'Oorzaak': { en: 'Root cause', de: 'Ursache', fr: 'Cause', es: 'Causa', pt: 'Causa', it: 'Causa', zh: '根本原因' },
  'Technische oplossing': { en: 'Technical fix', de: 'Technische Lösung', fr: 'Correctif technique', es: 'Solución técnica', pt: 'Solução técnica', it: 'Soluzione tecnica', zh: '技术修复' },
  'Beoordeling:': { en: 'Rating:', de: 'Bewertung:', fr: 'Évaluation :', es: 'Valoración:', pt: 'Avaliação:', it: 'Valutazione:', zh: '评级：' },
  'Wat goed gaat': { en: 'What works well', de: 'Was gut funktioniert', fr: 'Ce qui fonctionne', es: 'Lo que funciona', pt: 'O que funciona', it: 'Cosa funziona', zh: '做得好的地方' },
  'aanvallen die niet lukten': { en: 'attacks that did not succeed', de: 'Angriffe, die scheiterten', fr: 'attaques qui ont échoué', es: 'ataques que fallaron', pt: 'ataques que falharam', it: 'attacchi falliti', zh: '类攻击未成功' },
  'Wat we niet hebben getest': { en: 'What we did not test', de: 'Was wir nicht getestet haben', fr: 'Ce que nous n’avons pas testé', es: 'Lo que no probamos', pt: 'O que não testámos', it: 'Cosa non abbiamo testato', zh: '未测试的内容' },
  'Grenzen van dit onderzoek': { en: 'Limits of this assessment', de: 'Grenzen dieser Prüfung', fr: 'Limites de cette évaluation', es: 'Límites de esta evaluación', pt: 'Limites desta avaliação', it: 'Limiti di questa valutazione', zh: '本次评估的边界' },
  'Woordenlijst': { en: 'Glossary', de: 'Glossar', fr: 'Glossaire', es: 'Glosario', pt: 'Glossário', it: 'Glossario', zh: '术语表' },
  'Vaktermen in gewone taal': { en: 'Technical terms in plain words', de: 'Fachbegriffe einfach erklärt', fr: 'Termes techniques en mots simples', es: 'Términos técnicos en lenguaje sencillo', pt: 'Termos técnicos em linguagem simples', it: 'Termini tecnici in parole semplici', zh: '用通俗语言解释术语' },
  'Over dit rapport': { en: 'About this report', de: 'Über diesen Bericht', fr: 'À propos de ce rapport', es: 'Sobre este informe', pt: 'Sobre este relatório', it: 'Informazioni sul rapporto', zh: '关于本报告' },
  'Werkwijze, privacy en gegevens van de scan': { en: 'Method, privacy and scan details', de: 'Methode, Datenschutz und Scandaten', fr: 'Méthode, confidentialité et données du scan', es: 'Método, privacidad y datos del escaneo', pt: 'Método, privacidade e dados da análise', it: 'Metodo, privacy e dati della scansione', zh: '方法、隐私与扫描数据' },
  'Gemaakt met': { en: 'Made with', de: 'Erstellt mit', fr: 'Réalisé avec', es: 'Hecho con', pt: 'Criado com', it: 'Realizzato con', zh: '生成工具' },
  'Scan': { en: 'Scan', de: 'Scan', fr: 'Scan', es: 'Escaneo', pt: 'Análise', it: 'Scansione', zh: '扫描' },
  'Datum': { en: 'Date', de: 'Datum', fr: 'Date', es: 'Fecha', pt: 'Data', it: 'Data', zh: '日期' },
  'Doel': { en: 'Target', de: 'Ziel', fr: 'Cible', es: 'Objetivo', pt: 'Alvo', it: 'Obiettivo', zh: '目标' },
  'Kosten van de scan': { en: 'Cost of the scan', de: 'Kosten des Scans', fr: 'Coût du scan', es: 'Coste del escaneo', pt: 'Custo da análise', it: 'Costo della scansione', zh: '扫描成本' },
  'Volgende stap': { en: 'Next step', de: 'Nächster Schritt', fr: 'Étape suivante', es: 'Siguiente paso', pt: 'Próximo passo', it: 'Prossimo passo', zh: '下一步' },
  'Naar het stappenplan': { en: 'Go to the action plan', de: 'Zum Maßnahmenplan', fr: 'Aller au plan d’action', es: 'Ir al plan de acción', pt: 'Ir para o plano de ação', it: 'Vai al piano d’azione', zh: '前往行动清单' },
  'Bewaar als PDF': { en: 'Save as PDF', de: 'Als PDF speichern', fr: 'Enregistrer en PDF', es: 'Guardar como PDF', pt: 'Guardar como PDF', it: 'Salva come PDF', zh: '保存为 PDF' },
  'Terug naar boven': { en: 'Back to top', de: 'Nach oben', fr: 'Haut de page', es: 'Volver arriba', pt: 'Voltar ao topo', it: 'Torna su', zh: '返回顶部' },
  'Kritiek': { en: 'Critical', de: 'Kritisch', fr: 'Critique', es: 'Crítico', pt: 'Crítico', it: 'Critico', zh: '严重' },
  'Hoog': { en: 'High', de: 'Hoch', fr: 'Élevé', es: 'Alto', pt: 'Alto', it: 'Alto', zh: '高危' },
  'Middel': { en: 'Medium', de: 'Mittel', fr: 'Moyen', es: 'Medio', pt: 'Médio', it: 'Medio', zh: '中危' },
  'Info': { en: 'Info', de: 'Info', fr: 'Info', es: 'Info', pt: 'Info', it: 'Info', zh: '信息' },
  'De beoordelingen zijn inschattingen op basis van het verzamelde bewijs.': {
    en: 'The ratings are estimates based on the evidence collected.',
    de: 'Die Bewertungen sind Einschätzungen auf Basis der gesammelten Nachweise.',
    fr: 'Les évaluations sont des estimations fondées sur les preuves recueillies.',
    es: 'Las valoraciones son estimaciones basadas en las pruebas recogidas.',
    pt: 'As avaliações são estimativas com base nas provas recolhidas.',
    it: 'Le valutazioni sono stime basate sulle prove raccolte.',
    zh: '评级是基于所收集证据的估计。',
  },
  'Persoonsgegevens in het bewijs zijn ingekort om de privacy van klanten te beschermen.': {
    en: 'Personal data in the evidence is shortened to protect customer privacy.',
    de: 'Personenbezogene Daten im Nachweis sind zum Schutz der Kunden gekürzt.',
    fr: 'Les données personnelles des preuves sont tronquées pour protéger la vie privée des clients.',
    es: 'Los datos personales de las pruebas están acortados para proteger la privacidad de los clientes.',
    pt: 'Os dados pessoais nas provas estão abreviados para proteger a privacidade dos clientes.',
    it: 'I dati personali nelle prove sono abbreviati per proteggere la privacy dei clienti.',
    zh: '为保护客户隐私，证据中的个人数据已做缩略处理。',
  },
  'Bevestigd en vermoedelijk': { en: 'Confirmed and suspected', de: 'Bestätigt und vermutet', fr: 'Confirmé et suspecté', es: 'Confirmado y sospechado', pt: 'Confirmado e suspeito', it: 'Confermato e sospetto', zh: '已确认与疑似' },
  'Wat kan er misgaan? ': { en: 'What could go wrong? ', de: 'Was kann schiefgehen? ', fr: 'Que peut-il arriver ? ', es: '¿Qué puede salir mal? ', pt: 'O que pode correr mal? ', it: 'Cosa può andare storto? ', zh: '可能出什么问题？' },
  ' van 5': { en: ' of 5', de: ' von 5', fr: ' sur 5', es: ' de 5', pt: ' de 5', it: ' di 5', zh: ' / 5' },
  'bevindingen': { en: 'findings', de: 'Befunde', fr: 'constats', es: 'hallazgos', pt: 'constatações', it: 'risultati', zh: '项发现' },
  'Wil je meer weten?': { en: 'Want to know more?', de: 'Mehr erfahren?', fr: 'En savoir plus ?', es: '¿Quieres saber más?', pt: 'Quer saber mais?', it: 'Vuoi sapere di più?', zh: '想了解更多？' },
  'Voor wie verder wil lezen. Klik een onderwerp open.': { en: 'For those who want to read on. Open a topic.', de: 'Für alle, die weiterlesen wollen. Öffnen Sie ein Thema.', fr: 'Pour ceux qui veulent aller plus loin. Ouvrez un sujet.', es: 'Para quien quiera leer más. Abre un tema.', pt: 'Para quem quiser ler mais. Abra um tema.', it: 'Per chi vuole approfondire. Apri un argomento.', zh: '供想深入了解的人阅读。打开一个主题。' },
  'kritiek': { en: 'critical', de: 'kritisch', fr: 'critique', es: 'cr?tico', pt: 'cr?tico', it: 'critico', zh: '??' },
  'hoog': { en: 'high', de: 'hoch', fr: '?lev?', es: 'alto', pt: 'alto', it: 'alto', zh: '??' },
  'middel': { en: 'medium', de: 'mittel', fr: 'moyen', es: 'medio', pt: 'm?dio', it: 'medio', zh: '??' },
  'laag': { en: 'low', de: 'niedrig', fr: 'faible', es: 'bajo', pt: 'baixo', it: 'basso', zh: '?' },
  'Hoe hoger een punt staat, hoe groter de schade. Hoe verder naar rechts, hoe makkelijker het te misbruiken is. Wijs een nummer aan voor uitleg.': { en: 'The higher an issue sits, the greater the damage. The further right, the easier it is to abuse. Hover a number for the explanation.', de: 'Je h?her ein Punkt steht, desto gr??er der Schaden. Je weiter rechts, desto leichter missbrauchbar. Nummer f?r Erkl?rung.', fr: 'Plus un point est haut, plus le dommage est grand. Plus il est ? droite, plus il est facile ? exploiter. Survolez un num?ro.', es: 'Cuanto m?s alto el punto, mayor el da?o. Cuanto m?s a la derecha, m?s f?cil de abusar. Pasa el rat?n por un n?mero.', pt: 'Quanto mais alto o ponto, maior o dano. Quanto mais ? direita, mais f?cil de abusar. Passe o rato por um n?mero.', it: 'Pi? in alto il punto, maggiore il danno. Pi? a destra, pi? facile da sfruttare. Passa sul numero per la spiegazione.', zh: '???????????????????????????' },
};

// Strings added after the first translation pass. English is the fallback for
// languages without an explicit entry.
const EXTRA_P = {
  'Uitgevoerd door': { en: 'Executed by', de: 'Ausgeführt von' },
  'Serverantwoord': { en: 'Server response', de: 'Serverantwort' },
  'Bewijs': { en: 'Proof', de: 'Nachweis' },
  'Budgetplafond bereikt': { en: 'Budget limit reached', de: 'Budgetlimit erreicht' },
  'Let op: het budgetplafond is bereikt.': { en: 'Note: the budget limit was reached.', de: 'Hinweis: Das Budgetlimit wurde erreicht.' },
  'WAARSCHUWING = belangrijk': { en: 'WARNING = important', de: 'WARNUNG = wichtig' },
  '! WAARSCHUWING': { en: '! WARNING', de: '! WARNUNG' },
  'Wat de zwerm dacht': { en: 'What the swarm thought', de: 'Was der Schwarm dachte' },
  'Korte notities uit de missie, in gewone taal. Elke agent heeft een eigen kleur. Wat een waarschuwing verdient, staat rood onderstreept met een WAARSCHUWING-label.': {
    en: 'Short notes from the mission, in plain language. Each agent has its own colour. Anything that deserves a warning is underlined in red with a WARNING label.',
    de: 'Kurze Notizen aus der Mission in einfacher Sprache. Jeder Agent hat eine eigene Farbe. Was eine Warnung verdient, ist rot unterstrichen und mit einem WARNUNG-Label markiert.',
  },
  'De zwerm begon breed en ging steeds dieper op wat hij vond.': {
    en: 'The swarm started broad and went deeper into what it found.',
    de: 'Der Schwarm begann breit und ging bei seinen Funden immer tiefer.',
  },
  'De kaart heeft JavaScript nodig. Alle punten staan ook bij de bevindingen.': {
    en: 'The map requires JavaScript. All issues are also listed under findings.',
    de: 'Die Karte benötigt JavaScript. Alle Punkte stehen auch bei den Befunden.',
  },
  'Bevestigd en vermoedelijk': { en: 'Confirmed and suspected', de: 'Bestätigt und vermutet' },
  'Bevestigd: we hebben het zelf aangetoond. Vermoedelijk: een scanner meldt het, maar we konden het niet zelf herhalen.': {
    en: 'Confirmed: we demonstrated it ourselves. Suspected: a scanner reported it, but we could not reproduce it ourselves.',
    de: 'Bestätigt: Wir haben es selbst nachgewiesen. Vermutet: Ein Scanner meldet es, aber wir konnten es nicht selbst reproduzieren.',
  },
  'Dit was een actieve test met toegestane wijzigingen op eigen testobjecten, in opdracht van de eigenaar van de site.': {
    en: 'This was an active test with permitted changes to our own test objects, commissioned by the site owner.',
    de: 'Dies war ein aktiver Test mit erlaubten Änderungen an eigenen Testobjekten im Auftrag des Website-Eigentümers.',
  },
  'Dit was een actieve test van buitenaf, in opdracht van de eigenaar van de site.': {
    en: 'This was an active external test, commissioned by the site owner.',
    de: 'Dies war ein aktiver externer Test im Auftrag des Website-Eigentümers.',
  },
  'Beperkte dekking': { en: 'Limited coverage', de: 'Begrenzte Abdeckung' },
  'Niet elk pad is getest.': { en: 'Not every path was tested.', de: 'Nicht jeder Pfad wurde getestet.' },
  'Over dit rapport': { en: 'About this report', de: 'Über diesen Bericht' },
  'Werkwijze, privacy en gegevens van de scan': { en: 'Method, privacy and scan details', de: 'Methode, Datenschutz und Scandaten' },
  'Gemaakt met': { en: 'Made with', de: 'Erstellt mit' },
  'Kosten van de scan': { en: 'Cost of the scan', de: 'Kosten des Scans' },
  'De schade volgt uit de ernst van het punt. Het gemak van misbruik volgt uit het soort probleem en of er inloggegevens nodig waren. Dit zijn inschattingen op basis van het bewijs. Een': {
    en: 'Damage follows from the severity of the issue. Ease of abuse follows from the type of problem and whether credentials were required. These are estimates based on the evidence. A',
    de: 'Der Schaden folgt aus der Schwere des Punktes. Die Leichtigkeit des Missbrauchs folgt aus der Art des Problems und ob Zugangsdaten nötig waren. Das sind Einschätzungen auf Basis der Beweise. Ein',
  },
  'punt zetten we een stap lager.': { en: 'issue is rated one step lower.', de: 'Punkt wird eine Stufe niedriger bewertet.' },
  'Beoordeling: schade': { en: 'Rating: damage', de: 'Bewertung: Schaden' },
  ', misbruik': { en: ', abuse', de: ', Missbrauch' },
  'Testbewijs': { en: 'Test evidence', de: 'Testnachweis' },
  'Aanvalsketen': { en: 'Attack chain', de: 'Angriffskette' },
  'Bewezen aanval': { en: 'Proven attack', de: 'Nachgewiesener Angriff' },
  'verdeeld naar ernst': { en: 'grouped by severity', de: 'nach Schweregrad' },
  'De beoordelingen zijn inschattingen op basis van het verzamelde bewijs. Het rapport beschrijft de site op het moment van testen. Dat we iets niet vonden, betekent niet dat het er niet is.': {
    en: 'The ratings are estimates based on the collected evidence. The report describes the site at the time of testing. Not finding something does not mean it is not there.',
    de: 'Die Bewertungen sind Einschätzungen auf Basis der gesammelten Beweise. Der Bericht beschreibt die Website zum Zeitpunkt des Tests. Etwas nicht zu finden bedeutet nicht, dass es nicht vorhanden ist.',
  },
  'Persoonsgegevens in het bewijs zijn ingekort om de privacy van klanten te beschermen.': {
    en: 'Personal data in the evidence is shortened to protect customer privacy.',
    de: 'Personenbezogene Daten im Nachweis sind zum Schutz der Kundendatenschutz gekürzt.',
  },
  'Deels bevestigd': { en: 'Partially confirmed', de: 'Teilweise bestätigt' },
  'Bevestigd met eigen test': { en: 'Confirmed with our own test', de: 'Mit eigenem Test bestätigt' },
  'Vermoedelijk, niet zelf bevestigd': { en: 'Suspected, not independently confirmed', de: 'Vermutet, nicht selbst bestätigt' },
  'vermoedelijk': { en: 'suspected', de: 'vermutet' },
  'Bevestigd': { en: 'Confirmed', de: 'Bestätigt' },
  'Vermoedelijk': { en: 'Suspected', de: 'Vermutet' },
  'Schade': { en: 'Damage', de: 'Schaden' },
  'Makkelijk te misbruiken': { en: 'Ease of abuse', de: 'Leicht zu missbrauchen' },
};

/** Translate the fixed chrome of a built report. Content is already in the target language. */
export function translateHtml(html, code) {
  if (!code || code === 'nl') return html;
  // translate TEXT nodes only: attribute values like data-sev="kritiek" are CSS hooks
  const table = { ...P, ...EXTRA_P };
  const entries = Object.entries(table).sort((a, b) => b[0].length - a[0].length);
  const one = (text) => {
    let out = text;
    for (const [nl, row] of entries) {
      const target = row[code] || row.en;
      if (!target || target === nl) continue;
      out = out.split(nl).join(target);
    }
    return out;
  };
  return html.replace(/>([^<>]+)</g, (m, inner) => '>' + one(inner) + '<');
}

export function langByCode(code) {
  return LANGS.find((l) => l.code === code) || LANGS[0];
}
