# Mapa możliwości

## Kontekst

- **Projekt / kontekst**: Przygotowanie wydań; PM wskazuje zakres wydania, a dwóch developerów sprawdza wymagane PR-y. PR-y na GitHubie są powiązane z ticketami w Jirze.
- **Ograniczenie danych**: Pierwsza wersja na danych przykładowych, lokalnie i tylko do odczytu. Przed użyciem rzeczywistych danych firmy trzeba ograniczyć dostęp do informacji z Jiry i GitHuba oraz ustalić, czy potrzebny jest ślad dostępu.
- **Data**: 2026-10-12

## Mapa

| Sygnał | Istniejąca / domyślna odpowiedź | Cienkie uzupełnienie | Pierwsza użyteczna wersja | Ryzyko danych | Kierunek, jeśli wartościowe |
| --- | --- | --- | --- | --- | --- |
| Codzienne ręczne ustalanie PR-ów wymaganych do wydania | Zakres w Jirze, PR-y w GitHubie | Lista wymaganych PR-ów z odnośnikami i stanem | Lokalny raport z przykładowych danych | Mock; później dane firmowe | Narzędzie wewnętrzne |
| Niejasne, które tickety mają zmiany w kodzie | Powiązania Jira–GitHub; najpierw sprawdzić widoki Jiry | Oznaczenie ticketów z PR-em i bez niego | Kolumna w tym samym raporcie | Mock; później dane firmowe | Funkcja raportu lub brak budowy |
| Review wymaganych PR-ów zlecane dwóm developerom podczas wydania | Wcześniejsze ustalenie priorytetów i reviewerów | Wskazanie PR-ów oczekujących na review | Lista oczekujących w tym samym raporcie | Mock; później dane firmowe | Najpierw zmiana procesu |

## Rekomendowany pierwszy kandydat

- **Kandydat**: Gotowość release'u.
- **Czyta**: Przykładowy zakres wydania z Jiry oraz powiązane PR-y i ich stan z GitHuba.
- **Zwraca**: Krótki raport wymaganych PR-ów, ticketów bez powiązanego PR-u i PR-ów czekających na review; linki prowadzą do systemów źródłowych.
- **Nie robi**: Nie zmienia statusów, nie przypisuje reviewerów, nie zastępuje Jiry ani GitHuba i nie podejmuje decyzji o wydaniu.
- **Ryzyko danych**: Mock, lokalnie i tylko do odczytu; dla realnych danych najpierw ograniczyć dostęp zgodnie z uprawnieniami do ticketów i PR-ów oraz rozważyć audyt dostępu.
- **Kierunek, jeśli wartościowe**: Wąskie narzędzie wewnętrzne wspierające decyzję o wydaniu.

## Dlaczego ten kandydat

Codzienna kontrola zakresu wydania łączy dwa źródła i pracę PM-a oraz developerów; ma wyraźny koszt ręcznego porównywania. Jeden odczytowy raport może też sprawdzić, czy brak informacji o zmianach w kodzie faktycznie wymaga narzędzia, czy wystarczy istniejący widok Jiry. Braku czasu dwóch developerów na review sam raport nie rozwiąże: trzeba ustalić, czy problemem jest późne zgłaszanie PR-ów, czy rzeczywista dostępność reviewerów.

## Następny kierunek, jeśli wartościowe

Wybrano weryfikację problemu na przykładach ostatnich wydań i rozmowę z PM-em oraz developerami o tym, co rzeczywiście sprawdzali i dlaczego review następowało dopiero podczas wydania: `/10x-mom-test`, a po potwierdzeniu potrzeby `/10x-shape`. Nie uruchamiać tych kroków automatycznie.
