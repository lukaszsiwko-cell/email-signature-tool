# Plan walidacji metodą Mom Test

## Rozważany pomysł

Krótki, lokalny raport tylko do odczytu, zestawiający zakres wydania z Jiry z powiązanymi PR-ami na GitHubie: wymagane PR-y, tickety bez PR-u i PR-y oczekujące na review. Źródło: `context/team/opportunity-map.md`. To hipoteza rozwiązania, nie zatwierdzona potrzeba.

## Hipotezy

- **Użytkownicy / role**: PM ustalający zakres wydania oraz dwóch developerów sprawdzających PR-y i wykonujących review. Nie wiadomo, czy inne osoby korzystają z tej samej kontroli.
- **Podejrzewane tarcie**: Codzienne ręczne ustalanie, które PR-y należą do wydania, niejasność co do zmian w kodzie powiązanych z ticketami oraz prośby o review podczas wydania.
- **Obecny sposób działania**: PM prosi dwóch developerów o sprawdzenie wymaganych PR-ów; PR-y w GitHubie są powiązane z ticketami w Jirze. Nie ustalono, jak dokładnie porównują dane ani ile to trwa.
- **Ryzykowne założenia**: Istniejące widoki Jiry lub GitHuba nie wystarczają; codzienna kontrola trwa istotnie długo lub powoduje błędy; relacje ticket–PR są wystarczająco kompletne; lista oczekujących PR-ów pomoże, jeśli developerom po prostu brakuje czasu na review.
- **Dotychczasowe dowody**: Relacja użytkownika o codziennej ręcznej kontroli, braku jasności co do ticketów i PR-ów oraz proszeniu dwóch developerów o review podczas wydania. Brak pomiarów, przykładów konkretnych wydań, zapisów rozmów i potwierdzenia od PM-a lub developerów.

## Krytyka

Nie pytaj, czy zespół chce raport. Sprawdź, co wydarzyło się podczas dwóch ostatnich wydań: kto ustalił zakres, z jakich ekranów korzystał, ile razy wracał do danych i czy niezgodność miała konsekwencje. Oddziel czas potrzebny na porównanie Jiry z GitHubem od czasu samego review: drugi problem może wynikać z dostępności ludzi lub późnego ustalenia priorytetów. Sprawdź najpierw istniejące widoki, filtry i sposób planowania review. Jeśli dają poprawną odpowiedź równie szybko albo kontrola nie generuje mierzalnego kosztu, nowy raport nie jest uzasadniony.

## Scenariusz rozmowy (20–30 minut)

Porozmawiaj oddzielnie z PM-em i dwoma developerami. Proś o ostatni rzeczywisty przypadek, a nie opinie o rozwiązaniu; jeśli rozmówca nie uczestniczył w wydaniu, oznacz to i nie licz odpowiedzi jako potwierdzenia. Pytania pomocnicze zadawaj tylko wtedy, gdy pasują do historii.

1. **Kontekst (2 min)**: Jaka była Twoja rola przy ostatnim wydaniu i jak często wykonujesz te czynności?
2. **Ostatnia historia (3 min)**: Opowiedz krok po kroku, jak ostatnio ustalaliście, które zmiany muszą wejść do wydania. Od czego zaczęliście?
3. **Źródła (2 min)**: Co otworzyłeś/otworzyłaś w Jirze i GitHubie, żeby sprawdzić zakres i PR-y? Co było zapisane poza tymi narzędziami?
4. **Powiązania (2 min)**: Przypominasz sobie ostatni ticket, przy którym nie było jasne, czy istnieje zmiana w kodzie? Jak to ustaliliście? Jeśli nie było takiego przypadku, co pozwoliło to łatwo rozpoznać?
5. **Obejścia (2 min)**: Jak przekazaliście sobie wynik kontroli i czy ktoś musiał coś sprawdzać ponownie? Pokaż zanonimizowany przykład, jeśli możesz.
6. **Koszt (3 min)**: Ile czasu zajęła sama kontrola w tym przypadku, a ile czekanie na decyzję lub review? Skąd to oszacowanie?
7. **Skutki (2 min)**: Czy podczas tego wydania wykryliście brakujący PR, rozbieżny status albo opóźnienie? Co się wtedy wydarzyło? Jeśli nie, czy kontrola przebiegła bez problemu?
8. **Review (3 min)**: Kiedy i przez kogo dwaj developerzy dostali prośbę o review wymaganych PR-ów? Co robili wtedy i co zdecydowało o kolejności?
9. **Alternatywy (3 min)**: Jakich istniejących widoków, filtrów, checklist lub ustaleń próbowaliście przy poprzednich wydaniach? Co się sprawdziło, a co nie?
10. **Decyzja i zamknięcie (2 min)**: Kiedy ostatnio zmieniliście sposób przygotowania wydania i dlaczego? Czy mogę później wrócić z pytaniem lub zobaczyć zanonimizowane przykłady z dwóch ostatnich wydań?

## Ankieta

Wyślij ją tylko osobom biorącym udział w ustalaniu zakresu lub sprawdzaniu PR-ów. Nie traktuj wyników z trzech osób jako statystycznego badania; porównaj je z opowiedzianymi historiami.

1. **Pytanie przesiewowe**: Czy uczestniczyłeś/uczestniczyłaś w przygotowaniu co najmniej jednego wydania w ostatnich dwóch miesiącach? `Tak, zakres / Tak, PR-y lub review / Nie` (przy „Nie” zakończ ankietę).
2. Ile razy w ostatnich dwóch miesiącach ręcznie porównywałeś/porównywałaś zakres w Jirze z PR-ami w GitHubie? `0 / 1–2 / 3–5 / 6–10 / ponad 10 / nie pamiętam`.
3. Ile trwało ostatnie takie porównanie, bez czasu na samo review? `Nie robiłem/am / do 5 min / 6–15 min / 16–30 min / ponad 30 min / nie pamiętam`.
4. Jak ustalałeś/ustalałaś wynik ostatniej kontroli? `Widok lub filtr w Jirze / Widok lub filtr w GitHubie / Ręczne porównanie obu / Lista lub arkusz / Rozmowa / Inaczej (jak?)`.
5. Opisz ostatni przypadek, gdy trudno było ustalić, czy ticket miał wymagany PR, albo wpisz „nie było takiego przypadku”. **Odpowiedź otwarta.**
6. W ilu z dwóch ostatnich wydań brak informacji o PR-ach opóźnił decyzję lub spowodował ponowną pracę? `0 / 1 / 2 / nie wiem`; jeśli więcej niż zero, opisz, co się stało. **Odpowiedź otwarta.**
7. Kiedy przy ostatnim wydaniu poproszono Cię o review wymaganych PR-ów? `Nie dotyczy / ponad dzień przed wydaniem / tego samego dnia / podczas wydania / nie pamiętam`.
8. Co podczas ostatniego wydania najbardziej ograniczało terminowe review? `Nie było problemu / dostępność reviewerów / późne zgłoszenie / niejasny priorytet / brak kontekstu / inna przyczyna (jaka?) / nie wiem`.

## Kryteria decyzji

Zapisz osobno historię każdej osoby, czas samego porównania i opóźnienie review; zweryfikuj przykłady na zanonimizowanych danych z dwóch wydań, jeśli uczestnicy wyrażą zgodę.

- **Budować wąski pierwszy wariant**: Co najmniej 2 z 3 osób (PM i dwaj developerzy) niezależnie opiszą konkretny przypadek ręcznego porównywania Jiry i GitHuba w ostatnich dwóch wydaniach, a przykład pokaże co najmniej 10 minut takiej pracy dziennie przez co najmniej 3 dni jednego wydania albo co najmniej 30 minut na wydanie. Istniejący widok lub filtr nie daje poprawnej odpowiedzi w 5 minut.
- **Zawęzić zakres**: Historie potwierdzą koszt tylko ustalania wymaganych PR-ów albo tylko brakujących powiązań; rozważ tylko tę jedną listę. Jeśli główną przeszkodą jest dostępność reviewerów, nie dodawaj funkcji review do raportu.
- **Na razie nie budować**: Mniej niż 2 z 3 osób potwierdzi ostatni konkretny przypadek albo nie uda się wykazać mierzalnego kosztu czy skutku błędu. Brak przykładów nie jest potwierdzeniem hipotezy.
- **Najpierw użyć istniejącego narzędzia lub procesu**: Widok/filtr Jiry lub GitHuba daje poprawną odpowiedź w 5 minut, albo wcześniejsze wyznaczenie reviewerów i terminu rozwiązuje obserwowane opóźnienia. Sprawdź to podczas następnego wydania przed ponowną oceną potrzeby budowy.
