/* IMPERIUM: an account-isolated, device-local text adventure. */
(function(root){
'use strict';
const choice=(label,next,effect={})=>({label,next,...effect});
const chapter=typeof module==='object'&&module.exports?require('./quest-chapter.js'):root.ImperiumChapter;
const scenes={
  wake:{title:'Przebudzenie przy Granicy',text:'Budzisz się na mokrym mchu. Nie pamiętasz swojego imienia. Nad tobą pochylają się trzy istoty: przezroczysty lis, kamienny olbrzym i mała postać z oczami jak latarnie. Na ich pancerzach widnieje znak Aurelii. Za drzewami Granica pożera horyzont. Nie wiesz jeszcze, czy przybyli cię uratować.',choices:[choice('Zapytaj, gdzie jesteś','names',{trust:1}),choice('Zerwij się i uciekaj','run',{energy:-1}),choice('Udawaj, że nadal śpisz','listen')]},
  names:{title:'Imię bez wspomnienia',text:'„To Pogranicze Aurelii” — mówi latarnik. „Jestem zwiadowczym dronem. Lis jest przewodnikiem holograficznym, a olbrzym konstruktem ratunkowym Rona. Znaleźliśmy cię obok pęknięcia Granicy”. Lis dotyka twojej dłoni. Na skórze pojawia się znak pękniętego koła. Olbrzym natychmiast cofa się o krok.',choices:[choice('Pokaż znak wszystkim','mark',{trust:1}),choice('Schowaj dłoń i rozejrzyj się','clearing')]},
  run:{title:'Las, który zawraca',text:'Biegniesz między drzewami, ale każda ścieżka prowadzi do tej samej polany. Przezroczysty lis czeka przy korzeniu. W pysku trzyma twoją zgubioną torbę.',choices:[choice('Przyjmij torbę i wróć','bag',{trust:1}),choice('Wspinaj się na drzewo','tree',{energy:-1})]},
  listen:{title:'Rozmowa nad śpiącym',text:'„Nie mów mu o Bramie” — szepcze olbrzym. „Sam musi zdecydować”. Latarnik odpowiada: „Najpierw niech pozna cenę”. Pod twoim ramieniem leży płócienna torba.',choices:[choice('Otwórz oczy i zapytaj o cenę','mark'),choice('Sięgnij po torbę','bag',{add:'podsłuch'})]},
  mark:{title:'Pęknięte koło',text:'Znak jest kluczem do Bramy. Kiedyś oddzielała światy. Teraz zasysa ludzi, lasy i wspomnienia. „Możesz ją naprawić albo przejść przez nią do domu” — mówi latarnik. „Ale najpierw trzeba do niej dotrzeć”.',choices:[choice('Obiecaj pomóc','clearing',{trust:1,add:'obietnica'}),choice('Powiedz, że szukasz drogi do domu','clearing')]},
  clearing:{title:'Na skraju polany',text:'Na wschodzie widać dym osady. Na północy wyrasta wieża. Przed odejściem sprawdzasz torbę: są w niej mały nóż, pusta manierka i złożona kartka.',choices:[choice('Rozłóż kartkę','map',{add:'nóż'}),choice('Napełnij manierkę przy źródle','spring',{add:'nóż'})]},
  bag:{title:'To, co zostało',text:'W torbie znajdujesz mały nóż, pustą manierkę i mapę. Na odwrocie ktoś napisał twoim charakterem pisma: „Nie ufaj głosowi, który zna twoje imię”.',choices:[choice('Zachowaj mapę i przeczytaj ją','map',{add:'nóż'}),choice('Najpierw znajdź wodę','spring',{add:'nóż'})]},
  tree:{title:'Ponad koronami',text:'Ze szczytu drzewa widzisz czarną szczelinę na niebie. Pod nią stoi wieża, a obok migocze osada. Gałąź pęka. Olbrzym łapie cię, zanim uderzasz w ziemię.',choices:[choice('Podziękuj mu i przyjmij pomoc','bag',{trust:1}),choice('Zapytaj, dlaczego cię ratuje','mark')]},
  map:{title:'Trzy drogi',text:'Mapa pokazuje osadę, kamienny most i archiwum w wieży. Przy Bramie zaznaczono dwa gniazda: dla światła i dla pamięci. Lis wskazuje osadę. Olbrzym wskazuje wieżę.',choices:[choice('Idź do osady','village',{add:'mapa'}),choice('Idź do wieży','tower',{add:'mapa'}),choice('Najpierw poszukaj wody','spring',{add:'mapa'})]},
  spring:{title:'Woda z odbiciem',text:'W źródle widzisz swoją twarz, ale odbicie porusza ustami bez ciebie. „Wróć do domu. Zostaw ich”. Lis warczy na taflę. Woda jednak jest czysta.',choices:[choice('Napełnij manierkę i idź do osady','village',{add:'woda',energy:1}),choice('Odwróć się od głosu i rusz do wieży','tower',{trust:1})]},
  village:{title:'Osada pod szkłem',text:'Mieszkańcy mają twarze z drewna i dłonie ze szkła. Na placu dziecko próbuje wyciągnąć przyjaciela spod przewróconego wozu. Kupiec woła, że wie, jak otworzyć Bramę.',choices:[choice('Pomóż dziecku','rescue',{energy:-1,trust:2}),choice('Podejdź do kupca','merchant'),choice('Poszukaj miejsca na odpoczynek','rest')]},
  rescue:{title:'Mały mechanik',text:'Podnosisz wóz razem z olbrzymem. Uratowana istota wręcza ci mosiężny tryb. „Pasuje do czegoś dużego”. Dziecko opowiada o tunelu pod mostem, którego nie ma na mapie.',choices:[choice('Zapamiętaj drogę przez tunel','merchant',{add:'tryb'}),choice('Poproś o wodę i odpocznij','rest',{add:'tryb'})]},
  merchant:{title:'Cena światła',text:'Kupiec pokazuje kryształ. „Bez niego Brama nie ruszy”. W zamian żąda noża. Latarnik rozpoznaje kryształ: został skradziony ze wspólnej latarni osady.',choices:[choice('Wymień nóż na kryształ','bridge',{requires:'nóż',remove:'nóż',add:'kryształ'}),choice('Zażądaj zwrotu kryształu mieszkańcom','lantern'),choice('Odejdź do wieży po inną odpowiedź','tower')]},
  lantern:{title:'Czyje światło?',text:'Kupiec odmawia. Olbrzym nie grozi mu, tylko zwołuje mieszkańców. Dziecko rozpoznaje znak na krysztale. Kupiec kładzie go na stole, zanim ktokolwiek zdąży krzyknąć.',choices:[choice('Poproś osadę o pożyczenie kryształu','bridge',{trust:1,add:'kryształ'}),choice('Zostaw kryształ w latarni i szukaj innej drogi','tower',{trust:2,add:'latarnia'})]},
  rest:{title:'Godzina ciszy',text:'Starsza mieszkanka podaje ci chleb. Za oknem znika fragment wzgórza. „Nie możemy odpoczywać wiecznie” — mówi lis. Po krótkim śnie dłonie przestają ci drżeć.',choices:[choice('Wróć na plac do kupca','merchant',{energy:2}),choice('Wyrusz do wieży','tower',{energy:2})]},
  tower:{title:'Wieża bez drzwi',text:'Wejście zamurowano od środka. Obok stoi posąg z napisem: „Otwieram się przed tym, kto przyzna, czego nie wie”. Pod murem dostrzegasz ciasny otwór.',choices:[choice('Powiedz: nie wiem, kim jestem','archive',{trust:1}),choice('Przeczołgaj się przez otwór','archive',{energy:-1}),choice('Wróć do osady','village')]},
  archive:{title:'Archiwum zaginionych',text:'Na półkach stoją słoje ze wspomnieniami. W jednym widzisz siebie przy budowie Bramy. Uchodźca Esserat, opiekun archiwum, pyta: „Chcesz poznać prawdę czy dostać narzędzia?”.',choices:[choice('Odzyskaj wspomnienie','memory',{add:'pamięć'}),choice('Zapytaj, jak naprawić Bramę','manual',{add:'instrukcja'}),choice('Zapytaj o źródło światła','prism')]},
  memory:{title:'Twoja decyzja sprzed lat',text:'Przypominasz sobie: Brama miała łączyć światy, a nie je podbijać. Ktoś usunął zabezpieczenie i ukrył twoje wspomnienia. Widzisz dwa regulatory, które trzeba włączyć jednocześnie.',choices:[choice('Zabierz wspomnienie i poproś o instrukcję','manual',{add:'instrukcja'}),choice('Znajdź światło do drugiego gniazda','prism')]},
  manual:{title:'Nie siła, lecz równowaga',text:'Esserat wyjaśnia: kryształ lub pryzmat dają energię. Pamięć albo instrukcja przywracają sterowanie. Bez obu elementów można tylko zamknąć szczelinę od zewnątrz. Do pełnej naprawy potrzebujesz też czyjejś pomocy.',choices:[choice('Weź pryzmat z pracowni','prism'),choice('Rusz na most','bridge')]},
  prism:{title:'Ostatni pryzmat',text:'W pracowni zostało jedno źródło światła. Esserat pozwala je zabrać, jeśli oddasz mu pełną manierkę. Możesz też ostrożnie rozłączyć zapasową lampę.',choices:[choice('Oddaj wodę za pryzmat','bridge',{requires:'woda',remove:'woda',add:'pryzmat'}),choice('Rozłącz zapasową lampę','bridge',{energy:-1,add:'pryzmat'}),choice('Idź bez pryzmatu','bridge')]},
  bridge:{title:'Most nad pustką',text:'Rzeka pod mostem nie ma dna. Na środku siedzi strażnik, który pamięta każde wypowiedziane kłamstwo. Z daleka słyszysz głos bliskiej osoby: „Już prawie jesteś w domu”.',choices:[choice('Porozmawiaj ze strażnikiem','guardian'),choice('Przejdź tunelem pod mostem','tunnel',{requires:'tryb'}),choice('Zignoruj ostrzeżenia i pobiegnij przez most','fall',{energy:-2})]},
  guardian:{title:'Pytanie strażnika',text:'„Kogo zabierzesz, jeśli Brama przepuści tylko jedną osobę?” Strażnik patrzy na twoich towarzyszy. Latarnik drży. Olbrzym milczy. Lis czeka na twoją odpowiedź.',choices:[choice('Przyznaj, że jeszcze nie znasz odpowiedzi','cross',{trust:1}),choice('Powiedz, że najpierw uratujesz siebie','cross'),choice('Obiecaj, że nikt nie zostanie','cross',{trust:1,add:'wspólna droga'})]},
  tunnel:{title:'Pod kamiennym mostem',text:'Tryb pasuje do mechanizmu ukrytej furtki. W tunelu odkrywasz przewody prowadzące do Bramy. Jeden z nich nadal działa. Latarnik zaznacza jego przebieg na twojej mapie.',choices:[choice('Zachowaj schemat i wyjdź za mostem','cross',{add:'przewód'})]},
  fall:{title:'Pęknięta deska',text:'Deska znika pod twoimi stopami. Zawisasz nad rzeką. Olbrzym łapie cię za torbę, a lis pomaga wspiąć się na most. Tracisz czas i sporo sił, ale wracasz na bezpieczny brzeg.',choices:[choice('Poproś towarzyszy o chwilę odpoczynku','cross',{trust:1}),choice('Wypij wodę','cross',{requires:'woda',remove:'woda',energy:2})]},
  cross:{title:'Za ostatnim brzegiem',text:'Przed tobą dolina, z której znikają kolory. Głos z Bramy zna twoje imię. Latarnik ostrzega: „On bierze słowa z twoich wspomnień”. Olbrzym pyta, czy chcesz iść razem.',choices:[choice('Idź razem z towarzyszami','camp',{trust:1}),choice('Rusz samotnie','whisper',{trust:-1}),choice('Zbadaj przewody','workshop',{requires:'przewód'})]},
  camp:{title:'Ogień na końcu świata',text:'Przy małym ognisku każdy opowiada, co stracił. Lis — rodzinny las. Olbrzym — miasto. Latarnik — swoją gwiazdę. Po raz pierwszy mówią do ciebie jak do przyjaciela.',choices:[choice('Powiedz im o swoim strachu','workshop',{trust:1,energy:1}),choice('Odpocznij przed ostatnią drogą','workshop',{energy:2})]},
  whisper:{title:'Znajomy głos',text:'„Przecież nie jesteś jednym z nich. Wracaj”. W szczelinie widzisz swój dawny pokój. Jednak wskazówki zegara biegną wstecz, a za oknem nie ma nic.',choices:[choice('Odrzuć obraz i wróć do przyjaciół','camp',{trust:1}),choice('Podejdź bliżej i zbadaj iluzję','workshop',{energy:-1,add:'iluzja'})]},
  workshop:{title:'Rick i Ron',text:'Portal otwiera się z głośnym trzaskiem. Rick wyciąga z niego dymiące urządzenie, Ron skrzynkę narzędzi. „Świat zaraz zniknie, a ty robisz wycieczkę?” — rzuca Rick. Ron pokazuje ci plan stabilizatora. Potrzebują kogoś, kogo znak rozpozna Brama.',choices:[choice('Pomóż Ronowi przygotować stabilizator','engineers',{energy:-1,add:'narzędzia'}),choice('Zapytaj Ricka, czy da się uratować wszystkich','engineers',{trust:1})]},
  engineers:{title:'Niemożliwe zostaw nam',text:'„Granica nie jest wrogiem, którego pobijesz” — wyjaśnia Ron. „Trzeba przywrócić równowagę”. Rick uruchamia łączność z Aurelią. „Mamy ocalałego, znak i bardzo zły dzień. Rada, potrzebujemy wsparcia”.',choices:[choice('Przejdź do szpitala polowego','healers'),choice('Poproś od razu o plan ewakuacji','guardians',{trust:1})]},
  healers:{title:'Iara i Severus',text:'W szpitalu polowym Iara przywraca oddech rannemu uchodźcy. Severus przygotowuje eliksiry. „Nie będziesz ratować świata, ledwo stojąc” — mówi, podając ci fiolkę. Iara prosi, żebyś po drodze sprawdził, czy nikt nie został w osadzie.',choices:[choice('Przyjmij eliksir i obiecaj sprawdzić osadę','wesker',{energy:2,trust:1,add:'uchodźcy'}),choice('Przyjmij eliksir i skup się na Bramie','wesker',{energy:2})]},
  wesker:{title:'Albert Wesker',text:'Wesker bada znak na twojej dłoni. „To interfejs, nie wyrok. Sam wybierzesz, co z nim zrobisz”. Wręcza ci izolującą opaskę, która osłabi wpływ Granicy. Nie obiecuje bezpieczeństwa, ale dokładnie wyjaśnia zagrożenia.',choices:[choice('Załóż opaskę','guardians',{add:'opaska'}),choice('Zapytaj, co ukrywa głos z Bramy','guardians',{add:'iluzja'})]},
  guardians:{title:'Złoty Strażnik i Archont',text:'Homelander wynosi mieszkańców z pękającej doliny. Elias osłania ostatni transport, stojąc przed falą Granicy. Przez łączność słyszysz: „Droga do Aurelii jest otwarta. Jeśli nie zdołasz naprawić Bramy, zamknij ją. My zajmiemy się ludźmi”.',choices:[choice('Pomóż wskazać pozostających uchodźców','mages',{trust:1,add:'ewakuacja'}),choice('Rusz do punktu dowodzenia','mages')]},
  mages:{title:'Thomas i struktura świata',text:'Thomas utrzymuje magiczną osłonę nad doliną. Na twojej mapie rysuje miejsca, gdzie przestrzeń jest jeszcze stabilna. „Rick potrzebuje drogi dla portalu, Ron czasu dla maszyny. Ja dam wam jedno i drugie”.',choices:[choice('Zapisz wskazówki Thomasa','council',{add:'instrukcja'}),choice('Poproś go o ochronę drogi powrotnej','council',{add:'osłona'})]},
  council:{title:'Ari i Indigo',text:'Na ekranie łączności pojawiają się Ari i Indigo. „Aurelia powstała, żeby jej obywatele mogli żyć wolni i bezpieczni” — mówi Ari. „Rada służy im. Nie potrzebujemy ofiary dla naszej chwały”. Indigo dodaje: „Spróbuj uratować świat. Jeśli nie możesz, ratuj ludzi. Twoja decyzja pozostaje twoja”.',choices:[choice('Wróć z Rickiem i Ronem do stabilizatora','machine',{trust:1}),choice('Najpierw potwierdź zakończenie ewakuacji','machine',{add:'ewakuacja'})]},
  machine:{title:'Serce Bramy',text:'Urządzenie Ricka i Rona ma dwa puste gniazda. Granica napiera na osłony Aurelii. Trzeci regulator został wyrwany. Masz chwilę, zanim szczelina pochłonie dolinę. Latarnik wskazuje koło zębate, a lis miejsce na źródło światła.',choices:[choice('Napraw regulator mosiężnym trybem','controls',{requires:'tryb',add:'regulator'}),choice('Podłącz przewód jako obejście','controls',{requires:'przewód',add:'regulator'}),choice('Przejdź do głównego panelu','controls')]},
  controls:{title:'Dwa gniazda',text:'Znak na twojej dłoni budzi panel. Możesz spróbować odbudować połączenie, odciąć szczelinę albo użyć pozostałej energii do powrotu. Każda z tych decyzji zmieni los doliny.',choices:[choice('Włóż źródło światła i przygotuj naprawę','repair',{needsLight:true,needsKnowledge:true}),choice('Znajdź sposób na zamknięcie szczeliny','seal'),choice('Sprawdź drogę do domu','home')]},
  repair:{title:'Druga dłoń',text:'Odzyskujesz sterowanie, ale dwa regulatory trzeba utrzymać jednocześnie. Możesz poprosić towarzyszy o pomoc albo wykorzystać naprawiony mechanizm. Szczelina zaczyna drżeć.',choices:[choice('Powierz drugi regulator przyjaciołom','endingTogether',{minTrust:3}),choice('Uruchom naprawiony regulator','endingEngineer',{requires:'regulator',minEnergy:2,energy:-1}),choice('Zamknij szczelinę, zanim będzie za późno','seal')]},
  seal:{title:'Cena zamknięcia',text:'Zamknięta Brama nie będzie już pożerać świata, ale stracisz najkrótszą drogę do domu. Możesz odciąć jej zasilanie, jeśli masz narzędzie, albo użyć znaku na dłoni.',choices:[choice('Przetnij przewód nożem','endingSeal',{requires:'nóż'}),choice('Oddaj znak i zamknij szczelinę','endingStay'),choice('Jeszcze raz sprawdź panel','controls')]},
  home:{title:'Próg powrotu',text:'Za szczeliną widzisz pokój z dzieciństwa. Tym razem zegar chodzi prawidłowo. Możesz wrócić, ale dolina zostanie z otwartą Bramą. Lis siada obok ciebie i nie próbuje cię zatrzymać.',choices:[choice('Wróć do swojego świata','endingHome'),choice('Zostań i napraw Bramę','controls',{trust:1})]},
  endingTogether:{title:'Nowy świt',text:'Olbrzym utrzymuje regulator. Rick otwiera portal ratunkowy, a Ron stabilizuje Granicę. Lis prowadzi zaginionych do Aurelii. Brama wraca do równowagi. Możesz odwiedzić dom i wrócić do nowych przyjaciół. Dolina po raz pierwszy od lat widzi pełny wschód słońca.',ending:true},
  endingEngineer:{title:'Most między światami',text:'Mechanizm utrzymuje oba regulatory. Brama przestaje głodnieć i staje się spokojnym przejściem. Nie odzyskujesz wszystkich wspomnień, ale zapisujesz instrukcję dla następnych podróżników. Nikt nie będzie musiał zaczynać od zera.',ending:true},
  endingSeal:{title:'Ocalona dolina',text:'Przecinasz zasilanie. Szczelina gaśnie. Świat zostaje ocalony, a droga do domu zamknięta. Ari przyznaje uchodźcom schronienie w Aurelii. Mieszkańcy otwierają przed tobą drzwi. Esserat obiecuje pomóc szukać innego przejścia. Masz już dokąd wracać tutaj.',ending:true},
  endingStay:{title:'Imię, które wybierzesz',text:'Znak znika z dłoni. Brama zamyka się razem z ostatnią falą ciemności. Pozostajesz w dolinie. Indigo pomaga osadzie odbudować domy. Przyjaciele nie wybierają ci imienia: czekają, aż zrobisz to sam. Po raz pierwszy twoja przyszłość należy do ciebie.',ending:true},
  endingHome:{title:'Powrót z pytaniem',text:'Rick otwiera dla ciebie osobny portal. Budzisz się we własnym łóżku. Na dłoni nie ma znaku. W kieszeni znajdujesz jednak mały kawałek szkła, ciepły jak światło latarnika. Nie wiesz, co stało się z doliną. Teraz pamiętasz jej mieszkańców i Radę Aurelii — i swoją decyzję.',ending:true}
};
// Old terminal IDs remain valid so existing saved games continue into the chapter.
const checkpoints={
 endingTogether:['Wspólna praca','Rick otwiera portal ratunkowy, Ron stabilizuje Granicę, a towarzysze utrzymują regulatory. To pierwszy sukces. Aurelia już wzywa was dalej.'],
 endingEngineer:['Działający most','Mechanizm utrzymuje regulatory. Zapisujesz instrukcję dla kolejnych ratowników. Transport Aurelii czeka; przed wami dalsza droga.'],
 endingSeal:['Ocalona dolina','Szczelina gaśnie, mieszkańcy są bezpieczni. Rick przygotowuje osobny portal powrotny. Zamknięcie starej drogi nie kończy podróży.'],
 endingStay:['Imię jeszcze przed tobą','Znak przygasa, lecz nie znika. Indigo pomaga mieszkańcom. Zostajesz z zespołem; swoje imię jeszcze przypomnisz.'],
 endingHome:['Powrót odłożony','Rick bada przejście i rozpoznaje pętlę pamięci za obrazem twojego pokoju. Zamyka niebezpieczny portal i proponuje bezpieczną drogę do Aurelii.']
};
for(const [id,[title,text]] of Object.entries(checkpoints))scenes[id]={title,text,choices:[choice('Kontynuuj z zespołem','chapter01')]};
const alternatives=`
Zapytaj Ricka o trasę|Спросить Рика о маршруте
Porozmawiaj ze starszym pasażerem|Поговорить с пожилым пассажиром
Pomóż latarnikowi utrzymać światło|Помочь фонарщику удержать свет
Poproś Rona o plan miasta|Попросить у Рона план города
Przenieś bagaże ocalonych|Перенести вещи спасённых
Zapytaj o ochronę danych|Узнать о защите данных
Najpierw sprawdź dziedziniec|Сначала осмотреть двор
Zapisz dokładny kształt znaku|Зарисовать форму знака
Sprawdź urządzenie z Ronem|Проверить прибор с Роном
Odłącz toster od zasilania|Отключить тостер от питания
Porównaj sygnał z mapą|Сравнить сигнал с картой
Zapytaj Starszego o jego pracę|Расспросить Старшего о работе
Poproś o próbę pod nadzorem|Попросить пробу под наблюдением
Sprawdź zabezpieczenia portalu|Проверить защиту портала
Przejrzyj ostatnią klatkę nagrania|Изучить последний кадр записи
Zaznacz wątpliwości w raporcie|Отметить сомнения в докладе
Zabierz ze sobą latarnika|Взять фонарщика с собой
Obejrzyj stanowisko świadka|Осмотреть место свидетеля
Poproś Ariego o ocenę ryzyka|Попросить Ари оценить риск
Zapytaj Indigo o wolę mieszkańców|Спросить Индиго о воле жителей
Zaznacz stabilne punkty na mapie|Отметить устойчивые точки на карте
Zapytaj Severusa o zapas eliksirów|Спросить Северуса о запасе эликсиров
Poproś Weskera o izolującą opaskę|Попросить у Вескера защитную повязку
Zaproponuj dodatkowy transport medyczny|Предложить дополнительный медицинский транспорт
Sprawdź zapasowy regulator z Ronem|Проверить запасной регулятор с Роном
Poproś Ricka o drogę awaryjną|Попросить Рика подготовить запасной путь
Ustal znak dla patrolu|Договориться о сигнале для патруля
Zapytaj Eliasa o granice osłony|Узнать у Элиаса пределы защиты
Poproś o zapis decyzji Rady|Попросить записать решение Совета
Weź dodatkowy zestaw narzędzi|Взять дополнительный набор инструментов
Sprawdź łączność przed przejściem|Проверить связь перед переходом
Zbadaj drugi cień|Изучить вторую тень
Przedstaw się Lirze|Представиться Лире
Pomóż przygotować schron|Помочь подготовить убежище
Wysłuchaj dziecka do końca|Выслушать ребёнка до конца
Zapisz znak, nie dotykając go|Зарисовать знак, не касаясь его
Poszukaj pozostawionych wskazówek|Поискать оставленные подсказки
Porównaj zegar z własnym czasem|Сверить часы со своим временем
Poproś Lirę o bezpieczny skrót|Попросить Лиру показать безопасный путь
Sprawdź spis na okładce|Проверить оглавление
Porównaj plan ze znakiem dłoni|Сравнить план со знаком на ладони
Poszukaj śladów wyrwania strony|Поискать следы вырванной страницы
Zawołaj Starszego do pracowni|Позвать Старшего в мастерскую
Przekaż ostrzeżenie przez radio|Передать предупреждение по рации
Podaj strażnikowi wodę|Дать стражу воды
Pomóż lekarzom rozstawić osłony|Помочь врачам установить защиту
Poproś o równoległą ewakuację|Попросить начать параллельную эвакуацию
Przygotuj asekurację pod wieżą|Подготовить страховку под башней
Poproś patrol o zabezpieczenie podestu|Попросить патруль укрепить настил
Zapisz odczyt pierwszej kotwy|Записать показания первого якоря
Sprawdź powietrze przed zejściem|Проверить воздух перед спуском
Zaznacz suchą drogę odwrotu|Отметить сухой путь назад
Oświetl wodę z bezpiecznej odległości|Осветить воду с безопасного расстояния
Poproś Rona o zdalną diagnozę|Попросить Рона провести диагностику
Wyłącz przeciążony obwód|Отключить перегруженную цепь
Przekaż odczyt Thomasowi|Передать показания Томасу
Sprawdź stan schronu|Проверить состояние убежища
Poproś Lirę o rozmowę ze strażą|Попросить Лиру поговорить со стражей
Zapytaj operatora, czego się boi|Спросить оператора, чего он боится
Pokaż zapis ustaleń Rady|Показать запись решения Совета
Sprawdź mocowanie kotwy|Проверить крепление якоря
Pomóż Starszemu utrzymać narzędzia|Помочь Старшему удержать инструменты
Wyprowadź ludzi ze strefy pęknięcia|Вывести людей из зоны трещины
Poproś Weskera o odczyt znaku|Попросить Вескера исследовать знак
Potwierdź trzy odczyty przez radio|Подтвердить три показания по рации
Sprawdź, czy cisza nie jest iluzją|Проверить, не является ли тишина иллюзией
Pomóż Eliasowi osłonić odwrót|Помочь Элиасу прикрыть отступление
Zapisz położenie ogranicznika|Записать положение ограничителя
Poproś o potwierdzenie ze szpitala|Попросить подтверждение из больницы
Wysłuchaj decyzji mieszkańców|Выслушать решение жителей
Zostaw Lirze kanał łączności|Оставить Лире канал связи
Pomóż ostatnim pasażerom|Помочь последним пассажирам
Dodaj do raportu własne błędy|Добавить в доклад свои ошибки
Zapytaj o odbudowę miasta|Узнать о восстановлении города
Podziękuj Starszemu za pomoc|Поблагодарить Старшего за помощь
Zapisz wspomnienia przed snem|Записать воспоминания перед сном
Porównaj zapis z archiwum|Сравнить запись с архивом
Pokaż pieczęć Indigo|Показать печать Индиго
Poproś Ricka o sprawdzenie źródła|Попросить Рика проверить источник
Zabierz ze sobą dziennik|Взять дневник с собой
`.trim().split('\n').map(x=>x.split('|'));
chapter.rows.forEach((r,i)=>{
 const id='chapter'+String(i+1).padStart(2,'0'),next='chapter'+String(i+2).padStart(2,'0');
 const last=i===chapter.rows.length-1;
 const effect={trust:1};
 if([6,9,22,75].includes(i))effect.energy=1;
 if(i===29)effect.add='narzędzia';
 const a=alternatives[i];
 scenes[id]={title:r[0],text:r[2],ru:[r[1],r[3]],choices:last?[]:[{...choice(r[4],next,effect),ru:r[5]},{...choice(a[0],next,{energy:i%5===0?-1:0,trust:i%5===0?0:1}),ru:a[1]}],chapterComplete:last};
 // Optional detours: the short route skips the next scene, but forfeits its aid.
 if([1,9,12,31,36,39,50,72].includes(i))scenes[id].choices.push({label:'Idź dalej krótszą drogą',ru:'Продолжить коротким путём',next:'chapter'+String(i+3).padStart(2,'0'),energy:-1});
});
const ids=Object.keys(scenes);
ids.forEach((id,i)=>{scenes[id].number=i+1;scenes[id].art=i;});
const ui={
 pl:{kicker:'IMPERIUM · OPOWIEŚĆ INTERAKTYWNA',title:'Aurelia: Pogranicze',chapter:'Rozdział 1',reset:'Od początku',energy:'Siły',trust:'Zaufanie',decisions:'Decyzje',scene:'Scena',inventory:'Ekwipunek',empty:'Na razie nic nie masz.',journal:'Dziennik decyzji',newStory:'Twoja historia dopiero się zaczyna.',saved:'Postęp zapisywany na tym urządzeniu, osobno dla Twojego konta.',failed:'Nie udało się zapisać postępu. Po zamknięciu możesz stracić tę sesję.',confirm:'Rozpocząć od początku? Obecny postęp zostanie zastąpiony.',soon:'Aktualizacja wkrótce',wait:'To przerwa przed dalszą podróżą. Zachowaj zapis, aby wrócić do kolejnego rozdziału.',needs:'Potrzebujesz: ',light:'Potrzebujesz kryształu lub pryzmatu',knowledge:'Potrzebujesz pamięci lub instrukcji',sketch:'Szkic sceny',careful:'Dzięki waszemu zaufaniu drużyna przygotowuje dodatkową osłonę.',alone:'Drużyna ostrożnie sprawdza połączenie przed następnym krokiem.'},
 ru:{kicker:'IMPERIUM · ИНТЕРАКТИВНАЯ ИСТОРИЯ',title:'Аурелия: Пограничье',chapter:'Глава 1',reset:'С начала',energy:'Силы',trust:'Доверие',decisions:'Решения',scene:'Сцена',inventory:'Инвентарь',empty:'Пока здесь пусто.',journal:'Дневник решений',newStory:'Твоя история только начинается.',saved:'Прогресс сохраняется на этом устройстве отдельно для твоего аккаунта.',failed:'Не удалось сохранить прогресс. После закрытия эта сессия может быть потеряна.',confirm:'Начать с начала? Текущий прогресс будет заменён.',soon:'Обновление скоро',wait:'Это пауза перед дальнейшим путешествием. Сохрани прогресс, чтобы вернуться к следующей главе.',needs:'Нужно: ',light:'Нужен кристалл или призма',knowledge:'Нужны воспоминания или инструкция',sketch:'Зарисовка сцены',careful:'Благодаря вашему доверию команда готовит дополнительную защиту.',alone:'Команда осторожно проверяет связь перед следующим шагом.'}
};
const itemsRU={'podsłuch':'подслушанный разговор','obietnica':'обещание','nóż':'нож','mapa':'карта','woda':'вода','tryb':'шестерня','kryształ':'кристалл','latarnia':'фонарь','pamięć':'воспоминание','instrukcja':'инструкция','pryzmat':'призма','wspólna droga':'общий путь','przewód':'провод','iluzja':'сведения об иллюзии','narzędzia':'инструменты','uchodźcy':'сведения о беженцах','opaska':'повязка','ewakuacja':'план эвакуации','osłona':'защита','regulator':'регулятор'};
function localized(id,lang){const n=scenes[id],r=n.ru||chapter.ru[id];return {...n,title:lang==='ru'?r[0]:n.title,text:lang==='ru'?r[1]:n.text,choices:(n.choices||[]).map((c,i)=>({...c,label:lang==='ru'?(c.ru||r[2][i]):c.label}))};}
function fresh(){return {version:1,node:'wake',energy:5,trust:0,items:[],history:[]};}
function available(s,c){return (!c.requires||s.items.includes(c.requires))&&(!c.minTrust||s.trust>=c.minTrust)&&(!c.minEnergy||s.energy>=c.minEnergy)&&(!c.needsLight||s.items.some(x=>['kryształ','pryzmat'].includes(x)))&&(!c.needsKnowledge||s.items.some(x=>['pamięć','instrukcja'].includes(x)));}
function advance(s,index){const c=scenes[s.node]?.choices?.[index];if(!c||!available(s,c))return s;return {...s,node:c.next,energy:Math.max(0,Math.min(7,s.energy+(c.energy||0))),trust:Math.max(0,s.trust+(c.trust||0)),items:[...new Set(s.items.filter(x=>x!==c.remove).concat(c.add?[c.add]:[]))],history:s.history.concat({node:s.node,index,title:scenes[s.node].title,choice:c.label}).slice(-500)};}
function valid(s){return s?.version===1&&!!scenes[s.node]&&Number.isInteger(s.energy)&&s.energy>=0&&s.energy<=7&&Number.isInteger(s.trust)&&s.trust>=0&&Array.isArray(s.items)&&s.items.every(x=>typeof x==='string')&&Array.isArray(s.history)&&s.history.every(x=>typeof x.title==='string'&&typeof x.choice==='string');}
const esc=v=>String(v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function reason(s,c,lang){const t=ui[lang];if(c.requires&&!s.items.includes(c.requires))return t.needs+(lang==='ru'?itemsRU[c.requires]:c.requires);if(c.minTrust&&s.trust<c.minTrust)return t.needs+t.trust+' '+c.minTrust;if(c.minEnergy&&s.energy<c.minEnergy)return t.needs+t.energy+' '+c.minEnergy;if(c.needsLight&&!s.items.some(x=>['kryształ','pryzmat'].includes(x)))return t.light;return t.knowledge;}
function historyEntry(x,lang){const id=scenes[x.node]?x.node:ids.find(id=>scenes[id].title===x.title);if(!id)return [lang==='ru'?'Предыдущее решение':x.title,lang==='ru'?'Записано до обновления':x.choice];const n=localized(id,lang),index=Number.isInteger(x.index)?x.index:(scenes[id].choices||[]).findIndex(c=>c.label===x.choice);return [n.title,n.choices[index]?.label||(lang==='ru'?'Решение сохранено':x.choice)];}
function mount(container,account){
 if(!container||!account)return;
 const key='imperium_quest_v1:'+account,langKey=key+':language';let s=fresh(),saving=true,lang=null;
 try{const stored=JSON.parse(root.localStorage.getItem(key));if(valid(stored))s=stored;const l=root.localStorage.getItem(langKey);if(l==='ru'||l==='pl')lang=l;}catch(e){saving=false;}
 function save(){try{root.localStorage.setItem(key,JSON.stringify(s));root.localStorage.setItem(langKey,lang);saving=true;}catch(e){saving=false;}}
 function choose(l){lang=l;save();draw();}
 function draw(){
  container.setAttribute('lang',lang||'ru');
  if(!lang){container.innerHTML='<section class="quest quest-language"><span class="quest-kicker">AURELIA · АУРЕЛИЯ</span><h2>Выбери язык / Wybierz język</h2><p>Глава 1 · 125 сцен<br>Rozdział 1 · 125 scen</p><div class="quest-choices"><button class="quest-choice" data-quest-language="ru">Русский</button><button class="quest-choice" data-quest-language="pl">Polski</button></div></section>';container.querySelectorAll('[data-quest-language]').forEach(b=>b.onclick=()=>choose(b.dataset.questLanguage));return;}
  const n=localized(s.node,lang),t=ui[lang];
  const consequence=['chapter30','chapter65','chapter68'].includes(s.node)?`<p class="quest-consequence">${esc(s.trust>=12?t.careful:t.alone)}</p>`:'';
  container.innerHTML=`<section class="quest"><header class="quest-heading"><div><span class="quest-kicker">${t.kicker}</span><h2>${t.title}</h2><p>${t.chapter} · ${t.scene} ${n.number}/125</p></div><div class="quest-tools"><label class="quest-language-label">Язык / Język<select data-quest-language aria-label="Язык / Język"><option value="ru" ${lang==='ru'?'selected':''}>Русский</option><option value="pl" ${lang==='pl'?'selected':''}>Polski</option></select></label><button class="ghost" data-quest-reset>${t.reset}</button></div></header><div class="quest-stats"><span>${t.energy} <b>${s.energy}/7</b></span><span>${t.trust} <b>${s.trust}</b></span><span>${t.decisions} <b>${s.history.length}</b></span></div><article class="quest-scene" aria-live="polite"><div class="quest-art">${root.ImperiumSketch?root.ImperiumSketch.render(n.art,n.title,t.sketch):''}</div><span class="quest-kicker">${t.chapter}</span><h3 tabindex="-1">${esc(n.title)}</h3><p>${esc(n.text)}</p>${consequence}</article><div class="quest-choices">${n.choices.map((c,i)=>`<button class="quest-choice" data-quest-choice="${i}" ${available(s,c)?'':'disabled'}><span>${esc(c.label)}</span>${available(s,c)?'':`<small>${esc(reason(s,c,lang))}</small>`}</button>`).join('')}${n.chapterComplete?`<div class="quest-soon"><h3>${t.soon}</h3><p>${t.wait}</p></div>`:''}</div><details class="quest-details"><summary>${t.inventory} (${s.items.length})</summary><p>${s.items.length?s.items.map(x=>esc(lang==='ru'?(itemsRU[x]||x):x)).join(' · '):t.empty}</p></details><details class="quest-details"><summary>${t.journal}</summary>${s.history.length?`<ol>${s.history.map(x=>{const [title,label]=historyEntry(x,lang);return `<li><b>${esc(title)}</b> — ${esc(label)}</li>`}).join('')}</ol>`:`<p>${t.newStory}</p>`}</details><p class="quest-save">${saving?t.saved:t.failed}</p></section>`;
  container.querySelector('[data-quest-language]').onchange=e=>choose(e.target.value);
  container.querySelectorAll('[data-quest-choice]').forEach(b=>b.onclick=()=>{s=advance(s,Number(b.dataset.questChoice));save();draw();container.querySelector('h3').focus({preventScroll:true});container.scrollIntoView({block:'start',behavior:'auto'});});
  container.querySelectorAll('[data-quest-reset]').forEach(b=>b.onclick=()=>{if(!root.confirm(t.confirm))return;s=fresh();save();draw();});
 }draw();
}
const api={scenes,fresh,available,advance,valid,mount,localized,historyEntry,ui,itemsRU};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.ImperiumQuest=api;
})(typeof window==='object'?window:globalThis);
